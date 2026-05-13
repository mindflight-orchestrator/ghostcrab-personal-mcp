import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient, Queryable } from "../../src/db/client.js";
import { createToolContext } from "../helpers/tool-context.js";
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

function readStructured(
  result: { structuredContent?: unknown }
): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

describe("pragma tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a pack with blocking constraints and facts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            rows: [
              {
                id: "proj-constraint-1",
                proj_type: "CONSTRAINT",
                content: "Do not break public API",
                weight: 1,
                source_ref: null,
                status: "blocking"
              },
              {
                id: "proj-goal-1",
                proj_type: "GOAL",
                content: "Ship phase 2 tools",
                weight: 0.8,
                source_ref: null,
                status: "active"
              }
            ]
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      })
    );

    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("schema_id = 'ghostcrab:activity-family'")) {
        return [
          {
            activity_family: "workflow-tracking",
            keywords: ["phase", "sprint", "task"],
            title: "Workflow Tracking"
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:projection-recipe'")) {
        return [
          {
            content:
              "Use a compact delivery projection with blockers, tasks by status, and next step.",
            preferred_kpis: ["tasks_by_status"],
            preferred_proj_type: "STEP",
            projection_kind: "workflow-heartbeat"
          }
        ];
      }

      if (sql.includes("schema_id = 'ghostcrab:kpi-pattern'")) {
        return [
          {
            content: "Track tasks by status to steer execution.",
            metric_name: "tasks_by_status",
            schema_id: "ghostcrab:task",
            facet_key: "status",
            filter_key: null,
            filter_value: null
          }
        ];
      }

      if (sql.includes("GROUP BY bucket")) {
        return [
          { bucket: "in_progress", count: 2 },
          { bucket: "blocked", count: 1 }
        ];
      }

      if (sql.includes("FROM mb_pragma.facets")) {
        return [
          {
            id: "facet-1",
            content: "Search relies on BM25 fallback today",
            score: 0.9
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
      facts_mode_applied: "bm25",
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
  });

  it("returns status directives from health, gaps, and blocking constraints", async () => {
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
          embeddings_status: "bm25_only"
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
        graph: "native",
        pragma: "native"
      },
      capabilities: {
        facets_native_count: false,
        facets_native_bm25: false,
        graph_native_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_native_pack: true,
        mb_ontology_available: true
      }
    });
    expect(payload.directives).toEqual([]);
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
        graph: "native",
        pragma: "native"
      },
      capabilities: {
        facets_native_count: false,
        facets_native_bm25: false,
        graph_native_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_native_pack: true,
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
        graph: "native",
        pragma: "native"
      },
      capabilities: {
        facets_native_count: false,
        facets_native_bm25: false,
        graph_native_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_native_pack: true
      },
      native_readiness: {
        pragma: {
          pack: true
        }
      }
    });
  });

  it("creates and updates a provisional projection through the public tool", async () => {
    let updateCalled = false;
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("SELECT id") && sql.includes("FROM mb_pragma.projections")) {
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

      if (sql.includes("COUNT(*) AS count FROM mb_pragma.facets")) {
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
      native_readiness: {
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
        facets_native_count: false,
        facets_native_bm25: false,
        graph_native_traversal: true,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_native_pack: true,
        mb_ontology_available: true
      },
      backends: {
        facets: "sql",
        graph: "native",
        pragma: "native"
      }
    });
  });
});
