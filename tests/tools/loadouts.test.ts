import { describe, expect, it, vi } from "vitest";

import {
  loadoutApplyTool,
  loadoutInspectTool,
  loadoutListTool,
  loadoutSuggestTool
} from "../../src/tools/workspace/loadouts.js";
import { loadoutSeedTool } from "../../src/tools/workspace/loadout-seed.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

function makeContext(
  queryImpl: (sql: string, params?: readonly unknown[]) => Promise<unknown[]>
): ToolExecutionContext {
  return {
    database: {
      kind: "sqlite",
      query: vi.fn().mockImplementation(queryImpl),
      transaction: vi.fn()
    } as unknown as ToolExecutionContext["database"],
    embeddings: {} as ToolExecutionContext["embeddings"],
    extensions: { pgFacets: false, pgDgraph: false, pgPragma: false },
    nativeExtensionsMode: "sql-only",
    retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 },
    session: { workspace_id: "default", schema_id: null }
  };
}

describe("ghostcrab_loadout_list", () => {
  it("lists the predefined loadouts and default recommendation", async () => {
    const ctx = makeContext(async () => []);
    const result = await loadoutListTool.handler({}, ctx);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(data.ok).toBe(true);
    expect(data.default_loadout_id).toBe("default-minimal");
    expect(Array.isArray(data.loadouts)).toBe(true);
    expect(data.loadouts as Array<Record<string, unknown>>).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ loadout_id: "crm" }),
        expect.objectContaining({ loadout_id: "kanban" })
      ])
    );
  });
});

describe("ghostcrab_loadout_seed", () => {
  it("seeds a graph skeleton for the selected loadout", async () => {
    const entityIds = new Map<string, number>();
    let nextEntityId = 101;
    let nextRelationId = 201;
    const ensureEntityId = (name: string): number => {
      const existing = entityIds.get(name);
      if (existing) return existing;
      const id = nextEntityId++;
      entityIds.set(name, id);
      return id;
    };
    const query = vi.fn().mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes("SELECT id, domain_profile") && sql.includes("FROM workspaces")) {
        return [{ id: "demo-ws", domain_profile: "crm" }];
      }
      if (sql.includes("FROM graph_entity") && sql.includes("WHERE entity_type = ? AND name = ?")) {
        return Array.isArray(params) && typeof params[1] === "string"
          ? [{ entity_id: ensureEntityId(String(params[1])) }]
          : [];
      }
      if (sql.includes("INSERT INTO graph_entity")) {
        return [];
      }
      if (sql.includes("INSERT OR IGNORE INTO graph_entity_alias")) {
        return [];
      }
      if (sql.includes("SELECT relation_id") && sql.includes("FROM graph_relation")) {
        return [];
      }
      if (sql.includes("SELECT COALESCE(MAX(relation_id), 0) + 1")) {
        return [{ next_id: nextRelationId++ }];
      }
      if (sql.includes("INSERT INTO graph_relation")) {
        return [];
      }
      if (sql.includes("UPDATE workspaces") && sql.includes("domain_profile")) {
        return [];
      }
      return [];
    });

    const ctx: ToolExecutionContext = {
      database: {
        kind: "sqlite",
        query,
        transaction: async (operation) =>
          operation({
            kind: "sqlite",
            query
          } as ToolExecutionContext["database"])
      } as unknown as ToolExecutionContext["database"],
      embeddings: {} as ToolExecutionContext["embeddings"],
      extensions: { pgFacets: false, pgDgraph: false, pgPragma: false },
      nativeExtensionsMode: "sql-only",
      retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 },
      session: { workspace_id: "default", schema_id: null }
    };

    const result = await loadoutSeedTool.handler(
      { workspace_id: "demo-ws", loadout_id: "crm", persist_semantics: false },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(result.isError).toBe(false);
    expect(data.loadout_id).toBe("crm");
    expect((data.graph as Record<string, unknown>).seeded_nodes).toBeGreaterThan(0);
    expect((data.graph as Record<string, unknown>).seeded_edges).toBeGreaterThan(0);
  });

  it("can also persist semantic placeholders", async () => {
    const query = vi.fn().mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes("SELECT id, domain_profile") && sql.includes("FROM workspaces")) {
        return [{ id: "demo-ws", domain_profile: "crm" }];
      }
      if (sql.includes("FROM graph_entity") && sql.includes("WHERE entity_type = ? AND name = ?")) {
        return Array.isArray(params) && typeof params[1] === "string"
          ? [{ entity_id: 301 }]
          : [];
      }
      if (sql.includes("INSERT INTO graph_entity")) {
        return [];
      }
      if (sql.includes("INSERT OR IGNORE INTO graph_entity_alias")) {
        return [];
      }
      if (sql.includes("SELECT relation_id") && sql.includes("FROM graph_relation")) {
        return [];
      }
      if (sql.includes("SELECT COALESCE(MAX(relation_id), 0) + 1")) {
        return [{ next_id: 1 }];
      }
      if (sql.includes("INSERT INTO graph_relation")) {
        return [];
      }
      if (sql.includes("INSERT INTO table_semantics")) {
        return [];
      }
      if (sql.includes("INSERT INTO column_semantics")) {
        return [];
      }
      if (sql.includes("INSERT INTO relation_semantics")) {
        return [];
      }
      if (sql.includes("UPDATE workspaces") && sql.includes("domain_profile")) {
        return [];
      }
      return [];
    });

    const ctx: ToolExecutionContext = {
      database: {
        kind: "sqlite",
        query,
        transaction: async (operation) =>
          operation({
            kind: "sqlite",
            query
          } as ToolExecutionContext["database"])
      } as unknown as ToolExecutionContext["database"],
      embeddings: {} as ToolExecutionContext["embeddings"],
      extensions: { pgFacets: false, pgDgraph: false, pgPragma: false },
      nativeExtensionsMode: "sql-only",
      retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 },
      session: { workspace_id: "default", schema_id: null }
    };

    const result = await loadoutSeedTool.handler(
      { workspace_id: "demo-ws", loadout_id: "crm", persist_semantics: true },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(result.isError).toBe(false);
    expect((data.semantics as Record<string, unknown>)?.table_semantics).toBeGreaterThan(0);
    expect((data.semantics as Record<string, unknown>)?.column_semantics).toBeGreaterThan(0);
    expect((data.semantics as Record<string, unknown>)?.relation_semantics).toBeGreaterThan(0);
  });
});

