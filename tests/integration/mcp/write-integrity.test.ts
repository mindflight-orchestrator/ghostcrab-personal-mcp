import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveGhostcrabConfig } from "../../../src/config/env.js";
import {
  createDatabaseClient,
  type DatabaseClient
} from "../../../src/db/client.js";
import { callToolJson, withMcpStdioClient } from "../../helpers/mcp-stdio.js";

// This release gate owns its backend and SQLite. Missing prerequisites fail;
// it never silently skips or connects to the user's active database.
describe.sequential("write integrity through native MCP", () => {
  let child: ChildProcess;
  let directory: string;
  let database: DatabaseClient;
  let url: string;
  let log = "";
  const workspace = "integrity-mcp";
  const node = {
    id: "session:a",
    node_type: "Session",
    label: "Architecture session",
    properties: {
      scenario_id: "session-reuse",
      synthetic: true,
      completed_at: "2026-09-14T09:30:00Z",
      business_result: { accepted: true }
    }
  };
  const edge = { source: "session:a", target: "session:b", label: "REUSES" };
  const options = () => ({
    serverEnv: {
      GHOSTCRAB_MINDBRAIN_URL: url,
      GHOSTCRAB_SQLITE_PATH: join(directory, "integrity.sqlite")
    }
  });
  const snapshot = async () => {
    const output: Record<string, unknown> = {};
    for (const table of [
      "workspaces",
      "ontologies",
      "graph_entity",
      "graph_relation",
      "entities_raw",
      "relations_raw"
    ]) {
      output[table] = await database.query(
        `SELECT * FROM ${table} ORDER BY rowid`
      );
    }
    return output;
  };

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ghostcrab-native-integrity-"));
    const reservation = createServer();
    await new Promise<void>((done, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", done);
    });
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((done) => reservation.close(() => done()));
    url = `http://127.0.0.1:${port}`;
    const binary =
      process.env.MINDBRAIN_TEST_BINARY ??
      resolve("cmd/backend/zig-out/bin/ghostcrab-backend");
    child = spawn(
      binary,
      [
        "--db",
        join(directory, "integrity.sqlite"),
        "--addr",
        `127.0.0.1:${port}`
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    child.stdout?.on("data", (data) => {
      log += String(data);
    });
    child.stderr?.on("data", (data) => {
      log += String(data);
    });
    let spawnError: Error | undefined;
    child.on("error", (error) => {
      spawnError = error;
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null)
        throw new Error(`Test backend exited: ${log}`);
      try {
        ready = (
          await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })
        ).ok;
      } catch {
        /* still starting */
      }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 50));
    }
    if (!ready) throw new Error(`Test backend unavailable: ${log}`);
    database = createDatabaseClient(
      { ...resolveGhostcrabConfig(), mindbrainUrl: url },
      { requireTransactions: true }
    );
  }, 15_000);

  afterAll(async () => {
    await database?.close();
    if (child?.pid && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("keeps learned metadata searchable after linking, reindexing and a new MCP session", async () => {
    await withMcpStdioClient(
      "integrity-write",
      async ({ client }) => {
        for (const id of [edge.source, edge.target]) {
          expect(
            await callToolJson(client, "ghostcrab_learn", {
              workspace_id: workspace,
              node: { ...node, id }
            })
          ).toMatchObject({ ok: true });
        }
        const before = await database.query(
          "SELECT * FROM entities_raw WHERE workspace_id = ? ORDER BY entity_id",
          [workspace]
        );
        expect(
          await callToolJson(client, "ghostcrab_learn", {
            workspace_id: workspace,
            edge
          })
        ).toMatchObject({ ok: true });
        expect(
          await callToolJson(client, "ghostcrab_graph_reindex", {
            workspace_id: workspace
          })
        ).toMatchObject({ ok: true, backend: "mindbrain/reindex/graph" });
        expect(
          await database.query(
            "SELECT * FROM entities_raw WHERE workspace_id = ? ORDER BY entity_id",
            [workspace]
          )
        ).toEqual(before);
      },
      options()
    );
    await withMcpStdioClient(
      "integrity-read",
      async ({ client }) => {
        const before = await snapshot();
        const result = await callToolJson(client, "ghostcrab_graph_search", {
          workspace_id: workspace,
          query: "",
          metadata_filters: { scenario_id: "session-reuse", synthetic: true }
        });
        expect(result).toMatchObject({ ok: true, returned: 2 });
        for (const row of result.results as Array<Record<string, unknown>>)
          expect(row.metadata).toMatchObject(node.properties);
        expect(await snapshot()).toEqual(before);
      },
      options()
    );
  });

  it("rolls back a failed learn call through the real SQL session", async () => {
    await withMcpStdioClient(
      "integrity-learn-failure",
      async ({ client }) => {
        const before = await snapshot();
        // Native SQL requests use distinct connections: use a persistent trigger
        // on this disposable database so the MCP transaction observes it.
        await database.query(`CREATE TRIGGER reject_learn_persistent BEFORE INSERT ON relations_raw
        BEGIN SELECT RAISE(ABORT, 'injected native learn failure'); END`);
        try {
          const result = await callToolJson(client, "ghostcrab_learn", {
            workspace_id: workspace,
            node: { ...node, properties: { overwritten: true } },
            edge: { ...edge, target: "new-endpoint" }
          });
          expect(result.ok).toBe(false);
          expect(await snapshot()).toEqual(before);
        } finally {
          await database.query("DROP TRIGGER reject_learn_persistent");
        }
      },
      options()
    );
  });

  it("rolls back a failed workspace reset through MCP", async () => {
    await withMcpStdioClient(
      "integrity-reset-failure",
      async ({ client }) => {
        const before = await snapshot();
        await database.query(`CREATE TRIGGER reject_cleanup BEFORE DELETE ON graph_entity
        BEGIN SELECT RAISE(ABORT, 'injected native cleanup failure'); END`);
        try {
          expect(
            (
              await callToolJson(client, "ghostcrab_workspace_reset", {
                workspace_id: workspace,
                confirm: true
              })
            ).ok
          ).toBe(false);
          expect(await snapshot()).toEqual(before);
        } finally {
          await database.query("DROP TRIGGER reject_cleanup");
        }
      },
      options()
    );
  });
});
