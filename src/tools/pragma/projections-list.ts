import { z } from "zod";

import {
  runListAnswerArtifacts,
  type AnswerArtifactKind,
  type AnswerArtifactListRow
} from "../../db/answer-artifacts.js";
import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import {
  ANALYSIS_PLAN_KIND,
  ANSWER_SNAPSHOT_KIND,
  LEGACY_PROJECTION_TYPE_A,
  LEGACY_PROJECTION_TYPE_B
} from "./answer-artifact-overlay.js";

const PROJECTIONS_LIST_DESCRIPTION = [
  "Read. Catalogue discoverable projections for a workspace before reading content.",
  "Sources: (1) mindbrain_answer_artifacts registry — analysis_plan, live_answer_view, answer_snapshot;",
  "(2) optional graph scan — distinct projection_id on ProjectionResult entities when include_graph is true.",
  "Returns projections[] with public_label (user-facing), artifact_id, projection_id, artifact_kind, legacy_kind, source (registry|graph), and suggested_tools.",
  "Routing: analysis_plan → ghostcrab_artifact_get, ghostcrab_pack;",
  "live_answer_view → ghostcrab_artifact_get, ghostcrab_live_refresh;",
  "answer_snapshot or graph → ghostcrab_projection_get.",
  "Does not return pack rows, payloads, or graph evidence. kind filter: analysis_plan | live_answer_view | answer_snapshot | graph.",
  "With kind analysis_plan or live_answer_view, graph scan is skipped. Operator doc: docs/reference/projections-discovery.md."
].join(" ");

const PROJECTION_ARTIFACT_KINDS = [
  ANALYSIS_PLAN_KIND,
  "live_answer_view",
  ANSWER_SNAPSHOT_KIND
] as const satisfies readonly AnswerArtifactKind[];

export const ProjectionsListInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  kind: z
    .enum([...PROJECTION_ARTIFACT_KINDS, "graph"])
    .optional(),
  agent_id: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
  include_graph: z.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

type ProjectionListEntry = {
  source: "registry" | "graph";
  artifact_kind: string | null;
  artifact_id: string | null;
  projection_id: string | null;
  slug: string | null;
  public_label: string;
  lifecycle: string | null;
  state: string | null;
  legacy_ref: string | null;
  legacy_kind: string | null;
  suggested_tools: string[];
};

function suggestedToolsForKind(
  kind: AnswerArtifactKind | "graph"
): string[] {
  switch (kind) {
    case ANALYSIS_PLAN_KIND:
      return ["ghostcrab_artifact_get", "ghostcrab_pack"];
    case "live_answer_view":
      return ["ghostcrab_artifact_get", "ghostcrab_live_refresh"];
    case ANSWER_SNAPSHOT_KIND:
      return ["ghostcrab_projection_get", "ghostcrab_artifact_get"];
    case "graph":
      return ["ghostcrab_projection_get"];
    default:
      return ["ghostcrab_artifact_get"];
  }
}

function legacyKindForArtifactKind(
  kind: AnswerArtifactKind
): string | null {
  if (kind === ANALYSIS_PLAN_KIND) {
    return LEGACY_PROJECTION_TYPE_A;
  }
  if (kind === ANSWER_SNAPSHOT_KIND) {
    return LEGACY_PROJECTION_TYPE_B;
  }
  return null;
}

function mapRegistryRow(row: AnswerArtifactListRow): ProjectionListEntry {
  return {
    source: "registry",
    artifact_kind: row.artifact_kind,
    artifact_id: row.artifact_id,
    projection_id: extractProjectionId(row),
    slug: row.slug,
    public_label: row.public_label,
    lifecycle: row.lifecycle,
    state: row.state,
    legacy_ref: row.legacy_ref,
    legacy_kind: legacyKindForArtifactKind(row.artifact_kind),
    suggested_tools: suggestedToolsForKind(row.artifact_kind)
  };
}

function extractProjectionId(row: AnswerArtifactListRow): string | null {
  if (row.artifact_kind === ANSWER_SNAPSHOT_KIND) {
    return row.slug || null;
  }
  if (row.legacy_ref?.startsWith("projection:")) {
    return row.legacy_ref.slice("projection:".length) || null;
  }
  return null;
}

async function listRegistryProjections(params: {
  mindbrainUrl: string;
  workspaceId: string;
  kind?: AnswerArtifactKind;
  agentId?: string;
  scope?: string;
  limit: number;
}): Promise<AnswerArtifactListRow[]> {
  const rows = await runListAnswerArtifacts({
    mindbrainUrl: params.mindbrainUrl,
    workspaceId: params.workspaceId,
    kind: params.kind,
    agentId: params.agentId,
    scope: params.scope,
    limit: params.limit
  });

  if (params.kind) {
    return rows;
  }

  const allowedKinds = new Set<string>(PROJECTION_ARTIFACT_KINDS);
  return rows.filter((row) => allowedKinds.has(row.artifact_kind));
}

