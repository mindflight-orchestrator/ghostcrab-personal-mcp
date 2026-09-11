import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createDatabaseClient,
  type DatabaseClient
} from "../../src/db/client.js";
import { resolveGhostcrabConfig } from "../../src/config/env.js";
import { ensureFactsFtsSync } from "../../src/db/facets-fts-sync.js";
import { setFactsFtsReady } from "../../src/runtime/facets-fts-state.js";
import { createToolContext } from "../helpers/tool-context.js";
import { packTool } from "../../src/tools/pragma/pack.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { combinedSearchTool } from "../../src/tools/search/combined-search.js";

const url = process.env.GHOSTCRAB_SEARCH_TEST_MINDBRAIN_URL;
describe.sequential.runIf(Boolean(url))(
  "search handoff on native SQLite",
  () => {
    let db: DatabaseClient;
    let context: ReturnType<typeof createToolContext>;
    const args = {
      workspace_id: "default",
      agent_id: "handoff",
      scope: "default:handoff",
      query: "What currently blocks launch and which QA findings remain open?"
    };
    beforeAll(async () => {
      vi.stubEnv("GHOSTCRAB_MINDBRAIN_URL", url!);
      db = createDatabaseClient(resolveGhostcrabConfig());
      context = createToolContext(db);
      await db.query(`INSERT INTO projections(id,agent_id,scope,proj_type,content,status) VALUES
      ('handoff-plan','handoff','default:handoff','GOAL','Launch method','active'),
      ('handoff-global','handoff',NULL,'GOAL','Global method','active'),
      ('handoff-expired','handoff','default:expired','GOAL','Old','active')`);
      await db.query(
        "UPDATE projections SET expires_at_unix=1 WHERE id='handoff-expired'"
      );
      await db.query(`INSERT INTO agent_facts(id,schema_id,content,workspace_id,doc_id) VALUES
      ('handoff-fact','handoff:accents','échéance dépassée','default',999011)`);
      await db.query(
        "INSERT INTO agent_facts(id,schema_id,content,workspace_id,doc_id) VALUES ('handoff-answer','handoff:answer',?,'default',999013)",
        [args.query + " originalquestionmarker"]
      );
      const sync = await ensureFactsFtsSync(db);
      expect(sync.ready).toBe(true);
      setFactsFtsReady(true);
    });
    afterAll(async () => {
      await db?.close();
      vi.unstubAllEnvs();
      setFactsFtsReady(false);
    });
    it("retrieves the exact method with the unchanged question and stable identity", async () => {
      const before = await db.query(
        "SELECT id,content FROM projections ORDER BY id"
      );
      const result = await packTool.handler(
        { ...args, selection_mode: "exact", plan_id: "handoff-plan" },
        context
      );
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        query: args.query,
        selection_mode: "exact",
        pack: [{ id: "handoff-plan", scope: args.scope }]
      });
      expect(JSON.stringify(result.structuredContent?.facts)).toContain(
        "originalquestionmarker"
      );
      expect(
        await db.query("SELECT id,content FROM projections ORDER BY id")
      ).toEqual(before);
      expect(
        (await packTool.handler(args, context)).structuredContent?.pack
      ).toEqual([]);
      expect(
        (await packTool.handler({ ...args, query: "launch" }, context))
          .structuredContent?.pack
      ).toHaveLength(1);
    });
    it("fails closed for absent, foreign, global, expired and ambiguous selections", async () => {
      for (const extra of [
        { scope: "default:absent" },
        { scope: "other:plan" },
        { scope: "default:expired" },
        { agent_id: "other" },
        { plan_id: "handoff-global" }
      ]) {
        expect(
          (
            await packTool.handler(
              { ...args, ...extra, selection_mode: "exact" },
              context
            )
          ).isError
        ).toBe(true);
      }
      await db.query(
        "INSERT INTO projections(id,agent_id,scope,proj_type,content,status) VALUES ('handoff-second','handoff','default:handoff','GOAL','Second','active')"
      );
      expect(
        (
          await packTool.handler(
            { ...args, selection_mode: "exact", limit: 1 },
            context
          )
        ).structuredContent
      ).toMatchObject({ error: { code: "ambiguous_plan" } });
      expect(
        (
          await packTool.handler(
            { ...args, selection_mode: "exact", plan_id: "handoff-plan" },
            context
          )
        ).isError
      ).not.toBe(true);
    });
    it("retrieves accented facts through actual FTS5", async () => {
      for (const query of ["échéance dépassée", "echeance depassee"]) {
        expect(
          (
            await searchTool.handler(
              {
                workspace_id: "default",
                schema_id: "handoff:accents",
                query,
                mode: "bm25"
              },
              context
            )
          ).structuredContent
        ).toMatchObject({ returned: 1, mode_applied: "bm25" });
      }
    });
    it("keeps a natural-language question separate from a resolved collection facet value", async () => {
      await db.query(
        "INSERT INTO collections(collection_id,workspace_id,name) VALUES ('handoff-col','default','Handoff')"
      );
      await db.query(
        "INSERT INTO ontologies(ontology_id,workspace_id,name) VALUES ('handoff-onto','default','Handoff')"
      );
      await db.query(
        "INSERT INTO documents_raw(workspace_id,collection_id,doc_id,content) VALUES ('default','handoff-col',999012,'Document')"
      );
      await db.query(
        "INSERT INTO facet_assignments_raw(workspace_id,collection_id,target_kind,doc_id,ontology_id,namespace,dimension,value) VALUES ('default','handoff-col','doc',999012,'handoff-onto','handoff','status','awaiting_client_approval')"
      );
      const input = {
        workspace_id: "default",
        collection_id: "handoff-col",
        query: "Quels projets sont en attente de validation client ?",
        facet_schema_id: "handoff:no-facts",
        collection_facet_namespace: "handoff",
        collection_facet_dimension: "status"
      };
      const unresolved = (await combinedSearchTool.handler(input, context))
        .structuredContent;
      expect(unresolved?.returned).toBe(0);
      expect(JSON.stringify(unresolved?.notes)).toContain(
        "collection_facet_value"
      );
      const resolved = (
        await combinedSearchTool.handler(
          { ...input, collection_facet_value: "awaiting_client_approval" },
          context
        )
      ).structuredContent;
      expect(resolved).toMatchObject({ query: input.query, returned: 1 });
    });
  }
);
