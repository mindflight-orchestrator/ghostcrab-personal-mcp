import { describe, expect, it, vi } from "vitest";

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
    query: queryImpl,
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) => {
      const queryable: Queryable = {
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
  it("builds a pack with blocking constraints and facts", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM mfo_projections")) {
        return [
          {
            proj_type: "CONSTRAINT",
            content: "Do not break public API",
            weight: 1,
            source_ref: null,
            status: "blocking"
          },
          {
            proj_type: "GOAL",
            content: "Ship phase 2 tools",
            weight: 0.8,
            source_ref: null,
            status: "active"
          }
        ];
      }

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

      if (sql.includes("FROM mfo_facets")) {
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
    const database = createMockDatabase(query);

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
      backend: "sql",
      surface_version: GHOSTCRAB_MCP_SURFACE_VERSION,
      facts_mode_applied: "bm25",
      has_blocking_constraint: true,
      activity_family_detected: "workflow-tracking",
      scope_profile_id_detected: "project-delivery",
      hybrid_weights: {
        bm25: 0.6,
        vector: 0.4
      },
      item_count: 3,
      recommended_next_step: "resolve_constraints_first"
    });
    expect(readStructured(result).projection_recipe_used).toMatchObject({
      projection_kind: "workflow-heartbeat",
      preferred_proj_type: "STEP"
    });
    expect(readStructured(result).kpi_snapshots).toEqual([
      {
        metric_name: "tasks_by_status",
        schema_id: "demo:project-delivery:task",
        facet_key: "status",
        buckets: [
          { bucket: "in_progress", count: 2 },
          { bucket: "blocked", count: 1 }
        ]
      }
    ]);
    expect(readStructured(result).pack_text).toContain("CONSTRAINT[blocking]");
    expect(readStructured(result).pack_text).toContain("FACT:");
  });

  it("returns status directives from health, gaps, and blocking constraints", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM mfo_agent_state")) {
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
        health: "RED",
        embeddings_status: "bm25_only",
        autonomy_mode: "guided-autonomous-with-schema-confirmation",
        gap_status: "requires_disclosure_or_escalation",
        constraint_status: "blocking_constraints_present"
      },
      next_actions: expect.arrayContaining([
        "throttle_parallel_tools",
        "switch_to_compact_mode",
        "escalate_to_human",
        "resolve_constraints_first",
        "pause_all_non_critical"
      ])
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
      native_extensions_mode: "auto",
      extensions_detected: {
        pg_facets: false,
        pg_dgraph: false,
        pg_pragma: false,
        pg_mindbrain: false
      },
      backends: {
        facets: "sql",
        graph: "sql",
        pragma: "sql"
      },
      capabilities: {
        facets_native_count: false,
        facets_native_bm25: false,
        graph_native_traversal: false,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_native_pack: false,
        mb_ontology_available: false
      },
      facets_delta_status: null
    });
    expect(payload.autonomy).toMatchObject({
      can_model_provisional_domain: true,
      can_create_projection: true,
      can_extend_existing_domain: true,
      requires_confirmation_for_schema_freeze: true
    });
    expect(payload.activity_discovery).toMatchObject({
      known_activity_families: expect.arrayContaining([
        expect.objectContaining({
          activity_family: "workflow-tracking"
        })
      ])
    });
    expect(payload.routing_policy).toMatchObject({
      ghostcrab_required_for: expect.arrayContaining(["track_over_time"]),
      known_intents: expect.arrayContaining([
        expect.objectContaining({
          intent_id: "track-over-time",
          default_action: "model_and_project"
        })
      ]),
      signal_patterns: expect.arrayContaining([
        expect.objectContaining({
          signal_id: "signal:workflow-tracking"
        })
      ]),
      ingest_patterns: expect.arrayContaining([
        expect.objectContaining({
          pattern_id: "message-to-task-candidate"
        })
      ])
    });
    expect(payload.projection_guidance).toMatchObject({
      prefer_dynamic_projection: true,
      default_projection_budget: 120
    });
    expect(payload.directives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "throttle_parallel_tools" }),
        expect.objectContaining({ action: "switch_to_compact_mode" }),
        expect.objectContaining({ action: "escalate_to_human" }),
        expect.objectContaining({ action: "resolve_constraints_first" }),
        expect.objectContaining({ action: "pause_all_non_critical" }),
        expect.objectContaining({
          action: "read_modeling_recipe_then_create_provisional_model"
        }),
        expect.objectContaining({
          action: "prefer_dynamic_projection_over_static_file"
        })
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
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: false
        },
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
        nativeExtensionsMode: "auto"
      }
    );
    const payload = readStructured(result);

    expect(payload.summary).toMatchObject({
      embeddings_status: "misconfigured_or_blocked"
    });
    expect(payload.autonomy).toMatchObject({
      can_model_provisional_domain: true,
      can_create_projection: false,
      requires_confirmation_for_schema_freeze: false
    });
    expect(payload.runtime).toMatchObject({
      retrieval: {
        hybrid_bm25_weight: 0.7,
        hybrid_vector_weight: 0.3
      },
      native_extensions_mode: "auto",
      extensions_detected: {
        pg_facets: false,
        pg_dgraph: false,
        pg_pragma: false
      },
      backends: {
        facets: "sql",
        graph: "sql",
        pragma: "sql"
      },
      capabilities: {
        facets_native_count: false,
        facets_native_bm25: false,
        graph_native_traversal: false,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_native_pack: false,
        mb_ontology_available: false
      },
      facets_delta_status: null
    });
    expect(payload.next_actions).toEqual(
      expect.arrayContaining(["fix_embeddings_configuration"])
    );
  });

  it("exposes runtime.capabilities aligned with extensions_detected (pg_pragma true)", async () => {
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("FROM mfo_agent_state")) {
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
      createToolContext(database, {
        extensions: {
          pgFacets: false,
          pgDgraph: false,
          pgPragma: true
        }
      })
    );
    const payload = readStructured(result);

    expect(payload.runtime).toMatchObject({
      extensions_detected: {
        pg_facets: false,
        pg_dgraph: false,
        pg_pragma: true,
        pg_mindbrain: false
      },
      backends: {
        facets: "sql",
        graph: "sql",
        pragma: "conditional"
      },
      capabilities: {
        facets_native_count: false,
        facets_native_bm25: false,
        graph_native_traversal: false,
        graph_marketplace_search: false,
        graph_confidence_decay: false,
        pragma_native_pack: false
      },
      native_readiness: {
        pragma: {
          pack: false
        }
      },
      facets_delta_status: null
    });
  });

  it("creates and updates a provisional projection through the public tool", async () => {
    let updateCalled = false;
    const query = vi.fn<DatabaseClient["query"]>(async (sql) => {
      if (sql.includes("SELECT id") && sql.includes("FROM mfo_projections")) {
        return updateCalled ? [{ id: "proj-1" }] : [];
      }

      if (sql.includes("INSERT INTO mfo_projections")) {
        updateCalled = true;
        return [{ id: "proj-1" }];
      }

      if (sql.includes("UPDATE mfo_projections")) {
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
});
