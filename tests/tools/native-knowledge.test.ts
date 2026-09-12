import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { traverseTool } from "../../src/tools/dgraph/traverse.js";
import { evidenceGetTool } from "../../src/tools/dgraph/evidence-get.js";
import { workspaceReindexAllTool } from "../../src/tools/dgraph/workspace-reindex-all.js";
import { ensureSearchFtsCaughtUp } from "../../src/db/facets-fts-search.js";
import { setNativeFactIndexOwned } from "../../src/runtime/facets-fts-state.js";

const query =
  "Quand l'ordonnance de référé a-t-elle été remise au greffe par mise à disposition ?";
const reference = {
  kind: "external_id",
  value: "assertion:asrt_884ffc127f6a",
  ontology_id: "legal"
};
function setup(response: unknown, feature = true, status = 200) {
  const sql = vi.fn(() => {
    throw new Error("Unexpected proxy SQL access");
  });
  const context = createToolContext({
    query: sql
  } as unknown as DatabaseClient);
  const fetch = vi.fn(async (url: string, _options?: RequestInit) => {
    const payload = String(url).endsWith("/capabilities")
      ? {
          features: {
            native_fact_index: feature,
            typed_entity_references: feature,
            evidence_get: feature
          }
        }
      : response;
    return new Response(JSON.stringify(payload), {
      status: String(url).endsWith("/capabilities") ? 200 : status,
      headers: { "content-type": "application/json" }
    });
  });
  vi.stubGlobal("fetch", fetch);
  return { context, fetch, sql };
}
afterEach(() => {
  vi.unstubAllGlobals();
  setNativeFactIndexOwned(false);
});
describe("native MCP knowledge contracts", () => {
  it("BM25 preserves the original question and fact identity without SQL or embeddings", async () => {
    const { context, fetch, sql } = setup({
      index: { ready: true },
      facts: [
        {
          id: "original-fact",
          schema_id: "legal:assertion",
          content: "Remise",
          facets: {},
          created_at_unix: 1,
          version: 1,
          source_ref: reference.value,
          entity_ref: reference,
          score: 1
        }
      ]
    });
    const embed = vi.spyOn(context.embeddings, "embedMany");
    const result = await searchTool.handler(
      {
        query,
        mode: "bm25",
        execution: "native_required",
        workspace_id: "b1",
        schema_id: "legal:assertion",
        filters: { record_id: "a" },
        limit: 1
      },
      context
    );
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      query,
      backend: "mindbrain",
      results: [{ id: "original-fact", entity_ref: reference }]
    });
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toMatchObject({
      query,
      workspace_id: "b1",
      schema_id: "legal:assertion",
      filters: { record_id: "a" },
      limit: 1,
      embedding: [],
      require_ready: true
    });
    expect(sql).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });
  it.each([
    [false, 200, {}, "capability_unavailable"],
    [true, 409, { error: "IndexNotReady" }, "index_not_ready"]
  ])(
    "strict search fails closed (%s)",
    async (feature, status, payload, code) => {
      const { context, sql } = setup(
        payload,
        feature as boolean,
        status as number
      );
      const result = await searchTool.handler(
        { query, mode: "bm25", execution: "native_required" },
        context
      );
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error: { code } });
      expect(sql).not.toHaveBeenCalled();
    }
  );
  it("typed traversal forwards the external identity and rejects conflicting selectors", async () => {
    const { context, fetch } = setup({
      rows: [{ entity_id: 7, node_label: "passage" }],
      resolved_start_id: 4,
      resolved_target_id: null,
      target_found: false
    });
    const result = await traverseTool.handler(
      {
        start_ref: reference,
        direction: "inbound",
        depth: 1,
        edge_labels: ["SUPPORTS"]
      },
      context
    );
    expect(result.structuredContent).toMatchObject({
      path: [{ entity_ref: { kind: "entity_id", value: 7 } }]
    });
    expect(
      JSON.parse(fetch.mock.calls[1][1]!.body as string).start_ref
    ).toEqual(reference);
    await expect(
      traverseTool.handler({ start: "wrong", start_ref: reference }, context)
    ).rejects.toThrow();
    await expect(
      traverseTool.handler(
        { start_ref: { kind: "entity_id", value: "007" } },
        context
      )
    ).rejects.toThrow();
  });
  it("evidence preserves incomplete native results and only uses its dedicated endpoint", async () => {
    const payload = {
      complete: false,
      paths: [
        {
          representation: "direct_support",
          evidence_ref: null,
          text_status: "not_stored",
          text: null
        }
      ]
    };
    const { context, fetch, sql } = setup(payload);
    const result = await evidenceGetTool.handler(
      { assertion_ref: reference, workspace_id: "b1" },
      context
    );
    expect(result.structuredContent).toMatchObject(payload);
    expect(String(fetch.mock.calls[1][0])).toMatch(/\/ghostcrab\/evidence$/);
    expect(sql).not.toHaveBeenCalled();
  });
  it("facts maintenance is explicit and scoped; a native read catch-up performs no writes", async () => {
    const { context, fetch, sql } = setup({
      after: { ready: true },
      indexed: 3
    });
    const result = await workspaceReindexAllTool.handler(
      { scope: "facts", workspace_id: "b1" },
      context
    );
    expect(result.structuredContent).toMatchObject({
      scope: "facts",
      indexed: 3
    });
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({
      workspace_id: "b1"
    });
    setNativeFactIndexOwned(true);
    await ensureSearchFtsCaughtUp(context.database);
    expect(sql).not.toHaveBeenCalled();
  });
});
