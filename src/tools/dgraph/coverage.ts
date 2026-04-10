import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { callNativeOrFallback } from "../../db/dispatch.js";

const THRESHOLD_FULL = 0.85;
const THRESHOLD_PARTIAL = 0.7;

export const CoverageInput = z.object({
  domain: z.string().trim().min(1),
  agent_id: z.string().min(1).default("agent:self")
});

export const coverageTool: ToolHandler = {
  definition: {
    name: "ghostcrab_coverage",
    description:
      "Check epistemic coverage for a domain against its registered ontology.",
    inputSchema: {
      type: "object",
      required: ["domain"],
      properties: {
        domain: {
          type: "string"
        },
        agent_id: {
          type: "string",
          default: "agent:self"
        }
      }
    }
  },
  async handler(args, context) {
    const input = CoverageInput.parse(args);
    const buildResponse = ({
      coverageScore,
      coveredNodes,
      totalNodes,
      gapNodes,
      message,
      backend
    }: {
      coverageScore: number | null;
      coveredNodes?: number;
      totalNodes?: number;
      gapNodes?: Array<{
        id: string;
        label: string;
        criticality: string;
        decayed_confidence: number | null;
      }>;
      message?: string;
      backend?: "sql" | "native";
    }) => {
      const canProceed = coverageScore !== null && coverageScore >= THRESHOLD_FULL;
      const partial =
        coverageScore !== null &&
        coverageScore >= THRESHOLD_PARTIAL &&
        coverageScore < THRESHOLD_FULL;

      return createToolSuccessResult("ghostcrab_coverage", {
        agent_id: input.agent_id,
        domain: input.domain,
        coverage_score:
          coverageScore === null ? null : Number(coverageScore.toFixed(3)),
        covered_nodes: coveredNodes ?? 0,
        total_nodes: totalNodes ?? 0,
        gap_nodes: gapNodes ?? [],
        can_proceed_autonomously: canProceed,
        recommended_action:
          coverageScore === null
            ? "escalate"
            : canProceed
              ? "proceed"
              : partial
                ? "proceed_with_disclosure"
                : "escalate",
        thresholds: {
          full: THRESHOLD_FULL,
          partial: THRESHOLD_PARTIAL
        },
        message,
        backend: backend ?? "sql"
      });
    };

    const { value } = await callNativeOrFallback({
      useNative: context.extensions.pgFacets && context.extensions.pgDgraph,
      native: async () => {
        const rows = await context.database.query<{
          payload: {
            workspace_id: string | null;
            resolved_workspace_id?: string | null;
            coverage_ratio: number | null;
            covered_nodes: number;
            total_nodes: number;
            gaps?: Array<{
              id: string;
              label?: string | null;
              criticality?: string | null;
            }>;
          };
        }>(
          `SELECT mb_ontology.coverage_by_domain($1::text) AS payload`,
          [input.domain]
        );

        const payload = rows[0]?.payload;
        if (!payload) {
          throw new Error("mb_ontology.coverage_by_domain returned no payload");
        }

        if (
          !payload.resolved_workspace_id ||
          (payload.total_nodes ?? 0) === 0
        ) {
          return buildResponse({
            coverageScore: null,
            message: `No ontology registered for domain: ${input.domain}.`,
            backend: "native"
          });
        }

        return buildResponse({
          coverageScore: payload.coverage_ratio ?? null,
          coveredNodes: payload.covered_nodes ?? 0,
          totalNodes: payload.total_nodes ?? 0,
          gapNodes: (payload.gaps ?? []).map((node) => ({
            id: node.id,
            label: node.label ?? node.id,
            criticality: node.criticality ?? "normal",
            decayed_confidence: null
          })),
          backend: "native"
        });
      },
      fallback: async () => {
        if (context.database.kind === "sqlite") {
          const agentNodes = await context.database.query<{
            id: string;
            label: string;
          }>(
            `
              SELECT
                name AS id,
                COALESCE(json_extract(metadata_json, '$.label'), name) AS label
              FROM graph_entity
              WHERE entity_type = 'entity'
                AND json_extract(metadata_json, '$.domain') = ?
            `,
            [input.domain]
          );

          const ontologyNodes = await context.database.query<{
            criticality: string | null;
            id: string;
            label: string | null;
          }>(
            `
              SELECT
                json_extract(facets_json, '$.node_id') AS id,
                json_extract(facets_json, '$.label') AS label,
                json_extract(facets_json, '$.criticality') AS criticality
              FROM mfo_facets
              WHERE schema_id = 'mfo:ontology'
                AND json_extract(facets_json, '$.domain') = ?
            `,
            [input.domain]
          );

          if (ontologyNodes.length === 0) {
            return buildResponse({
              coverageScore: null,
              message: `No ontology registered for domain: ${input.domain}.`,
              backend: "sql"
            });
          }

          const agentNodeIds = new Set(agentNodes.map((node) => node.id));
          const gapNodes = ontologyNodes.filter((node) => !agentNodeIds.has(node.id));
          const coveredNodes = ontologyNodes.length - gapNodes.length;
          const coverageScore = coveredNodes / ontologyNodes.length;

          return buildResponse({
            coverageScore,
            coveredNodes,
            totalNodes: ontologyNodes.length,
            gapNodes: gapNodes.map((node) => ({
              id: node.id,
              label: node.label ?? node.id,
              criticality: node.criticality ?? "normal",
              decayed_confidence: null
            })),
            backend: "sql"
          });
        }

        const agentNodes = await context.database.query<{
          id: string;
          label: string;
        }>(
          `
            SELECT name AS id,
                   COALESCE(metadata->>'label', name) AS label
            FROM graph.entity
            WHERE type = 'entity'
              AND metadata @> $1::jsonb
          `,
          [JSON.stringify({ domain: input.domain })]
        );

        const ontologyNodes = await context.database.query<{
          criticality: string | null;
          id: string;
          label: string | null;
        }>(
          `
            SELECT
              facets->>'node_id' AS id,
              facets->>'label' AS label,
              facets->>'criticality' AS criticality
            FROM mfo_facets
            WHERE schema_id = 'mfo:ontology'
              AND facets @> $1::jsonb
          `,
          [JSON.stringify({ domain: input.domain })]
        );

        if (ontologyNodes.length === 0) {
          return buildResponse({
            coverageScore: null,
            message: `No ontology registered for domain: ${input.domain}.`,
            backend: "sql"
          });
        }

        const agentNodeIds = new Set(agentNodes.map((node) => node.id));
        const gapNodes = ontologyNodes.filter((node) => !agentNodeIds.has(node.id));
        const coveredNodes = ontologyNodes.length - gapNodes.length;
        const coverageScore = coveredNodes / ontologyNodes.length;

        const decayByName = new Map<string, number | null>();
        if (context.extensions.pgDgraph && gapNodes.length > 0) {
          const names = gapNodes.map((n) => n.id);
          const decayRows = await context.database.query<{
            name: string;
            decayed: number;
          }>(
            `
              SELECT g.name, graph.confidence_decay(g.id, 90)::float4 AS decayed
              FROM graph.entity g
              WHERE g.type = 'entity'
                AND g.name = ANY($1::text[])
            `,
            [names]
          );
          for (const row of decayRows) {
            decayByName.set(row.name, row.decayed);
          }
        }

        return buildResponse({
          coverageScore,
          coveredNodes,
          totalNodes: ontologyNodes.length,
          gapNodes: gapNodes.map((node) => ({
            id: node.id,
            label: node.label ?? node.id,
            criticality: node.criticality ?? "normal",
            decayed_confidence: context.extensions.pgDgraph
              ? (decayByName.get(node.id) ?? null)
              : null
          })),
          backend: "sql"
        });
      }
    });

    return value;
  }
};

registerTool(coverageTool);
