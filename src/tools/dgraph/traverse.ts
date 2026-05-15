import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runStandaloneTraverse } from "../../db/standalone-mindbrain.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const TraverseInput = z.object({
  start: z.string().trim().min(1),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  edge_labels: z.array(z.string().min(1).max(63)).max(50).default([]),
  depth: z.coerce.number().int().min(1).max(10).default(3),
  target: z.string().min(1).optional(),
  workspace_id: z.string().min(1).optional()
});

export const traverseTool: ToolHandler = {
  definition: {
    name: "ghostcrab_traverse",
    description:
      "Traverse the directed knowledge graph from a start node and return the discovered path.",
    inputSchema: {
      type: "object",
      required: ["start"],
      properties: {
        start: {
          type: "string"
        },
        direction: {
          type: "string",
          enum: ["outbound", "inbound"],
          default: "outbound"
        },
        edge_labels: {
          type: "array",
          items: {
            type: "string"
          }
        },
        depth: {
          type: "integer",
          default: 3,
          minimum: 1,
          maximum: 10
        },
        target: {
          type: "string"
        },
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Overrides session context for this call only."
        }
      }
    }
  },
  async handler(args, context) {
    const input = TraverseInput.parse(args);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;

    const parseMetadata = (value: unknown): Record<string, unknown> => {
      if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
      }
      if (typeof value === "string" && value.length > 0) {
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === "object" && parsed !== null) {
            return parsed as Record<string, unknown>;
          }
        } catch { /* non-JSON metadata — return empty object */ }
      }
      return {};
    };
    const config = resolveGhostcrabConfig();
    let rows: Array<{
      node_id: string;
      node_label: string;
      node_type: string;
      properties: Record<string, unknown>;
      edge_label: string | null;
      depth: number;
      path: string[];
    }>;
    let targetFound: boolean | null;

    try {
      const result = await runStandaloneTraverse({
        mindbrainUrl: config.mindbrainUrl,
        start: input.start,
        direction: input.direction,
        edgeLabels: input.edge_labels,
        depth: input.depth,
        target: input.target
      });

      rows = result.rows.map((row) => ({
        node_id: row.node_id,
        node_label: row.node_label,
        node_type: row.node_type,
        properties: parseMetadata(row.metadata_json),
        edge_label: row.edge_label,
        depth: row.depth,
        path: row.path
      }));
      targetFound = input.target ? result.target_found : null;
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_traverse",
        error instanceof Error ? error.message : "traverse backend unavailable",
        "backend_unavailable"
      );
    }

    const graphBackend = "api/mindbrain/traverse";

    const normalizedRows = Array.isArray(rows)
      ? rows.map((row) => ({
          ...row,
          path: Array.isArray(row.path)
            ? row.path.filter(
                (segment): segment is string =>
                  typeof segment === "string" && segment.length > 0
              )
            : [],
          properties:
            typeof row.properties === "object" && row.properties !== null
              ? row.properties
              : {}
        }))
      : [];

    const targetRow = input.target
      ? normalizedRows.find((row) => row.node_id === input.target)
      : undefined;
    const selectedRows = targetRow
      ? normalizedRows.filter((row) => targetRow.path.includes(row.node_id))
      : normalizedRows;

    const gapCandidates = selectedRows.filter((row) => {
      if (row.node_id === input.start || row.node_type !== "concept") {
        return false;
      }

      const masteryValue = row.properties.mastery;
      const mastery =
        typeof masteryValue === "number"
          ? masteryValue
          : Number(masteryValue ?? 0);

      return !Number.isFinite(mastery) || mastery <= 0;
    });

    return createToolSuccessResult("ghostcrab_traverse", {
      start_node: input.start,
      workspace_id: effectiveWorkspaceId,
      direction: input.direction,
      edge_labels: input.edge_labels,
      depth: input.depth,
      target: input.target ?? null,
      path: selectedRows,
      node_count: selectedRows.length,
      gap_candidates: gapCandidates.map((node) => ({
        id: node.node_id,
        label: node.node_label,
        via: node.edge_label
      })),
      graph_backend: graphBackend,
      backend: "native",
      target_found: targetFound ?? (input.target ? Boolean(targetRow) : null)
    });
  }
};

registerTool(traverseTool);