describe("ghostcrab_loadout_inspect", () => {
  it("returns unknown_loadout for missing entries", async () => {
    const ctx = makeContext(async () => []);
    const result = await loadoutInspectTool.handler({ loadout_id: "missing" }, ctx);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect((data.error as Record<string, unknown>).code).toBe("unknown_loadout");
  });

  it("returns loadout details", async () => {
    const ctx = makeContext(async () => []);
    const result = await loadoutInspectTool.handler({ loadout_id: "crm" }, ctx);
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(result.isError).toBe(false);
    expect(data.loadout).toMatchObject({
      loadout_id: "crm",
      domain_profile: "crm"
    });
    expect(data.skeleton_preview).toMatchObject({
      nodes: expect.any(Number),
      edges: expect.any(Number),
      core_entity_nodes: expect.arrayContaining(["account", "contact"])
    });
  });
});

describe("ghostcrab_loadout_apply", () => {
  it("updates the workspace domain_profile", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("SELECT id, domain_profile")) {
        return [{ id: "demo-ws", domain_profile: null }];
      }
      if (sql.includes("UPDATE workspaces")) {
        return [];
      }
      return [];
    });

    const result = await loadoutApplyTool.handler(
      { workspace_id: "demo-ws", loadout_id: "kanban" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(result.isError).toBe(false);
    expect(data.applied).toBe(true);
    expect(data.domain_profile).toBe("kanban");
  });

  it("rejects conflicting existing loadouts without overwrite", async () => {
    const ctx = makeContext(async (sql: string) => {
      if (sql.includes("SELECT id, domain_profile")) {
        return [{ id: "demo-ws", domain_profile: "crm" }];
      }
      return [];
    });

    const result = await loadoutApplyTool.handler(
      { workspace_id: "demo-ws", loadout_id: "kanban" },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect((data.error as Record<string, unknown>).code).toBe("loadout_conflict");
  });
});

describe("ghostcrab_loadout_suggest", () => {
  it("suggests crm for sales-oriented goals", async () => {
    const ctx = makeContext(async () => []);
    const result = await loadoutSuggestTool.handler(
      { goal: "I need a CRM for leads, opportunities, and sales pipeline", limit: 3 },
      ctx
    );
    const data = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;

    expect(result.isError).toBe(false);
    expect(data.recommended_loadout_id).toBe("crm");
    expect((data.suggestions as Array<Record<string, unknown>>)[0]?.loadout).toMatchObject({
      loadout_id: "crm"
    });
  });
});
