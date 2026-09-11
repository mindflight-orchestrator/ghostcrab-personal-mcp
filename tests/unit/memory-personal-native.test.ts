/** Native MindBrain HTTP + SQLite. Never points at an existing user database. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  type DatabaseClient
} from "../../src/db/client.js";
import { resolveGhostcrabConfig } from "../../src/config/env.js";
import { MemoryStore, bindingFromEnvironment } from "../../src/memory/store.js";

const binary = process.env.MINDBRAIN_TEST_BINARY;
describe.skipIf(!binary)(
  "Personal memory against a disposable native engine",
  () => {
    let child: ChildProcess,
      directory: string,
      db: DatabaseClient,
      store: MemoryStore;
    const binding = bindingFromEnvironment({
      MINDBRAIN_MEMORY_ACTOR: "a".repeat(64),
      MINDBRAIN_MEMORY_TENANT: "synthetic",
      MINDBRAIN_MEMORY_WRITE: "true"
    });
    const source = { session_id: "one", source_id: "synthetic-test" };
    const remember = (id: string, content: string, extra = {}) =>
      store.execute({
        operation: "remember",
        record_id: id,
        content,
        idempotency_key: "remember-key-" + id,
        source,
        ...extra
      });
    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), "personal-memory-test-"));
      const net = createServer();
      await new Promise<void>((resolve) => net.listen(0, "127.0.0.1", resolve));
      const port = (net.address() as { port: number }).port;
      await new Promise<void>((resolve) => net.close(() => resolve()));
      child = spawn(
        binary!,
        [
          "--db",
          join(directory, "synthetic.sqlite"),
          "--addr",
          `127.0.0.1:${port}`
        ],
        { stdio: "ignore" }
      );
      const url = `http://127.0.0.1:${port}`;
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(url + "/health")).ok) {
            ready = true;
            break;
          }
        } catch {
          /* Wait for this test-owned engine to bind. */
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!ready) throw Error("Synthetic engine failed to start");
      db = createDatabaseClient(
        {
          ...resolveGhostcrabConfig(),
          mindbrainUrl: url,
          mindbrainHttpTimeoutMs: 5000
        },
        { requireTransactions: true }
      );
      store = new MemoryStore(db, binding);
    }, 15000);
    afterAll(async () => {
      await db?.close();
      if (child?.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise<void>((resolve) =>
          child.once("exit", () => resolve())
        );
      }
      if (directory) await rm(directory, { recursive: true, force: true });
    });
    it("reports the native transaction/FTS contract", async () => {
      expect(await store.execute({ operation: "status" })).toMatchObject({
        contract_version: "personal-memory/v1",
        embeddings: false
      });
    });
    it("persists between clients and enforces scope and strict inputs", async () => {
      await remember("language", "Répondre en français", {
        kind: "preference",
        project: "hermes"
      });
      const next = new MemoryStore(db, binding);
      expect(
        (
          await next.execute({
            operation: "recall",
            query: "français",
            project: "hermes"
          })
        ).results[0].content
      ).toBe("Répondre en français");
      const other = new MemoryStore(db, { ...binding, workspace: "other" });
      expect(
        (await other.execute({ operation: "recall", query: "" })).status
      ).toBe("empty");
      await expect(
        store.execute({
          operation: "get",
          record_id: "language",
          workspace_id: "other"
        })
      ).rejects.toThrow();
    });
    it("retries across sessions without duplication and refuses changed payload", async () => {
      const first = await remember("retry", "Unique operation");
      const replay = await remember("retry", "Unique operation", {
        source: { ...source, session_id: "restarted" }
      });
      expect(replay).toEqual({ ...first, replayed: true });
      await expect(remember("retry", "Changed")).rejects.toMatchObject({
        code: "idempotency_conflict"
      });
    });
    it("two concurrent corrections have exactly one winner and no stale search text", async () => {
      await remember("race", "oldword");
      const update = (key: string) =>
        store.execute({
          operation: "update",
          record_id: "race",
          expected_version: 1,
          content: "newword",
          idempotency_key: key,
          source
        });
      const results = await Promise.allSettled([
        update("concurrent-one"),
        update("concurrent-two")
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { code: "version_conflict" }
      });
      expect(
        (await store.execute({ operation: "recall", query: "oldword" })).status
      ).toBe("empty");
      expect(
        (await store.execute({ operation: "recall", query: "newword" }))
          .results[0].version
      ).toBe(2);
      expect(
        (
          await store.execute({
            operation: "get",
            record_id: "race",
            history: true
          })
        ).results
      ).toHaveLength(2);
    });
    it("candidates, checkpoints, projects and temporal windows are filtered before ranking", async () => {
      await remember("candidate", "hiddenword", { candidate: true });
      await remember("checkpoint", "resumecontent", { kind: "checkpoint" });
      await remember("expired", "expiredword", { valid_until: "2000-01-01" });
      expect(
        (
          await store.execute({
            operation: "recall",
            query: "hiddenword expiredword resumecontent"
          })
        ).status
      ).toBe("empty");
      expect(
        (await store.execute({ operation: "recall", kinds: ["checkpoint"] }))
          .results[0].record_id
      ).toBe("checkpoint");
      expect(
        (
          await store.execute({
            operation: "recall",
            query: "français",
            project: "different"
          })
        ).status
      ).toBe("empty");
      await expect(
        remember("bad-date", "no", { valid_until: "2026-02-31" })
      ).rejects.toThrow();
    });
    it("related facts are scoped and recall output is bounded", async () => {
      await remember("neighbor", "linked context");
      await remember("anchor", "anchorword", {
        related_record_ids: ["neighbor"]
      });
      const result = await store.execute({
        operation: "recall",
        query: "anchorword"
      });
      expect(
        result.results.map((v: { record_id: string }) => v.record_id)
      ).toEqual(["anchor", "neighbor"]);
      await expect(
        remember("badlink", "no", { related_record_ids: ["missing"] })
      ).rejects.toMatchObject({ code: "related_record_unavailable" });
      for (let i = 0; i < 7; i++)
        await remember("long" + i, "longword ".repeat(1000));
      expect(
        JSON.stringify(
          await store.execute({
            operation: "recall",
            query: "longword",
            limit: 12
          })
        ).length
      ).toBeLessThan(8000);
    });
    it("retracts immediately and purge removes archived/search copies but keeps content-free receipts", async () => {
      await remember("erase", "eraseme");
      const mutation = {
        operation: "forget",
        record_id: "erase",
        expected_version: 1,
        idempotency_key: "forget-erase-key",
        source
      };
      expect((await store.execute(mutation)).status).toBe("retracted");
      expect(
        (await store.execute({ operation: "recall", query: "eraseme" })).status
      ).toBe("empty");
      expect(
        (
          await store.execute({
            ...mutation,
            expected_version: 2,
            purge: true,
            idempotency_key: "purge-erase-key"
          })
        ).status
      ).toBe("purged");
      expect(
        (
          await store.execute({
            operation: "get",
            record_id: "erase",
            history: true
          })
        ).results
      ).toHaveLength(0);
      expect((await store.execute(mutation)).replayed).toBe(true);
      expect(
        await db.query(
          "SELECT * FROM search_fts WHERE search_fts MATCH 'eraseme'"
        )
      ).toHaveLength(0);
      expect(
        await db.query(
          "SELECT * FROM agent_facts WHERE schema_id='agent:memory-receipt' AND content LIKE '%eraseme%'"
        )
      ).toHaveLength(0);
    });
    it("a receipt failure rolls back fact, archive and FTS together", async () => {
      await remember("rollback", "beforeword");
      const failing: DatabaseClient = {
        ...db,
        transaction: (operation) =>
          db.transaction((q) =>
            operation({
              query: async (sql, params) => {
                if (params?.includes("agent:memory-receipt"))
                  throw Error("synthetic receipt failure");
                return q.query(sql, params);
              }
            })
          )
      };
      await expect(
        new MemoryStore(failing, binding).execute({
          operation: "update",
          record_id: "rollback",
          content: "afterword",
          expected_version: 1,
          idempotency_key: "rollback-test-key",
          source
        })
      ).rejects.toThrow("synthetic receipt failure");
      expect(
        (
          await store.execute({
            operation: "get",
            record_id: "rollback",
            history: true
          })
        ).results
      ).toHaveLength(1);
      expect(
        (await store.execute({ operation: "recall", query: "beforeword" }))
          .results[0].version
      ).toBe(1);
      expect(
        (await store.execute({ operation: "recall", query: "afterword" }))
          .status
      ).toBe("empty");
    });
    it("purge and recreation cannot reuse a stale version", async () => {
      await remember("aba", "original");
      await store.execute({
        operation: "forget",
        record_id: "aba",
        expected_version: 1,
        purge: true,
        idempotency_key: "purge-aba-key",
        source
      });
      const recreated = await remember("aba", "new", {
        idempotency_key: "recreate-aba-key"
      });
      expect(recreated.version).toBe(3);
      await expect(
        store.execute({
          operation: "update",
          record_id: "aba",
          expected_version: 1,
          content: "stale",
          idempotency_key: "stale-aba-key",
          source
        })
      ).rejects.toMatchObject({ code: "version_conflict" });
    });
    it("read-only binding rejects mutations", async () => {
      await expect(
        new MemoryStore(db, { ...binding, writable: false }).execute({
          operation: "remember",
          record_id: "no",
          content: "no",
          source,
          idempotency_key: "readonly-key"
        })
      ).rejects.toMatchObject({ code: "write_forbidden" });
    });
  }
);