async function listGraphProjectionIds(
  database: Parameters<ToolHandler["handler"]>[1]["database"],
  workspaceId: string,
  limit: number
): Promise<
  Array<{
    projection_id: string;
    name: string;
    collection_id: string | null;
  }>
> {
  return database.query<{
    projection_id: string;
    name: string;
    collection_id: string | null;
  }>(
    `
      SELECT DISTINCT
        json_extract(ge.metadata_json, '$.projection_id') AS projection_id,
        ge.name,
        json_extract(ge.metadata_json, '$.collection_id') AS collection_id
      FROM graph_entity ge
      WHERE ge.workspace_id = $1
        AND ge.entity_type = 'ProjectionResult'
        AND json_extract(ge.metadata_json, '$.projection_id') IS NOT NULL
        AND trim(json_extract(ge.metadata_json, '$.projection_id')) != ''
      ORDER BY projection_id
      LIMIT $2
    `,
    [workspaceId, limit]
  );
}

export const projectionsListTool: ToolHandler = {
  definition: {
    name: "ghostcrab_projections_list",
    description: PROJECTIONS_LIST_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the active MCP session workspace. Required when the session has no pinned workspace."
        },
        kind: {
          type: "string",
          enum: [...PROJECTION_ARTIFACT_KINDS, "graph"],
          description:
            "Optional filter. analysis_plan | live_answer_view | answer_snapshot limit registry rows; graph lists only ProjectionResult projection_id values. Omit for all registry kinds plus optional graph append."
        },
        agent_id: {
          type: "string",
          description:
            "Optional registry filter — mainly analysis_plan rows bound to an agent (e.g. agent:self)."
        },
        scope: {
          type: "string",
          description:
            "Optional registry filter on artifact scope (often equals workspace id for analysis plans)."
        },
        include_graph: {
          type: "boolean",
          default: true,
          description:
            "When true, append graph ProjectionResult projection_id values not already listed. Ignored when kind is analysis_plan or live_answer_view."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 100,
          description:
            "Maximum rows per source (registry SQL and graph SQL each apply this limit)."
        }
      }
    }
  },
  async handler(args, context) {
    const input = ProjectionsListInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    if (!workspaceId) {
      return createToolErrorResult(
        "ghostcrab_projections_list",
        "workspace_id is required when the MCP session has no active workspace.",
        "missing_workspace"
      );
    }

    const notes: string[] = [];
    const entries: ProjectionListEntry[] = [];

    if (input.kind !== "graph") {
      const registryKind = input.kind;

      try {
        const registryRows = await listRegistryProjections({
          mindbrainUrl: resolveGhostcrabConfig().mindbrainUrl,
          workspaceId,
          kind: registryKind,
          agentId: input.agent_id,
          scope: input.scope,
          limit: input.limit
        });
        entries.push(...registryRows.map(mapRegistryRow));
      } catch (error) {
        return createToolErrorResult(
          "ghostcrab_projections_list",
          error instanceof Error
            ? error.message
            : "Failed to list answer-artifact registry projections.",
          "backend_unavailable"
        );
      }
    }

    if (input.include_graph && input.kind !== ANALYSIS_PLAN_KIND && input.kind !== "live_answer_view") {
      const graphRows = await listGraphProjectionIds(
        context.database,
        workspaceId,
        input.limit
      );
      const knownProjectionIds = new Set(
        entries
          .map((entry) => entry.projection_id)
          .filter((value): value is string => typeof value === "string")
      );

      for (const row of graphRows) {
        if (knownProjectionIds.has(row.projection_id)) {
          continue;
        }
        entries.push({
          source: "graph",
          artifact_kind: ANSWER_SNAPSHOT_KIND,
          artifact_id: null,
          projection_id: row.projection_id,
          slug: row.projection_id,
          public_label: row.name || row.projection_id,
          lifecycle: "frozen",
          state: null,
          legacy_ref: null,
          legacy_kind: LEGACY_PROJECTION_TYPE_B,
          suggested_tools: suggestedToolsForKind("graph")
        });
      }
    }

    return createToolSuccessResult("ghostcrab_projections_list", {
      workspace_id: workspaceId,
      backend: "native",
      count: entries.length,
      projections: entries,
      filters: {
        kind: input.kind ?? "all",
        agent_id: input.agent_id ?? null,
        scope: input.scope ?? null,
        include_graph: input.include_graph
      },
      notes: [
        "Use public_label when speaking to the user; artifact_kind and legacy_kind are routing hints only.",
        "Each projections[] row includes suggested_tools — call those next; this tool does not return payloads or pack content.",
        "Output fields per row: source, public_label, artifact_kind, artifact_id, projection_id, slug, lifecycle, state, legacy_ref, legacy_kind, suggested_tools.",
        ...notes
      ]
    });
  }
};

registerTool(projectionsListTool);
