import { z } from "zod";

import { buildStatusPreamble } from "../../mcp/agent-brief.js";
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
      "Bootstrap — call first for normal work. On first-turn fuzzy GhostCrab onboarding, do not call unless the user explicitly asked about readiness, available surfaces, or runtime health. Returns routing, autonomy policies, activity families, and runtime diagnostics. Prefer calling only when health, autonomy, or global blockers may materially affect the answer; do not surface backend-health commentary unless it changes the user-visible answer.",
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

    const sqliteNativeReadiness = {
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
        entityNeighborhood: true,
        entityDegree: false
      },
      pragma: {
        pack: true
      },
      ontology: {
        available: true,
        resolveWorkspace: true,
        coverageByDomain: true,
        marketplaceByDomain: true,
        exportModel: true,
        validateDdl: true,
        registerEntityType: true,
        registerRelationType: true,
        compareWorkspaces: true,
        bridgeWorkspaces: true,
        findEntityBridges: true,
        detectConflicts: true,
        federatedSearch: true,
        computeOntologyCoverage: true,
        ingestKnowledgeChunk: true,
        ingestKnowledgeBatch: true,
        createProjectTemplate: true,
        instantiateProject: true,
        checkpointProject: true
      }
    } as const;
    const sqliteCapabilities = {
      facets_native_count: sqliteNativeReadiness.facets.count,
      facets_native_bm25: sqliteNativeReadiness.facets.bm25,
      graph_native_traversal: sqliteNativeReadiness.dgraph.entityNeighborhood,
      graph_marketplace_search: sqliteNativeReadiness.dgraph.marketplace,
      graph_confidence_decay: sqliteNativeReadiness.dgraph.confidenceDecay,
      pragma_native_pack: sqliteNativeReadiness.pragma.pack,
      mb_ontology_available: sqliteNativeReadiness.ontology.available,
      mb_ontology: {
        resolve_workspace: sqliteNativeReadiness.ontology.resolveWorkspace,
        coverage_by_domain: sqliteNativeReadiness.ontology.coverageByDomain,
        marketplace_by_domain:
          sqliteNativeReadiness.ontology.marketplaceByDomain,
        export_workspace_model: sqliteNativeReadiness.ontology.exportModel,
        validate_ddl_proposal: sqliteNativeReadiness.ontology.validateDdl,
        register_entity_type: sqliteNativeReadiness.ontology.registerEntityType,
        register_relation_type:
          sqliteNativeReadiness.ontology.registerRelationType,
        compare_workspaces: sqliteNativeReadiness.ontology.compareWorkspaces,
        bridge_workspaces: sqliteNativeReadiness.ontology.bridgeWorkspaces,
        find_entity_bridges: sqliteNativeReadiness.ontology.findEntityBridges,
        detect_conflicts: sqliteNativeReadiness.ontology.detectConflicts,
        federated_search: sqliteNativeReadiness.ontology.federatedSearch,
        ontology_coverage_ref:
          sqliteNativeReadiness.ontology.computeOntologyCoverage,
        ingest_knowledge_chunk:
          sqliteNativeReadiness.ontology.ingestKnowledgeChunk,
        ingest_knowledge_batch:
          sqliteNativeReadiness.ontology.ingestKnowledgeBatch,
        create_project_template:
          sqliteNativeReadiness.ontology.createProjectTemplate,
        instantiate_project: sqliteNativeReadiness.ontology.instantiateProject,
        checkpoint_project: sqliteNativeReadiness.ontology.checkpointProject
      }
    } as const;
    const [stateRow] = await context.database.query<{
      health: string;
      metrics_json: string;
      state: string;
    }>(
      `
          SELECT health, state, metrics_json
          FROM mb_pragma.agent_state
          WHERE agent_id = ?
        `,
      [input.agent_id]
    );
    const [facetCountRow] = await context.database.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM mb_pragma.facets`
    );
    const [projectionCountRow] = await context.database.query<{
      count: number;
    }>(`SELECT COUNT(*) AS count FROM mb_pragma.projections`);
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

    const embeddingsStatus = embeddingRuntime.failure
      ? embeddingRuntime.failure.recoverable
        ? "degraded_but_retryable"
        : "misconfigured_or_blocked"
      : embeddingRuntime.vectorSearchReady
        ? "ready"
        : "bm25_only";

    const embeddingsIssue =
      embeddingsStatus === "degraded_but_retryable" ||
      embeddingsStatus === "misconfigured_or_blocked"
        ? embeddingsStatus
        : null;

    return createToolSuccessResult("ghostcrab_status", {
      preamble: buildStatusPreamble(),
      agent_id: input.agent_id,
      snapshot_at: new Date().toISOString(),
      active_workspace_id: context.session.workspace_id,
      active_schema_id: context.session.schema_id,
      summary: {
        attention_required: {
          health: state.health !== "GREEN" ? state.health : null,
          embeddings_status: embeddingsIssue
        },
        informational: {
          health: state.health,
          agent_state: state.state,
          database_kind: "sqlite",
          embeddings_status: embeddingsStatus,
          facet_rows: Number(facetCountRow?.count ?? 0),
          projection_rows: Number(projectionCountRow?.count ?? 0),
          graph_entities: Number(entityCountRow?.count ?? 0),
          graph_relations: Number(relationCountRow?.count ?? 0)
        }
      },
      runtime: {
        database_kind: "sqlite",
        sqlite_backing_store: true,
        embeddings: embeddingRuntime,
        retrieval: {
          hybrid_bm25_weight: context.retrieval.hybridBm25Weight,
          hybrid_vector_weight: context.retrieval.hybridVectorWeight
        },
        native_readiness: sqliteNativeReadiness,
        capabilities: sqliteCapabilities,
        backends: {
          facets: "sql",
          graph: "native",
          pragma: "native"
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
};

registerTool(statusTool);

function safeParseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
