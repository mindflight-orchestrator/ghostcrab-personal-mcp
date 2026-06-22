import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
import { artifactGetTool } from "../../src/tools/pragma/artifact-get.js";
import { packTool } from "../../src/tools/pragma/pack.js";
import { projectTool } from "../../src/tools/pragma/project.js";
import { statusTool } from "../../src/tools/pragma/status.js";
import { GHOSTCRAB_MCP_SURFACE_VERSION } from "../../src/tools/registry.js";

function createMockDatabase(
  queryImpl: DatabaseClient["query"]
): DatabaseClient {
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

function readStructured(result: {
  structuredContent?: unknown;
}): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("pragma tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a pack with blocking constraints and facts", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path =
        typeof url === "string"
          ? url
          : ((url as URL).pathname ?? url.toString());
      void init;

      if (String(path).includes("pack-projections")) {
        return new Response(
          JSON.stringify({
            rows: [
              {
                id: "proj-constraint-1",
                proj_type: "CONSTRAINT",
                content: "Do not break public API",
                weight: 1,
                source_ref: null,
                status: "blocking",
                artifact_kind: "analysis_plan",
                legacy_kind: "projection_type_a",
                public_label: "Do not break public API"
              },
              {
                id: "proj-goal-1",
                proj_type: "GOAL",
                content: "Ship phase 2 tools",
                weight: 0.8,
                source_ref: null,
                status: "active",
                artifact_kind: "analysis_plan",
                legacy_kind: "projection_type_a",
                public_label: "Ship phase 2 tools"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (String(path).includes("ghostcrab/search")) {
        return new Response(
          JSON.stringify({
            workspace_id: "default",
            query: "phase 2 project-delivery board",
            returned: 1,
            matches: [
              {
                doc_id: 42,
                bm25_score: 0.9,
                vector_score: 0,
                combined_score: 0.9
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (
        sql.includes("FROM mb_pragma.agent_facts") &&
        sql.includes("doc_id IN")
      ) {
        return [
          {
            id: "facet-1",
            content: "Search relies on hybrid search today",
            doc_id: 42
          }
        ];
      }

      return [];
    });
    const database = {
      ...createMockDatabase(query),
      kind: "sqlite" as const
    };

    const result = await packTool.handler(
      {
        query: "phase 2 project-delivery board",
        agent_id: "agent:self",
        scope: "project-delivery-board"
      },
      createToolContext(database)
    );

    expect(readStructured(result)).toMatchObject({
      ok: true,
      tool: "ghostcrab_pack",
      backend: "native",
      surface_version: GHOSTCRAB_MCP_SURFACE_VERSION,
      facts_mode_applied: "mindbrain_hybrid",
      has_blocking_constraint: true,
      activity_family_detected: null,
      scope_profile_id_detected: null,
      hybrid_weights: {
        bm25: 0.6,
        vector: 0.4
      },
      item_count: 3,
      recommended_next_step:
        "Resolve blocking constraints before proceeding. Review the constraint entries in the pack and address each one."
    });
    expect(readStructured(result).projection_recipe_used).toBeNull();
    expect(readStructured(result).kpi_snapshots).toEqual([]);
    expect(readStructured(result).pack_text).toContain("CONSTRAINT[blocking]");
    expect(readStructured(result).pack_text).toContain("FACT:");
    const pack = readStructured(result).pack as Array<Record<string, unknown>>;
    expect(pack[0]).toMatchObject({
      artifact_kind: "analysis_plan",
      legacy_kind: "projection_type_a"
    });
    const packCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("pack-projections")
    );
    expect(packCall).toBeDefined();
    const packUrl = new URL(String(packCall?.[0]));
    expect(packUrl.searchParams.get("workspace_id")).toBe("default");
    expect(packUrl.searchParams.get("scope")).toBe("project-delivery-board");
    const searchCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("ghostcrab/search")
    );
    expect(searchCall).toBeDefined();
    const searchBody = JSON.parse(searchCall?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(searchBody.table_id).toBe(1);
    expect(searchBody.workspace_id).toBe("default");
  });

  it("falls back to workspace-scoped local FTS facts when native ghostcrab search fails", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path =
        typeof url === "string"
          ? url
          : ((url as URL).pathname ?? url.toString());

      if (String(path).includes("pack-projections")) {
        return new Response(JSON.stringify({ rows: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (String(path).includes("ghostcrab/search")) {
        return new Response("bad request", { status: 400 });
      }

      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const query = vi.fn<DatabaseClient["query"]>(async (sql, params) => {
      if (
        sql.includes("FROM mb_pragma.agent_facts AS f") &&
        sql.includes("JOIN mb_pragma.search_fts_docs")
      ) {
        expect(params).toEqual([1, '"Aurora"', "serenity-v4", "serenity", 5]);
        return [
          {
            id: "fact-serenity",
            content: "Aurora has a complete practical situation.",
            score: 1.25
          }
        ];
      }
      return [];
    });
    const context = createToolContext(createMockDatabase(query));
    context.session.workspace_id = "serenity-v4";
    context.session.schema_id = "serenity";

    const result = await packTool.handler(
      {
        query: "Aurora",
        agent_id: "agent:self"
      },
      context
    );

    const body = readStructured(result);
    expect(body.facts_mode_applied).toBe("sql_fts");
    expect(body.pack_text).toContain(
      "FACT: Aurora has a complete practical situation."
    );
    expect(body.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("local SQL/FTS fallback returned 1")
      ])
    );
  });

  it("keeps native ghostcrab search fact hydration workspace scoped", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path =
        typeof url === "string"
          ? url
          : ((url as URL).pathname ?? url.toString());

      if (String(path).includes("pack-projections")) {
        return new Response(JSON.stringify({ rows: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (String(path).includes("ghostcrab/search")) {
        return new Response(
          JSON.stringify({
            workspace_id: "serenity-v4",
            query: "Aurora",
            returned: 2,
            matches: [
              { doc_id: 7, bm25_score: 1, vector_score: 0, combined_score: 1 },
              {
                doc_id: 9,
                bm25_score: 0.8,
                vector_score: 0,
                combined_score: 0.8
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const query = vi.fn<DatabaseClient["query"]>(async (sql, params) => {
      if (
        sql.includes("FROM mb_pragma.agent_facts") &&
        sql.includes("doc_id IN")
      ) {
        expect(params).toEqual([7, 9, "serenity-v4"]);
        return [
          {
            id: "fact-serenity",
            content: "Aurora belongs to the Serenity workspace.",
            doc_id: 7
          }
        ];
      }
      return [];
    });
    const context = createToolContext(createMockDatabase(query));
    context.session.workspace_id = "serenity-v4";

    const result = await packTool.handler(
      {
        query: "Aurora",
        agent_id: "agent:self"
      },
      context
    );

    const body = readStructured(result);
    expect(body.facts_mode_applied).toBe("mindbrain_hybrid");
    expect(body.pack_text).toContain(
      "FACT: Aurora belongs to the Serenity workspace."
    );
  });

  it("rejects artifact_get when the returned artifact belongs to another workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              artifact_id: "analysis_plan__shared",
              slug: "shared",
              workspace_id: "serenity-v4-shadow",
              agent_id: "agent:self",
              scope: "serenity-v4:production:shared",
              artifact_kind: "analysis_plan",
              public_label: "Shadow plan",
              lifecycle: "active",
              state: "open",
              current_version: 1,
              payload_json: "{}",
              legacy_ref: null
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      )
    );

    const context = createToolContext(createMockDatabase(vi.fn()));
    context.session.workspace_id = "serenity-v4";

    const result = await artifactGetTool.handler(
      { artifact_id: "analysis_plan__shared" },
      context
    );

    expect(result.isError).toBe(true);
    const body = readStructured(result);
    expect((body.error as Record<string, unknown>).code).toBe(
      "workspace_mismatch"
    );
  });

  it("uses workspace-scoped answer artifacts before legacy projections when native pack fails", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path =
        typeof url === "string"
          ? url
          : ((url as URL).pathname ?? url.toString());

      if (String(path).includes("pack-projections")) {
        return new Response("bad request", { status: 400 });
      }

      if (String(path).includes("/api/mindbrain/sql")) {
        return new Response(
          JSON.stringify({
            ok: true,
            columns: [
              "artifact_id",
              "slug",
              "workspace_id",
              "agent_id",
              "scope",
              "artifact_kind",
              "public_label",
              "lifecycle",
              "state",
              "current_version",
              "legacy_ref"
            ],
            rows: [
              [
                "analysis_plan__copropriete_360",
                "copropriete_360",
                "serenity-v4",
                "agent:self",
                "serenity-v4:production:copropriete_360",
                "analysis_plan",
                "Copropriete 360",
                "active",
                "open",
                1,
                "projection:copropriete_360"
              ]
            ],
            changes: 0
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (String(path).includes("ghostcrab/search")) {
        return new Response(
          JSON.stringify({
            workspace_id: "serenity-v4",
            query: "Aurora",
            returned: 0,
            matches: []
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM mb_pragma.projections")) {
        return [
          {
            content: "Legacy fallback row",
            proj_type: "GOAL",
            source_ref: null,
            status: "active",
            weight: 0.4
          }
        ];
      }
      return [];
    });
    const context = createToolContext(createMockDatabase(query));
    context.session.workspace_id = "serenity-v4";

    const result = await packTool.handler(
      {
        query: "Aurora",
        agent_id: "agent:self",
        scope: "serenity-v4:production:copropriete_360"
      },
      context
    );

    expect(result.isError).not.toBe(true);
    const body = readStructured(result);
    expect(body.backend).toBe("sql");
    const pack = body.pack as Array<Record<string, unknown>>;
    expect(pack[0]).toMatchObject({
      id: "analysis_plan__copropriete_360",
      public_label: "Copropriete 360",
      artifact_kind: "analysis_plan"
    });
    expect(body.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("legacy_projection_fallback")
      ])
    );
  });

  it("returns status directives from health, gaps, and blocking constraints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 }))
    );

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM mb_pragma.agent_state")) {
        return [
          {
            health: "RED",
            state: "BUSY",
            metrics: {
              avg_latency_ms: 650,
              token_budget_remaining: 1500
            }
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:activity-family'")) {
        return [
          {
            activity_family: "workflow-tracking",
            keywords: ["kanban", "task", "board"],
            title: "Workflow Tracking"
          },
          {
            activity_family: "incident-response",
            keywords: ["incident", "service", "runbook"],
            title: "Incident Response"
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:capability'")) {
        return [
          {
            capability: "create_provisional_domain_model",
            scope: "workflow",
            autonomy_level: "guided-autonomous",
            requires_confirmation: false
          },
          {
            capability: "generate_dynamic_projection",
            scope: "heartbeat",
            autonomy_level: "guided-autonomous",
            requires_confirmation: false
          },
          {
            capability: "extend_existing_domain",
            scope: "workflow",
            autonomy_level: "guided-autonomous",
            requires_confirmation: false
          },
          {
            capability: "register_canonical_schema",
            scope: "schema",
            autonomy_level: "human-confirmed",
            requires_confirmation: true
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:autonomy-policy'")) {
        return [
          {
            policy_id: "policy:prefer-live-projections",
            scope: "heartbeat",
            action: "prefer_dynamic_projection",
            confirmation_required: false
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:intent-pattern'")) {
        return [
          {
            intent_id: "track-over-time",
            job: "track_over_time",
            default_action: "model_and_project",
            requires_ghostcrab: true,
            candidate_activity_families: ["workflow-tracking"]
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:signal-pattern'")) {
        return [
          {
            signal_id: "signal:workflow-tracking",
            signal_type: "language",
            examples: ["kanban", "board"],
            candidate_activity_families: ["workflow-tracking"]
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:ingest-pattern'")) {
        return [
          {
            pattern_id: "message-to-task-candidate",
            source_kind: "message_thread",
            recommended_action: "summarize_then_remember",
            recommended_activity_family: "workflow-tracking",
            privacy_mode: "store_summary_not_raw"
          }
        ];
      }

      if (sql.includes("JOIN graph.entity")) {
        return [{ id: "concept:gap", label: "Gap" }];
      }

      if (sql.includes("proj_type = 'CONSTRAINT'")) {
        return [{ content: "Wait for review" }];
      }

      return [];
    });
    const database = createMockDatabase(query);

    const result = await statusTool.handler(
      { agent_id: "agent:self" },
      createToolContext(database)
    );
    const payload = readStructured(result);

    expect(payload.operational).toMatchObject({
      health: "RED",
      state: "BUSY"
    });
    expect(payload).toMatchObject({
      ok: true,
      tool: "ghostcrab_status",
      summary: {
        attention_required: {
          health: "RED",
          embeddings_status: null
        },
        informational: {
          health: "RED",
          agent_state: "BUSY",
          database_kind: "sqlite",
          embeddings_status: "keyword_only"
        }
      },
      next_actions: []
    });
    expect(payload.runtime).toMatchObject({
      embeddings: expect.objectContaining({
        mode: "disabled",
        vectorSearchReady: false
      }),
      retrieval: {
        hybrid_bm25_weight: 0.6,
        hybrid_vector_weight: 0.4
      },
      backends: {
        facets: "sql",
        graph: "mindbrain",
        pragma: "mindbrain"
      },
      capabilities: {
        facets_count: false,
        facets_bm25: false,
        graph_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_pack: true,
        mb_ontology_available: true
      }
    });
    expect(payload.workspace_context).toMatchObject({
      pin_source: expect.any(String),
      switch_policy: "intentional_switch_allowed"
    });
    expect(payload.directives).toEqual(
      expect.arrayContaining([
        "Backend missing graph diagnostics routes — rebuild ghostcrab-backend (pnpm run prebuild:local) and restart."
      ])
    );
  });

  it("exposes embeddings degradation directives when runtime failed", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("schema_id = 'ghostcrab:capability'")) {
        return [
          {
            capability: "create_provisional_domain_model",
            scope: "workflow",
            autonomy_level: "guided-autonomous",
            requires_confirmation: false
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:autonomy-policy'")) {
        return [
          {
            policy_id: "policy:prefer-live-projections",
            scope: "heartbeat",
            action: "prefer_dynamic_projection",
            confirmation_required: false
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:intent-pattern'")) {
        return [];
      }

      if (sql.includes("schema_id = 'ghostcrab:signal-pattern'")) {
        return [];
      }

      if (sql.includes("schema_id = 'ghostcrab:ingest-pattern'")) {
        return [];
      }

      return [];
    });
    const database = createMockDatabase(query);

    const result = await statusTool.handler(
      { agent_id: "agent:self" },
      {
        database,
        embeddings: {
          async embedMany() {
            return [];
          },
          getStatus() {
            return {
              available: false,
              dimensions: 1536,
              failure: {
                code: "auth_error",
                message: "Invalid API key",
                occurred_at: "2026-03-23T12:00:00.000Z",
                recoverable: false
              },
              model: "openai/text-embedding-3-small",
              mode: "openrouter",
              note: "Configured but blocked.",
              vectorSearchReady: false,
              writeEmbeddingsEnabled: false
            };
          }
        },
        retrieval: {
          hybridBm25Weight: 0.7,
          hybridVectorWeight: 0.3
        },
        session: {
          workspace_id: "default",
          schema_id: null
        }
      }
    );
    const payload = readStructured(result);

    expect(payload.summary).toMatchObject({
      attention_required: {
        embeddings_status: "misconfigured_or_blocked"
      },
      informational: {
        embeddings_status: "misconfigured_or_blocked"
      }
    });
    expect(payload.runtime).toMatchObject({
      retrieval: {
        hybrid_bm25_weight: 0.7,
        hybrid_vector_weight: 0.3
      },
      backends: {
        facets: "sql",
        graph: "mindbrain",
        pragma: "mindbrain"
      },
      capabilities: {
        facets_count: false,
        facets_bm25: false,
        graph_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_pack: true,
        mb_ontology_available: true
      }
    });
    expect(payload.next_actions).toEqual([]);
  });

  it("exposes runtime.capabilities for the MindBrain-backed SQLite runtime", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM mb_pragma.agent_state")) {
        return [
          {
            health: "GREEN",
            metrics: {},
            state: "IDLE"
          }
        ];
      }
      if (sql.includes("schema_id = 'ghostcrab:capability'")) {
        return [];
      }
      if (sql.includes("schema_id = 'ghostcrab:autonomy-policy'")) {
        return [];
      }
      if (sql.includes("schema_id = 'ghostcrab:intent-pattern'")) {
        return [];
      }
      if (sql.includes("schema_id = 'ghostcrab:signal-pattern'")) {
        return [];
      }
      if (sql.includes("schema_id = 'ghostcrab:ingest-pattern'")) {
        return [];
      }
      return [];
    });
    const database = createMockDatabase(query);

    const result = await statusTool.handler(
      { agent_id: "agent:self" },
      createToolContext(database)
    );
    const payload = readStructured(result);

    expect(payload.runtime).toMatchObject({
      backends: {
        facets: "sql",
        graph: "mindbrain",
        pragma: "mindbrain"
      },
      capabilities: {
        facets_count: false,
        facets_bm25: false,
        graph_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_pack: true
      },
      sqlite_readiness: {
        pragma: {
          pack: true
        }
      }
    });
  });

  it("creates and updates a provisional projection through the public tool", async () => {
    let updateCalled = false;
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (
        sql.includes("SELECT id") &&
        sql.includes("FROM mb_pragma.projections")
      ) {
        return updateCalled ? [{ id: "proj-1" }] : [];
      }

      if (sql.includes("INSERT INTO mb_pragma.projections")) {
        updateCalled = true;
        return [{ id: "proj-1" }];
      }

      if (sql.includes("UPDATE mb_pragma.projections")) {
        return [];
      }

      return [];
    });
    const database = createMockDatabase(query);

    const created = await projectTool.handler(
      {
        scope: "project-delivery-board",
        content: "Track in-progress cards and blockers.",
        activity_family: "workflow-tracking"
      },
      createToolContext(database)
    );
    const updated = await projectTool.handler(
      {
        scope: "project-delivery-board",
        content: "Track in-progress cards and blockers.",
        activity_family: "workflow-tracking"
      },
      createToolContext(database)
    );

    expect(readStructured(created)).toMatchObject({
      tool: "ghostcrab_project",
      stored: true,
      provisional: true,
      scope: "project-delivery-board",
      source_type: "provisional:workflow-tracking",
      artifact_kind: "analysis_plan",
      legacy_kind: "projection_type_a",
      public_label: "Track in-progress cards and blockers.",
      updated: false
    });
    expect(readStructured(updated)).toMatchObject({
      tool: "ghostcrab_project",
      stored: true,
      provisional: true,
      scope: "project-delivery-board",
      updated: true
    });
  });

  it("reports MindBrain-backed SQLite capabilities truthfully", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM mb_pragma.agent_state")) {
        return [
          {
            health: "GREEN",
            state: "IDLE",
            metrics_json: "{}"
          }
        ];
      }

      if (sql.includes("COUNT(*) AS count FROM mb_pragma.agent_facts")) {
        return [{ count: 12 }];
      }

      if (sql.includes("COUNT(*) AS count FROM mb_pragma.projections")) {
        return [{ count: 4 }];
      }

      if (sql.includes("COUNT(*) AS count FROM graph_entity")) {
        return [{ count: 9 }];
      }

      if (sql.includes("COUNT(*) AS count FROM graph_relation")) {
        return [{ count: 7 }];
      }

      return [];
    });
    const database = createMockDatabase(query);

    const result = await statusTool.handler(
      { agent_id: "agent:self" },
      createToolContext(database)
    );
    const payload = readStructured(result);

    expect(payload.runtime).toMatchObject({
      database_kind: "sqlite",
      sqlite_backing_store: true,
      sqlite_readiness: {
        facets: {
          count: false,
          bm25: false
        },
        dgraph: {
          marketplace: false,
          confidenceDecay: false,
          entityNeighborhood: true
        },
        pragma: {
          pack: true
        },
        ontology: {
          available: true,
          resolveWorkspace: true,
          coverageByDomain: true,
          exportModel: true,
          validateDdl: true
        }
      },
      capabilities: {
        facets_count: false,
        facets_bm25: false,
        graph_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_pack: true,
        mb_ontology_available: true
      },
      backends: {
        facets: "sql",
        graph: "mindbrain",
        pragma: "mindbrain"
      }
    });
  });
});
