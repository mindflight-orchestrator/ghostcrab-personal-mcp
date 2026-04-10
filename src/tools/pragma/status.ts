import { z } from "zod";

import { computeSubsystemBackends } from "../../db/extension-probe.js";
import { getNativeRuntimeReadiness } from "../../db/native-readiness.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const StatusInput = z.object({
  agent_id: z.string().min(1).default("agent:self")
});

export const statusTool: ToolHandler = {
  definition: {
    name: "ghostcrab_status",
    description:
      "Return an operational and epistemic snapshot with auto-executable directives.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          default: "agent:self"
        }
      }
    }
  },
  async handler(args, context) {
    const input = StatusInput.parse(args);
    const embeddingRuntime = context.embeddings.getStatus();

    if (context.database.kind === "sqlite") {
      const [stateRow] = await context.database.query<{
        health: string;
        metrics_json: string;
        state: string;
      }>(
        `
          SELECT health, state, metrics_json
          FROM mfo_agent_state
          WHERE agent_id = ?
        `,
        [input.agent_id]
      );
      const [facetCountRow] = await context.database.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM mfo_facets`
      );
      const [projectionCountRow] = await context.database.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM mfo_projections`
      );
      const [entityCountRow] = await context.database.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM graph_entity`
      );
      const [relationCountRow] = await context.database.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM graph_relation`
      );

      const metrics = safeParseJsonObject(stateRow?.metrics_json ?? "{}");
      const state = stateRow ?? {
        health: "GREEN",
        state: "IDLE",
        metrics_json: "{}"
      };

      return createToolSuccessResult("ghostcrab_status", {
        agent_id: input.agent_id,
        snapshot_at: new Date().toISOString(),
        summary: {
          health: state.health,
          agent_state: state.state,
          database_kind: "sqlite",
          facet_rows: Number(facetCountRow?.count ?? 0),
          projection_rows: Number(projectionCountRow?.count ?? 0),
          graph_entities: Number(entityCountRow?.count ?? 0),
          graph_relations: Number(relationCountRow?.count ?? 0)
        },
        runtime: {
          database_kind: "sqlite",
          sqlite_backing_store: true,
          native_extensions_mode: context.nativeExtensionsMode,
          embeddings: embeddingRuntime,
          retrieval: {
            hybrid_bm25_weight: context.retrieval.hybridBm25Weight,
            hybrid_vector_weight: context.retrieval.hybridVectorWeight
          },
          extensions_detected: {
            pg_facets: false,
            pg_dgraph: false,
            pg_pragma: false,
            pg_mindbrain: false
          },
          native_readiness: {
            facets: {
              registered: false,
              count: false,
              hierarchy: false,
              bm25: false,
              deltaMerge: false
            },
            dgraph: {
              marketplace: false,
              patch: false,
              confidenceDecay: false,
              entityNeighborhood: false,
              entityDegree: false
            },
            pragma: {
              pack: false
            },
            ontology: {
              available: false,
              resolveWorkspace: false,
              coverageByDomain: false,
              marketplaceByDomain: false,
              exportModel: false,
              validateDdl: false
            }
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
          backends: {
            facets: "sql",
            graph: "sql",
            pragma: "sql"
          }
        },
        directives: [],
        next_actions: [],
        operational: {
          health: state.health,
          state: state.state,
          metrics
        }
      });
    }

    const [stateRow] = await context.database.query<{
      health: string;
      metrics: Record<string, unknown>;
      state: string;
    }>(
      `
        SELECT health, state, metrics
        FROM mfo_agent_state
        WHERE agent_id = $1
      `,
      [input.agent_id]
    );

    const activityFamilyRows = await context.database.query<{
      activity_family: string;
      keywords: unknown;
      title: string | null;
    }>(
      `
        SELECT
          facets->>'activity_family' AS activity_family,
          facets->'keywords' AS keywords,
          facets->>'title' AS title
        FROM mfo_facets
        WHERE schema_id = 'ghostcrab:activity-family'
      `
    );

    const capabilityRows = await context.database.query<{
      autonomy_level: string | null;
      capability: string;
      requires_confirmation: boolean | null;
      scope: string | null;
    }>(
      `
        SELECT
          facets->>'capability' AS capability,
          facets->>'scope' AS scope,
          facets->>'autonomy_level' AS autonomy_level,
          (facets->>'requires_confirmation')::boolean AS requires_confirmation
        FROM mfo_facets
        WHERE schema_id = 'ghostcrab:capability'
      `
    );

    const policyRows = await context.database.query<{
      action: string | null;
      confirmation_required: boolean | null;
      policy_id: string;
      scope: string | null;
    }>(
      `
        SELECT
          facets->>'policy_id' AS policy_id,
          facets->>'scope' AS scope,
          facets->>'action' AS action,
          (facets->>'confirmation_required')::boolean AS confirmation_required
        FROM mfo_facets
        WHERE schema_id = 'ghostcrab:autonomy-policy'
      `
    );
    const intentRows = await context.database.query<{
      candidate_activity_families: unknown;
      default_action: string | null;
      intent_id: string;
      job: string;
      requires_ghostcrab: boolean | null;
    }>(
      `
        SELECT
          facets->>'intent_id' AS intent_id,
          facets->>'job' AS job,
          facets->>'default_action' AS default_action,
          (facets->>'requires_ghostcrab')::boolean AS requires_ghostcrab,
          facets->'candidate_activity_families' AS candidate_activity_families
        FROM mfo_facets
        WHERE schema_id = 'ghostcrab:intent-pattern'
      `
    );
    const signalRows = await context.database.query<{
      candidate_activity_families: unknown;
      examples: unknown;
      signal_id: string;
      signal_type: string | null;
    }>(
      `
        SELECT
          facets->>'signal_id' AS signal_id,
          facets->>'signal_type' AS signal_type,
          facets->'examples' AS examples,
          facets->'candidate_activity_families' AS candidate_activity_families
        FROM mfo_facets
        WHERE schema_id = 'ghostcrab:signal-pattern'
      `
    );
    const ingestRows = await context.database.query<{
      pattern_id: string;
      privacy_mode: string | null;
      recommended_action: string | null;
      recommended_activity_family: string | null;
      source_kind: string;
    }>(
      `
        SELECT
          facets->>'pattern_id' AS pattern_id,
          facets->>'source_kind' AS source_kind,
          facets->>'recommended_action' AS recommended_action,
          facets->>'recommended_activity_family' AS recommended_activity_family,
          facets->>'privacy_mode' AS privacy_mode
        FROM mfo_facets
        WHERE schema_id = 'ghostcrab:ingest-pattern'
      `
    );

    const gapRows = await context.database.query<{ id: string; label: string }>(
      `
        SELECT n.name AS id,
               COALESCE(n.metadata->>'label', n.name) AS label
        FROM graph.relation r
        JOIN graph.entity s ON s.id = r.source_id AND s.type = 'entity'
        JOIN graph.entity n ON n.id = r.target_id AND n.type = 'entity'
        WHERE s.name = $1
          AND r.type = 'HAS_GAP'
          AND r.deprecated_at IS NULL
          AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
      `,
      [input.agent_id]
    );

    const blockingRows = await context.database.query<{ content: string }>(
      `
        SELECT content
        FROM mfo_projections
        WHERE agent_id = $1
          AND proj_type = 'CONSTRAINT'
          AND status = 'blocking'
          AND (expires_at IS NULL OR expires_at > now())
      `,
      [input.agent_id]
    );

    let facetsDeltaStatus: Array<{
      table_name: string;
      delta_count: string;
      delta_size_mb: string;
      recommendation: string;
    }> | null = null;
    if (context.extensions.pgFacets) {
      try {
        facetsDeltaStatus = await context.database.query(
          `SELECT table_name, delta_count, delta_size_mb, recommendation FROM facets.delta_status()`
        );
      } catch (err) {
        console.warn(
          "[ghostcrab:status] facets.delta_status() failed:",
          err instanceof Error ? err.message : err
        );
        facetsDeltaStatus = null;
      }
    }
    const nativeReadiness = await getNativeRuntimeReadiness(
      context.database,
      context.extensions
    );

    const state = stateRow ?? {
      health: "GREEN",
      state: "IDLE",
      metrics: {}
    };
    const metrics =
      typeof state.metrics === "object" && state.metrics !== null
        ? state.metrics
        : {};
    const knownActivityFamilies = activityFamilyRows
      .filter((row) => typeof row.activity_family === "string" && row.activity_family.length > 0)
      .map((row) => ({
        activity_family: row.activity_family,
        title: row.title ?? row.activity_family,
        keywords: Array.isArray(row.keywords)
          ? row.keywords.filter((item): item is string => typeof item === "string")
          : []
      }));
    const capabilitySet = new Set(
      capabilityRows
        .map((row) => row.capability)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    const canModelProvisionalDomain = capabilitySet.has(
      "create_provisional_domain_model"
    );
    const canCreateProjection = capabilitySet.has("generate_dynamic_projection");
    const canExtendExistingDomain = capabilitySet.has("extend_existing_domain");
    const requiresConfirmationForSchemaFreeze = capabilityRows.some(
      (row) =>
        row.capability === "register_canonical_schema" &&
        row.requires_confirmation === true
    );
    const preferDynamicProjection = policyRows.some(
      (row) => row.action === "prefer_dynamic_projection"
    );
    const directives: Array<Record<string, unknown>> = [];
    const avgLatencyMs = Number(metrics.avg_latency_ms ?? 0);
    const tokenBudgetRemaining = Number(
      metrics.token_budget_remaining ?? 99999
    );

    if (avgLatencyMs > 500) {
      directives.push({
        condition: "avg_latency_ms > 500",
        action: "throttle_parallel_tools"
      });
    }

    if (tokenBudgetRemaining < 2000) {
      directives.push({
        condition: "token_budget_remaining < 2000",
        action: "switch_to_compact_mode"
      });
    }

    if (gapRows.length > 0) {
      directives.push({
        condition: "open_gap_nodes > 0",
        action: "escalate_to_human",
        gaps: gapRows
      });
    }

    if (blockingRows.length > 0) {
      directives.push({
        condition: "blocking_constraints > 0",
        action: "resolve_constraints_first"
      });
    }

    if (canModelProvisionalDomain) {
      directives.push({
        condition: "repeated_workflow_requested",
        action: "read_modeling_recipe_then_create_provisional_model"
      });
    }

    if (preferDynamicProjection) {
      directives.push({
        condition: "heartbeat_or_working_context_requested",
        action: "prefer_dynamic_projection_over_static_file"
      });
    }

    if (embeddingRuntime.failure) {
      directives.push({
        condition: `embeddings_failure = ${embeddingRuntime.failure.code}`,
        action: embeddingRuntime.failure.recoverable
          ? "continue_with_bm25_and_retry_embeddings"
          : "fix_embeddings_configuration"
      });
    }

    if (state.health === "RED") {
      directives.push({
        condition: "health = RED",
        action: "pause_all_non_critical"
      });
    }

    const summary = {
      health: state.health,
      agent_state: state.state,
      embeddings_status: embeddingRuntime.failure
        ? embeddingRuntime.failure.recoverable
          ? "degraded_but_retryable"
          : "misconfigured_or_blocked"
        : embeddingRuntime.vectorSearchReady
          ? "ready"
          : "bm25_only",
      autonomy_mode: canModelProvisionalDomain
        ? requiresConfirmationForSchemaFreeze
          ? "guided-autonomous-with-schema-confirmation"
          : "guided-autonomous"
        : "read-only",
      gap_status:
        gapRows.length > 0 ? "requires_disclosure_or_escalation" : "clear",
      constraint_status:
        blockingRows.length > 0 ? "blocking_constraints_present" : "clear"
    };

    const next_actions = directives.map((directive) => directive.action);

    return createToolSuccessResult("ghostcrab_status", {
      agent_id: input.agent_id,
      snapshot_at: new Date().toISOString(),
      summary,
      operational: {
        health: state.health,
        state: state.state,
        ...metrics
      },
      epistemic: {
        open_gap_nodes: gapRows.length,
        blocking_gaps: gapRows.length,
        gap_nodes: gapRows
      },
      routing_policy: {
        ghostcrab_required_for: intentRows
          .filter((row) => row.requires_ghostcrab)
          .map((row) => row.job),
        known_intents: intentRows.map((row) => ({
          intent_id: row.intent_id,
          job: row.job,
          default_action: row.default_action,
          candidate_activity_families: Array.isArray(
            row.candidate_activity_families
          )
            ? row.candidate_activity_families
            : []
        })),
        signal_patterns: signalRows.map((row) => ({
          signal_id: row.signal_id,
          signal_type: row.signal_type,
          examples: Array.isArray(row.examples) ? row.examples : [],
          candidate_activity_families: Array.isArray(
            row.candidate_activity_families
          )
            ? row.candidate_activity_families
            : []
        })),
        ingest_patterns: ingestRows.map((row) => ({
          pattern_id: row.pattern_id,
          source_kind: row.source_kind,
          recommended_action: row.recommended_action,
          recommended_activity_family: row.recommended_activity_family,
          privacy_mode: row.privacy_mode
        }))
      },
      autonomy: {
        can_model_provisional_domain: canModelProvisionalDomain,
        can_create_projection: canCreateProjection,
        can_extend_existing_domain: canExtendExistingDomain,
        requires_confirmation_for_schema_freeze:
          requiresConfirmationForSchemaFreeze,
        capabilities: capabilityRows,
        policies: policyRows
      },
      activity_discovery: {
        known_activity_families: knownActivityFamilies,
        suggested_recipe_queries: [
          "schema_id=ghostcrab:activity-family",
          "schema_id=ghostcrab:modeling-recipe",
          "schema_id=ghostcrab:projection-recipe",
          "schema_id=ghostcrab:kpi-pattern"
        ]
      },
      blocking_constraints: blockingRows,
      runtime: {
        embeddings: embeddingRuntime,
        retrieval: {
          hybrid_bm25_weight: context.retrieval.hybridBm25Weight,
          hybrid_vector_weight: context.retrieval.hybridVectorWeight
        },
        native_extensions_mode: context.nativeExtensionsMode,
        extensions_detected: {
          pg_facets: context.extensions.pgFacets,
          pg_dgraph: context.extensions.pgDgraph,
          pg_pragma: context.extensions.pgPragma,
          pg_mindbrain: context.extensions.pgMindbrain ?? false
        },
        backends: computeSubsystemBackends(
          context.extensions,
          context.nativeExtensionsMode
        ),
        native_readiness: nativeReadiness,
        capabilities: {
          facets_native_count: nativeReadiness.facets.count,
          facets_native_bm25: nativeReadiness.facets.bm25,
          graph_native_traversal: nativeReadiness.dgraph.entityNeighborhood,
          graph_marketplace_search: nativeReadiness.dgraph.marketplace,
          graph_confidence_decay: nativeReadiness.dgraph.confidenceDecay,
          pragma_native_pack: nativeReadiness.pragma.pack,
          mb_ontology_available: nativeReadiness.ontology.available
        },
        facets_delta_status: facetsDeltaStatus
      },
      projection_guidance: {
        prefer_dynamic_projection: preferDynamicProjection,
        default_projection_budget: 120,
        heartbeat_policy: preferDynamicProjection
          ? "projection-first"
          : "static-heartbeat-allowed"
      },
      directives,
      next_actions
    });
  }
};

registerTool(statusTool);

function safeParseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
