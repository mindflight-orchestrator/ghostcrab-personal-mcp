import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { callNativeOrFallback } from "../../db/dispatch.js";
import { GRAPH_ENTITY_TYPE } from "../../db/graph.js";
import { runStandaloneTraverse } from "../../db/standalone-mindbrain.js";
import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const TraverseInput = z.object({
  start: z.string().trim().min(1),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  edge_labels: z
    .array(z.string().min(1).max(63))
    .max(50)
    .default([]),
  depth: z.coerce.number().int().min(1).max(10).default(3),
  target: z.string().min(1).optional()
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
        }
      }
    }
  },
  async handler(args, context) {
    const input = TraverseInput.parse(args);

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
        } catch {}
      }
      return {};
    };

    type TraversalRow = {
      depth: number;
      edge_label: string | null;
      node_id: string;
      node_label: string;
      node_type: string;
      path: string[];
      properties: Record<string, unknown>;
    };

    const sqliteTraversalFallback = async (): Promise<TraversalRow[]> => {
      const startRows = await context.database.query<{
        entity_id: number;
        name: string;
        metadata_json: string | null;
      }>(
        `
          SELECT entity_id, name, metadata_json
          FROM graph_entity
          WHERE entity_type = ? AND name = ?
          LIMIT 1
        `,
        [GRAPH_ENTITY_TYPE, input.start]
      );

      if (startRows.length === 0) {
        return [];
      }

      const startRow = startRows[0];
      const startMeta = parseMetadata(startRow.metadata_json);
      const rows: TraversalRow[] = [
        {
          node_id: startRow.name,
          node_label:
            typeof startMeta.label === "string" ? startMeta.label : startRow.name,
          node_type:
            typeof startMeta.node_type === "string" ? startMeta.node_type : "entity",
          properties: startMeta,
          edge_label: null,
          depth: 0,
          path: [startRow.name]
        }
      ];

      const visited = new Set<string>([startRow.name]);
      let frontier = [
        {
          entity_id: startRow.entity_id,
          node_id: startRow.name,
          path: [startRow.name],
          depth: 0
        }
      ];

      for (let hop = 0; hop < input.depth; hop += 1) {
        const nextFrontier: Array<{
          entity_id: number;
          node_id: string;
          path: string[];
          depth: number;
        }> = [];

        for (const current of frontier) {
          const relationRows = await context.database.query<{
            edge_label: string;
            entity_id: number;
            node_id: string;
            metadata_json: string | null;
          }>(
            input.direction === "outbound"
              ? `
                SELECT
                  r.relation_type AS edge_label,
                  n.entity_id AS entity_id,
                  n.name AS node_id,
                  n.metadata_json AS metadata_json
                FROM graph_relation r
                JOIN graph_entity n ON n.entity_id = r.target_id
                WHERE r.source_id = ?
                  ${input.edge_labels.length > 0 ? `AND r.relation_type IN (${input.edge_labels.map(() => "?").join(", ")})` : ""}
              `
              : `
                SELECT
                  r.relation_type AS edge_label,
                  n.entity_id AS entity_id,
                  n.name AS node_id,
                  n.metadata_json AS metadata_json
                FROM graph_relation r
                JOIN graph_entity n ON n.entity_id = r.source_id
                WHERE r.target_id = ?
                  ${input.edge_labels.length > 0 ? `AND r.relation_type IN (${input.edge_labels.map(() => "?").join(", ")})` : ""}
              `,
            [current.entity_id, ...input.edge_labels]
          );

          for (const relation of relationRows) {
            if (visited.has(relation.node_id)) {
              continue;
            }
            if (current.path.includes(relation.node_id)) {
              continue;
            }

            const meta = parseMetadata(relation.metadata_json);
            const path = [...current.path, relation.node_id];
            const row: TraversalRow = {
              node_id: relation.node_id,
              node_label:
                typeof meta.label === "string" ? meta.label : relation.node_id,
              node_type:
                typeof meta.node_type === "string" ? meta.node_type : "entity",
              properties: meta,
              edge_label: relation.edge_label,
              depth: current.depth + 1,
              path
            };

            rows.push(row);
            visited.add(relation.node_id);

            if (!input.target || relation.node_id !== input.target) {
              nextFrontier.push({
                entity_id: relation.entity_id,
                node_id: relation.node_id,
                path,
                depth: current.depth + 1
              });
            }
          }
        }

        frontier = nextFrontier;
        if (frontier.length === 0) {
          break;
        }
      }

      return rows;
    };

    const sqliteTraversal = async (): Promise<{
      rows: TraversalRow[];
      targetFound: boolean | null;
    }> => {
      const config = resolveGhostcrabConfig();

      try {
        const result = await runStandaloneTraverse({
          sqlitePath: config.sqlitePath,
          start: input.start,
          direction: input.direction,
          edgeLabels: input.edge_labels,
          depth: input.depth,
          target: input.target
        });

        return {
          rows: result.rows.map((row) => ({
            node_id: row.node_id,
            node_label: row.node_label,
            node_type: row.node_type,
            properties: parseMetadata(row.metadata_json),
            edge_label: row.edge_label,
            depth: row.depth,
            path: row.path
          })),
          targetFound: input.target ? result.target_found : null
        };
      } catch {
        return {
          rows: await sqliteTraversalFallback(),
          targetFound: null
        };
      }
    };

    // Native neighborhood path: only for depth=1, no target (path-finding needs CTE),
    // pg_dgraph loaded, and not sql-only mode.
    const canUseNeighborhood =
      context.extensions.pgDgraph &&
      context.nativeExtensionsMode !== "sql-only" &&
      input.depth === 1 &&
      !input.target;

    const nativeNeighborhood = async (): Promise<TraversalRow[]> => {
      // Resolve entity id and metadata for the start node so the root row
      // matches the SQL CTE output (real label and properties).
      const [entityRow] = await context.database.query<{
        id: string;
        metadata: Record<string, unknown> | null;
      }>(
        `SELECT id, metadata FROM graph.entity WHERE type = $1 AND name = $2`,
        [GRAPH_ENTITY_TYPE, input.start]
      );
      if (!entityRow) return [];

      // entity_neighborhood returns JSONB with outbound/inbound arrays.
      const [nbRow] = await context.database.query<{ neighborhood: unknown }>(
        `SELECT graph.entity_neighborhood($1::bigint, 10, 10, 0.5) AS neighborhood`,
        [entityRow.id]
      );
      if (!nbRow?.neighborhood) return [];

      const nb = nbRow.neighborhood as {
        outbound?: Array<{
          name?: string;
          label?: string;
          node_type?: string;
          metadata?: Record<string, unknown>;
          relation_type?: string;
        }>;
        inbound?: Array<{
          name?: string;
          label?: string;
          node_type?: string;
          metadata?: Record<string, unknown>;
          relation_type?: string;
        }>;
        outgoing?: Array<{
          target?: string;
          target_type?: string;
          confidence?: number;
          type?: string;
        }>;
        incoming?: Array<{
          source?: string;
          source_type?: string;
          confidence?: number;
          type?: string;
        }>;
      };

      const outboundRelations = [
        ...(nb.outbound ?? []),
        ...((nb.outgoing ?? []).map((relation) => ({
          name: relation.target,
          label: relation.target,
          node_type: relation.target_type,
          metadata: {},
          relation_type: relation.type
        })) ?? [])
      ];
      const inboundRelations = [
        ...(nb.inbound ?? []),
        ...((nb.incoming ?? []).map((relation) => ({
          name: relation.source,
          label: relation.source,
          node_type: relation.source_type,
          metadata: {},
          relation_type: relation.type
        })) ?? [])
      ];

      // Pick the relation list based on direction.
      const relations =
        input.direction === "outbound" ? outboundRelations : inboundRelations;

      // Apply edge_labels post-filter when specified.
      const filtered =
        input.edge_labels.length > 0
          ? relations.filter((r) =>
              input.edge_labels.includes(r.relation_type ?? "")
            )
          : relations;

      const nodeNames = filtered
        .map((relation) => relation.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0);
      const metadataRows =
        nodeNames.length > 0
          ? await context.database.query<{
              metadata: Record<string, unknown> | null;
              name: string;
            }>(
              `SELECT name, metadata
               FROM graph.entity
               WHERE type = $1
                 AND name = ANY($2::text[])`,
              [GRAPH_ENTITY_TYPE, nodeNames]
            )
          : [];
      const metadataByName = new Map(
        metadataRows.map((row) => [row.name, row.metadata ?? {}])
      );

      const rows: TraversalRow[] = filtered.map((r) => {
        const entityMetadata: Record<string, unknown> =
          metadataByName.get(r.name ?? "") ?? r.metadata ?? {};
        return {
          node_id: r.name ?? "",
          node_label:
            typeof entityMetadata["label"] === "string"
              ? String(entityMetadata["label"])
              : (r.label ?? r.name ?? ""),
          node_type:
            typeof entityMetadata["node_type"] === "string"
              ? String(entityMetadata["node_type"])
              : (r.node_type ?? "entity"),
          properties: entityMetadata,
          edge_label: r.relation_type ?? null,
          depth: 1,
          path: [input.start, r.name ?? ""]
        };
      });

      const startMeta = entityRow.metadata ?? {};
      // Prepend start node at depth 0, using real metadata to match the SQL CTE output.
      return [
        {
          node_id: input.start,
          node_label:
            typeof startMeta["label"] === "string"
              ? startMeta["label"]
              : input.start,
          node_type:
            typeof startMeta["node_type"] === "string"
              ? startMeta["node_type"]
              : "entity",
          properties: startMeta,
          edge_label: null,
          depth: 0,
          path: [input.start]
        },
        ...rows
      ];
    };

    const sqlTraversal = async (): Promise<TraversalRow[]> => {
      const joinOutbound =
        input.direction === "outbound"
          ? "JOIN graph.relation r ON r.source_id = t.entity_id JOIN graph.entity n2 ON n2.id = r.target_id"
          : "JOIN graph.relation r ON r.target_id = t.entity_id JOIN graph.entity n2 ON n2.id = r.source_id";

      const params: unknown[] = [input.start, input.depth, GRAPH_ENTITY_TYPE];
      const labelParamIndex = 4;
      const labelFilter =
        input.edge_labels.length > 0
          ? `AND r.type = ANY($${labelParamIndex}::text[])`
          : "";
      if (input.edge_labels.length > 0) {
        params.push(input.edge_labels);
      }

      return context.database.query<TraversalRow>(
        `
          WITH RECURSIVE traversal AS (
            SELECT
              n.id AS entity_id,
              n.name AS node_id,
              COALESCE(n.metadata->>'label', n.name) AS node_label,
              COALESCE(n.metadata->>'node_type', 'entity') AS node_type,
              n.metadata AS properties,
              NULL::text AS edge_label,
              0 AS depth,
              ARRAY[n.name] AS path
            FROM graph.entity n
            WHERE n.type = $3 AND n.name = $1

            UNION ALL

            SELECT
              n2.id AS entity_id,
              n2.name AS node_id,
              COALESCE(n2.metadata->>'label', n2.name) AS node_label,
              COALESCE(n2.metadata->>'node_type', 'entity') AS node_type,
              n2.metadata AS properties,
              r.type AS edge_label,
              t.depth + 1 AS depth,
              t.path || n2.name AS path
            FROM traversal t
            ${joinOutbound}
            WHERE t.depth < $2
              AND r.deprecated_at IS NULL
              AND (r.valid_to IS NULL OR r.valid_to >= CURRENT_DATE)
              ${labelFilter}
              AND NOT n2.name = ANY(t.path)
          )
          SELECT DISTINCT ON (node_id)
            node_id,
            node_label,
            node_type,
            properties,
            edge_label,
            depth,
            path
          FROM traversal
          ORDER BY node_id, depth
        `,
        params
      );
    };

    let sqliteTargetFound: boolean | null = null;
    const traversalResult =
      context.database.kind === "sqlite"
        ? await (async () => {
            const result = await sqliteTraversal();
            sqliteTargetFound = result.targetFound;
            return { value: result.rows, backend: "sql" as const };
          })()
        : await callNativeOrFallback({
            useNative: canUseNeighborhood,
            native: nativeNeighborhood,
            fallback: sqlTraversal
          });

    const { value: rows, backend } = traversalResult;

    const graphBackend =
      backend === "native"
        ? "graph.entity_neighborhood"
        : context.database.kind === "sqlite"
          ? "graph_entity"
          : "graph.entity";

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
      direction: input.direction,
      edge_labels: input.edge_labels,
      depth: input.depth,
      target: input.target ?? null,
      target_found: sqliteTargetFound ?? (input.target ? Boolean(targetRow) : null),
      path: selectedRows,
      node_count: selectedRows.length,
      gap_candidates: gapCandidates.map((node) => ({
        id: node.node_id,
        label: node.node_label,
        via: node.edge_label
      })),
      graph_backend: graphBackend,
      backend
    });
  }
};

registerTool(traverseTool);
