import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient } from "../../../src/db/client.js";
import { resolveGhostcrabConfig } from "../../../src/config/env.js";
import { callToolJson, listToolNames, withMcpStdioClient } from "../../helpers/mcp-stdio.js";
import { loadMcpDataset } from "../../helpers/mcp-datasets.js";

const SQLITE_TEST_DIR = mkdtempSync(join(tmpdir(), "ghostcrab-server-traces-"));
const SQLITE_TEST_DB_PATH = join(SQLITE_TEST_DIR, "server-traces.sqlite");

process.env.GHOSTCRAB_MINDBRAIN_URL =
  process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";
process.env.GHOSTCRAB_SQLITE_PATH = SQLITE_TEST_DB_PATH;
process.env.GHOSTCRAB_EMBEDDINGS_MODE = "disabled";

const config = resolveGhostcrabConfig(process.env);
const database = createDatabaseClient(config);

describe.sequential("MCP trace capture", () => {
  beforeAll(async () => {
    const reachable = await database.ping();
    if (!reachable) {
      throw new Error(
        `Integration MindBrain backend is unreachable at ${config.mindbrainUrl}.`
      );
    }
  });

  afterAll(async () => {
    await database.close();
    rmSync(SQLITE_TEST_DIR, { force: true, recursive: true });
  });

  it("captures comparable traces for tools/list and call_tool operations", async () => {
    await loadMcpDataset(database, "active_project");

    await withMcpStdioClient("trace-capture", async ({ client, getTrace }) => {
      await listToolNames(client, getTrace());
      await callToolJson(
        client,
        "ghostcrab_status",
        { agent_id: "agent:self" },
        "ghostcrab_status",
        getTrace()
      );
      await callToolJson(
        client,
        "ghostcrab_search",
        {
          query: "missing API token",
          schema_id: "demo:test:task",
          mode: "bm25"
        },
        "ghostcrab_search",
        getTrace()
      );

      const trace = getTrace();
      expect(trace).toHaveLength(3);
      expect(trace[0]).toMatchObject({
        kind: "list_tools",
        name: "tools/list",
        ok: true
      });
      expect(trace[1]).toMatchObject({
        kind: "call_tool",
        name: "ghostcrab_status",
        ok: true,
        response: {
          ok: true,
          tool: "ghostcrab_status",
          runtime: expect.any(Object)
        }
      });
      expect(trace[2]).toMatchObject({
        kind: "call_tool",
        name: "ghostcrab_search",
        ok: true,
        request: {
          query: "missing API token"
        },
        response: {
          ok: true,
          tool: "ghostcrab_search"
        }
      });

      for (const record of trace) {
        expect(record.duration_ms).toEqual(expect.any(Number));
      }
    });
  });
});
