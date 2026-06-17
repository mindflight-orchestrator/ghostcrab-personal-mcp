import { z } from "zod";

import { buildStatusPreamble } from "../../mcp/agent-brief.js";
import { buildImportPipelinesStatusPayload } from "../../mcp/import-pipelines.js";
import {
  buildWorkspaceContextDirectives,
  buildWorkspaceContextStatus
} from "../../mcp/workspace-context-status.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import { probeMindbrainCapabilities } from "../../db/standalone-mindbrain.js";
import { isFactsFtsReady } from "../../runtime/facets-fts-state.js";
import {
  GHOSTCRAB_MCP_SURFACE_VERSION,
  getPackageVersion
} from "../../version.js";
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

    // Phase 2: facets.bm25 reflects whether the FTS-sync bootstrap succeeded
    // at server startup (see src/db/facets-fts-sync.ts). When true, the
    // active ghostcrab_search bm25/hybrid path uses MindBrain FTS5 BM25;
    // when false, both modes fall back to keyword_sql substring scoring.
    const factsFtsReady = isFactsFtsReady();
    const sqliteReadiness = {
      facets: {
        registered: false,
        count: false,
        hierarchy: false,
        bm25: factsFtsReady,
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
      facets_count: sqliteReadiness.facets.count,
      facets_bm25: sqliteReadiness.facets.bm25,
      graph_traversal: sqliteReadiness.dgraph.entityNeighborhood,
      graph_marketplace_search: sqliteReadiness.dgraph.marketplace,
      graph_confidence_decay: sqliteReadiness.dgraph.confidenceDecay,
      graph_gap_diagnostics: false,
      graph_gap_rules: false,
      graph_gap_rules_import: false,
      graph_gap_rules_delete: false,
      graph_rule_evaluations: false,
      graph_rule_evaluations_run: false,
      graph_rule_events: false,
      pragma_pack: sqliteReadiness.pragma.pack,
      mb_ontology_available: sqliteReadiness.ontology.available,
      mb_ontology: {
        resolve_workspace: sqliteReadiness.ontology.resolveWorkspace,
        coverage_by_domain: sqliteReadiness.ontology.coverageByDomain,
        marketplace_by_domain: sqliteReadiness.ontology.marketplaceByDomain,
        export_workspace_model: sqliteReadiness.ontology.exportModel,
        validate_ddl_proposal: sqliteReadiness.ontology.validateDdl,
        register_entity_type: sqliteReadiness.ontology.registerEntityType,
        register_relation_type: sqliteReadiness.ontology.registerRelationType,
        compare_workspaces: sqliteReadiness.ontology.compareWorkspaces,
        bridge_workspaces: sqliteReadiness.ontology.bridgeWorkspaces,
        find_entity_bridges: sqliteReadiness.ontology.findEntityBridges,
        detect_conflicts: sqliteReadiness.ontology.detectConflicts,
        federated_search: sqliteReadiness.ontology.federatedSearch,
        ontology_coverage_ref: sqliteReadiness.ontology.computeOntologyCoverage,
        ingest_knowledge_chunk: sqliteReadiness.ontology.ingestKnowledgeChunk,
        ingest_knowledge_batch: sqliteReadiness.ontology.ingestKnowledgeBatch,
        create_project_template: sqliteReadiness.ontology.createProjectTemplate,
        instantiate_project: sqliteReadiness.ontology.instantiateProject,
        checkpoint_project: sqliteReadiness.ontology.checkpointProject
      }
    } as const;

    const config = resolveGhostcrabConfig();
    const capabilityProbe = await probeMindbrainCapabilities(
      config.mindbrainUrl
    );
    const runtimeCapabilities = {
      ...sqliteCapabilities,
      graph_gap_diagnostics:
        capabilityProbe.ok === true &&
        capabilityProbe.capabilities.features.graph_diagnostics === true,
      graph_gap_rules:
        capabilityProbe.ok === true &&
        capabilityProbe.capabilities.features.graph_gap_rules === true,
      graph_gap_rules_import:
        capabilityProbe.ok === true &&
        capabilityProbe.capabilities.features.graph_gap_rules_import === true,
      graph_gap_rules_delete:
        capabilityProbe.ok === true &&
        capabilityProbe.capabilities.features.graph_gap_rules_delete === true,
      graph_rule_evaluations:
        capabilityProbe.ok === true &&
        capabilityProbe.capabilities.features.graph_rule_evaluations === true,
      graph_rule_evaluations_run:
        capabilityProbe.ok === true &&
        capabilityProbe.capabilities.features.graph_rule_evaluations_run ===
          true,
      graph_rule_events:
        capabilityProbe.ok === true &&
        capabilityProbe.capabilities.features.graph_rule_events === true
    };

    const directives: string[] = [...buildWorkspaceContextDirectives()];
    if (!runtimeCapabilities.graph_gap_diagnostics) {
      directives.push(
        "Backend missing graph diagnostics routes — rebuild ghostcrab-backend (pnpm run prebuild:local) and restart."
      );
    }

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
      `SELECT COUNT(*) AS count FROM mb_pragma.agent_facts`
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
        : "keyword_only";

    const embeddingsIssue =
      embeddingsStatus === "degraded_but_retryable" ||
      embeddingsStatus === "misconfigured_or_blocked"
        ? embeddingsStatus
        : null;

    const ghostcrabPackageVersion = await getPackageVersion();

    return createToolSuccessResult("ghostcrab_status", {
      preamble: buildStatusPreamble(),
      versions: {
        ghostcrab_package: ghostcrabPackageVersion,
        mcp_surface: GHOSTCRAB_MCP_SURFACE_VERSION,
        mindbrain:
          capabilityProbe.ok &&
          typeof capabilityProbe.capabilities.mindbrain_version === "string"
            ? capabilityProbe.capabilities.mindbrain_version
            : null
      },
      agent_id: input.agent_id,
      snapshot_at: new Date().toISOString(),
      active_workspace_id: context.session.workspace_id,
      active_schema_id: context.session.schema_id,
      workspace_context: buildWorkspaceContextStatus(),
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
        sqlite_readiness: sqliteReadiness,
        capabilities: runtimeCapabilities,
        mindbrain_capabilities_probe: capabilityProbe.ok
          ? {
              ok: true,
              mindbrain_version:
                capabilityProbe.capabilities.mindbrain_version ?? null,
              features: capabilityProbe.capabilities.features
            }
          : {
              ok: false,
              reason: capabilityProbe.reason
            },
        backends: {
          facets: "sql",
          graph: "mindbrain",
          pragma: "mindbrain"
        }
      },
      directives,
      next_actions: [],
      operational: {
        health: state.health,
        state: state.state,
        metrics
      },
      import_pipelines: buildImportPipelinesStatusPayload()
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
