import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
import { rememberTool } from "../../src/tools/facets/remember.js";
import { createToolContext } from "../helpers/tool-context.js";

function createMockDatabase(queryImpl: DatabaseClient["query"]): DatabaseClient {
  return {
    kind: "sqlite",
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = {
        kind: "sqlite",
        query: queryImpl
      };
      return operation(queryable);
    }
  };
}

describe("native ingest follow-ups", () => {
  it("ghostcrab_remember prefers mb_ontology.ingest_knowledge_chunk when pgMindbrain is available", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async () => [
      { id: "facet-native-1", created_at: "2026-04-23T12:00:00.000Z" }
    ]);
    const database = createMockDatabase(query);

    const result = await rememberTool.handler(
      {
        content: "Native remember path",
        facets: { domain: "product" }
      },
      createToolContext(database, {
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: true
        }
      })
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("mb_ontology.ingest_knowledge_chunk");
    expect(result.structuredContent).toMatchObject({
      tool: "ghostcrab_remember",
      backend: "native",
      id: "facet-native-1",
      stored: true
    });
  });

  it("ghostcrab_remember falls back to SQL insert when native ingest fails", async () => {
    const query = vi
      .fn<DatabaseClient["query"]>()
      .mockRejectedValueOnce(new Error("mb_ontology missing"))
      .mockResolvedValueOnce([{ next_doc_id: 7 }])
      .mockResolvedValueOnce([]);
    const database = createMockDatabase(query);

    const result = await rememberTool.handler(
      {
        content: "Fallback remember path",
        facets: { domain: "ops" }
      },
      createToolContext(database, {
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: true
        }
      })
    );

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1]?.[0]).toContain("SELECT COALESCE(MAX(doc_id), 0) + 1");
    expect(query.mock.calls[2]?.[0]).toContain("INSERT INTO facets");
    expect(result.structuredContent).toMatchObject({
      tool: "ghostcrab_remember",
      backend: "sql",
      stored: true
    });
  });

  it("ghostcrab_learn uses native ingest for graph payloads when available", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async () => [
      { edge_id: "edge-native-1", edge_created: true }
    ]);
    const database = createMockDatabase(query);

    const result = await learnTool.handler(
      {
        node: {
          id: "task:start",
          node_type: "task",
          label: "Start"
        },
        edge: {
          source: "task:start",
          target: "concept:gap",
          label: "HAS_GAP",
          weight: 1
        }
      },
      createToolContext(database, {
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: true
        }
      })
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("mb_ontology.ingest_knowledge_chunk");
    expect(result.structuredContent).toMatchObject({
      tool: "ghostcrab_learn",
      backend: "native",
      node: { learned: true, id: "task:start" },
      edge: { learned: true, id: "edge-native-1", created: true }
    });
  });

  it("ghostcrab_learn falls back to SQL graph upsert when native ingest fails", async () => {
    let entityLookupCount = 0;
    const query = vi.fn<DatabaseClient["query"]>(async (sql, params) => {
      const statement = String(sql);

      if (statement.includes("mb_ontology.ingest_knowledge_chunk")) {
        throw new Error("native unavailable");
      }
      if (statement.includes("SELECT entity_id") && params?.[1] === "task:start") {
        entityLookupCount += 1;
        return entityLookupCount === 1 ? [] : [{ entity_id: 1 }];
      }
      if (statement.includes("INSERT INTO graph_entity")) {
        return [];
      }
      if (statement.includes("INSERT OR IGNORE INTO graph_entity_alias")) {
        return [];
      }
      return [];
    });

    const database = createMockDatabase(query);
    const result = await learnTool.handler(
      {
        node: {
          id: "task:start",
          node_type: "task",
          label: "Start"
        }
      },
      createToolContext(database, {
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false,
          pgMindbrain: true
        }
      })
    );

    expect(query.mock.calls[0]?.[0]).toContain("mb_ontology.ingest_knowledge_chunk");
    expect(query.mock.calls.some((call) => String(call[0]).includes("INSERT INTO graph_entity"))).toBe(
      true
    );
    expect(result.structuredContent).toMatchObject({
      tool: "ghostcrab_learn",
      backend: "sql",
      node: { learned: true, id: "task:start" }
    });
  });
});
