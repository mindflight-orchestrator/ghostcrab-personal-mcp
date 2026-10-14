import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRealSqlite,
  loadSqliteDatabase
} from "../helpers/real-sqlite.js";
import { createToolContext } from "../helpers/tool-context.js";
import {
  recordGetTool,
  recordDeleteTool,
  RecordDeleteInput
} from "../../src/tools/facets/records.js";
import { upsertTool } from "../../src/tools/facets/upsert.js";

import { runStandaloneFactDelete } from "../../src/db/standalone-mindbrain.js";
vi.mock("../../src/db/standalone-mindbrain.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/db/standalone-mindbrain.js")
  >()),
  runStandaloneFactDelete: vi.fn()
}));

describe.skipIf(!loadSqliteDatabase())(
  "exact business record access and version conflicts",
  () => {
    let fixture: ReturnType<typeof createRealSqlite>;
    let context: ReturnType<typeof createToolContext>;
    const identity = {
      workspace_id: "app-fixture",
      schema_id: "app:task",
      id: "task-42"
    };
    beforeEach(() => {
      fixture = createRealSqlite();
      context = createToolContext(fixture.database);
      fixture.sqlite
        .prepare(
          "INSERT INTO agent_facts(id,workspace_id,schema_id,content,facets_json) VALUES(?,?,?,?,?)"
        )
        .run(
          identity.id,
          identity.workspace_id,
          identity.schema_id,
          "Prepare review",
          '{"record_id":"T-42","status":"todo"}'
        );
    });
    afterEach(() => fixture.sqlite.close());

    it("reads only an exact scoped row and includes its version", async () => {
      expect(
        (await recordGetTool.handler(identity, context)).structuredContent
      ).toMatchObject({
        ok: true,
        found: true,
        row: {
          ...identity,
          version: 1,
          active: true,
          facets: { record_id: "T-42", status: "todo" }
        }
      });
      for (const scope of [
        { workspace_id: "other" },
        { schema_id: "app:prospect" },
        { id: "missing" }
      ])
        expect(
          (await recordGetTool.handler({ ...identity, ...scope }, context))
            .structuredContent
        ).toMatchObject({ found: false, row: null });
    });

    it("rejects a stale edit before archive and leaves all state unchanged", async () => {
      const input = {
        workspace_id: identity.workspace_id,
        schema_id: identity.schema_id,
        match: { id: identity.id },
        set_facets: { status: "done" },
        expected_version: 9
      };
      expect(
        (await upsertTool.handler(input, context)).structuredContent
      ).toMatchObject({ ok: false, error: { code: "version_conflict" } });
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM agent_facts").get()
      ).toEqual({ n: 1 });
      expect(
        (await recordGetTool.handler(identity, context)).structuredContent
      ).toMatchObject({ row: { version: 1, facets: { status: "todo" } } });
      expect(
        (await upsertTool.handler({ ...input, expected_version: 1 }, context))
          .structuredContent
      ).toMatchObject({ ok: true, id: identity.id, version: 2 });
      expect(
        (await upsertTool.handler({ ...input, expected_version: 1 }, context))
          .structuredContent
      ).toMatchObject({ ok: false, error: { code: "version_conflict" } });
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM agent_facts").get()
      ).toEqual({ n: 2 });
    });

    it("forwards exact deletion identity and reports native idempotent absence", async () => {
      vi.mocked(runStandaloneFactDelete).mockResolvedValue({
        ok: true,
        found: false,
        deleted: false
      });
      expect(
        (
          await recordDeleteTool.handler(
            { ...identity, expected_version: 3 },
            context
          )
        ).structuredContent
      ).toMatchObject({ ok: true, found: false, deleted: false });
      expect(runStandaloneFactDelete).toHaveBeenLastCalledWith(
        expect.objectContaining({ ...identity, expected_version: 3 })
      );
    });
    it("preserves a native version conflict as a stable MCP error", async () => {
      vi.mocked(runStandaloneFactDelete).mockRejectedValue(
        new Error("HTTP 409", {
          cause: {
            body: JSON.stringify({ error: { code: "version_conflict" } })
          }
        })
      );
      expect(
        (
          await recordDeleteTool.handler(
            { ...identity, expected_version: 3 },
            context
          )
        ).structuredContent
      ).toMatchObject({ ok: false, error: { code: "version_conflict" } });
    });
    it.each([undefined, "not JSON", '{"error":{"code":"other"}}'])(
      "does not turn a transport failure into success (body %s)",
      async (body) => {
        vi.mocked(runStandaloneFactDelete).mockRejectedValue(
          new Error("HTTP failure", { cause: { body } })
        );
        expect(
          (
            await recordDeleteTool.handler(
              { ...identity, expected_version: 3 },
              context
            )
          ).structuredContent
        ).toMatchObject({ ok: false });
      }
    );
    it("requires exact deletion identity and a positive version", () => {
      expect(() => RecordDeleteInput.parse(identity)).toThrow();
      expect(() =>
        RecordDeleteInput.parse({ ...identity, expected_version: 0 })
      ).toThrow();
      expect(() =>
        RecordDeleteInput.parse({
          ...identity,
          expected_version: 1,
          ids: ["other"]
        })
      ).toThrow();
    });
  }
);
