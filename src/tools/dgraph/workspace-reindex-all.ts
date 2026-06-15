import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { discoverWorkspaceReindexTargets } from "../../db/reindex-workspace.js";
import { ensureFactsFtsSync } from "../../db/facets-fts-sync.js";
import {
  runStandaloneReindexAll,
  runStandaloneReindexGraph
} from "../../db/standalone-mindbrain.js";
import {
  createToolErrorFromException,
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const WorkspaceReindexAllInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  document_table_id: z.coerce.number().int().positive().optional(),
  include_agent_facts: z.boolean().default(true),
  scope: z.enum(["all", "collections", "graph"]).default("all")
});

export interface CollectionReindexOutcome {
  collection_id: string;
  table_id: number;
  ok: boolean;
  backend?: string;
  bm25_documents?: number;
  facet_assignments?: number;
  graph_projected?: number;
  error?: string;
}

export const workspaceReindexAllTool: ToolHandler = {
  definition: {
    name: "ghostcrab_reindex_all",
    description:
      "Write. Rebuild all derived indexes for a workspace: every registered collection (BM25, facet postings, graph via MindBrain reindexAll) plus agent_facts FTS bootstrap by default. Use scope graph|collections|all to limit work.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        },
        document_table_id: {
          type: "integer",
          minimum: 1,
          description:
            "Optional facet table_id for graph entity-document projection when running graph-only fallback (no discoverable collections)."
        },
        include_agent_facts: {
          type: "boolean",
          default: true,
          description:
            "When true, run agent_facts FTS bootstrap (ensureFactsFtsSync) after collection reindex."
        },
        scope: {
          type: "string",
          enum: ["all", "collections", "graph"],
          default: "all",
          description:
            "all: collections loop + agent_facts FTS; collections: per-collection reindexAll only; graph: workspace graph reindex only."
        }
      }
    }
  },
  async handler(args, context) {
    const input = WorkspaceReindexAllInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    const config = resolveGhostcrabConfig();
    const warnings: string[] = [];
    const collectionsReindexed: CollectionReindexOutcome[] = [];
    let graphOnlyFallback = false;
    let graphResult: {
      backend: string;
      projected_count: number;
      document_table_id: number | null;
      adjacency_rebuilt: boolean;
    } | null = null;

    const runGraphReindex = async (documentTableId?: number) => {
      const native = await runStandaloneReindexGraph({
        mindbrainUrl: config.mindbrainUrl,
        timeoutMs: config.mindbrainHttpTimeoutMs,
        workspaceId,
        documentTableId
      });
      graphResult = {
        backend: "mindbrain/reindex/graph",
        projected_count: native.projected_count,
        document_table_id: documentTableId ?? null,
        adjacency_rebuilt: native.adjacency_rebuilt ?? true
      };
    };

    if (input.scope === "graph") {
      try {
        await runGraphReindex(input.document_table_id);
      } catch (error) {
        return createToolErrorFromException(
          "ghostcrab_reindex_all",
          error,
          "backend_reindex_failed",
          "workspace graph reindex failed"
        );
      }

      const agentFactsFts = input.include_agent_facts
        ? await ensureFactsFtsSync(context.database)
        : null;

      return createToolSuccessResult("ghostcrab_reindex_all", {
        workspace_id: workspaceId,
        scope: input.scope,
        discovery_source: null,
        collections_reindexed: [],
        skipped_collections: [],
        graph_only_fallback: false,
        graph: graphResult,
        agent_facts_fts: agentFactsFts,
        warnings
      });
    }

    const discovery = await discoverWorkspaceReindexTargets(
      context.database,
      workspaceId
    );

    if (discovery.skipped_collections.length > 0) {
      warnings.push(
        `Skipped ${discovery.skipped_collections.length} collection(s) without facet_tables.table_name match: ${discovery.skipped_collections.join(", ")}`
      );
    }

    if (discovery.targets.length === 0) {
      if (input.scope === "collections") {
        return createToolErrorResult(
          "ghostcrab_reindex_all",
          "No collections with facet_tables registration found for workspace; cannot run collections scope.",
          "no_reindex_targets",
          { workspace_id: workspaceId, skipped_collections: discovery.skipped_collections }
        );
      }

      graphOnlyFallback = true;
      warnings.push(
        "No discoverable collections; ran graph reindex only. BM25 and facet_postings were not rebuilt."
      );
      try {
        await runGraphReindex(input.document_table_id);
      } catch (error) {
        return createToolErrorFromException(
          "ghostcrab_reindex_all",
          error,
          "backend_reindex_failed",
          "workspace graph fallback reindex failed"
        );
      }
    } else {
      let successCount = 0;
      for (const target of discovery.targets) {
        try {
          const result = await runStandaloneReindexAll({
            mindbrainUrl: config.mindbrainUrl,
            timeoutMs: config.mindbrainHttpTimeoutMs,
            workspaceId,
            collectionId: target.collection_id,
            tableId: target.table_id
          });
          successCount += 1;
          collectionsReindexed.push({
            collection_id: target.collection_id,
            table_id: target.table_id,
            ok: true,
            backend: "mindbrain/reindex/all",
            bm25_documents: result.bm25_documents,
            facet_assignments: result.facet_assignments,
            graph_projected: result.graph_projected
          });
        } catch (error) {
          collectionsReindexed.push({
            collection_id: target.collection_id,
            table_id: target.table_id,
            ok: false,
            error: error instanceof Error ? error.message : "collection reindex failed"
          });
        }
      }

      if (successCount === 0) {
        return createToolErrorResult(
          "ghostcrab_reindex_all",
          "All collection reindex calls failed for workspace.",
          "backend_reindex_failed",
          {
            workspace_id: workspaceId,
            collections_reindexed: collectionsReindexed,
            skipped_collections: discovery.skipped_collections
          }
        );
      }

      if (successCount < discovery.targets.length) {
        warnings.push(
          `${discovery.targets.length - successCount} collection reindex call(s) failed; see collections_reindexed for details.`
        );
      }
    }

    const agentFactsFts = input.include_agent_facts
      ? await ensureFactsFtsSync(context.database)
      : null;

    return createToolSuccessResult("ghostcrab_reindex_all", {
      workspace_id: workspaceId,
      scope: input.scope,
      discovery_source: discovery.targets.length > 0 ? discovery.source : null,
      collections_reindexed: collectionsReindexed,
      skipped_collections: discovery.skipped_collections,
      graph_only_fallback: graphOnlyFallback,
      graph: graphResult,
      agent_facts_fts: agentFactsFts,
      warnings
    });
  }
};

registerTool(workspaceReindexAllTool);
