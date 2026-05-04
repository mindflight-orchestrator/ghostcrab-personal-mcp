import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { runStandaloneCoverageReportToon } from "../../db/standalone-mindbrain.js";

const THRESHOLD_FULL = 0.85;
const THRESHOLD_PARTIAL = 0.7;

export const CoverageInput = z.object({
  domain: z.string().trim().min(1),
  agent_id: z.string().min(1).default("agent:self"),
  workspace_id: z.string().min(1).optional()
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
    const input = CoverageInput.parse(args);
    const effectiveWorkspaceId =
      input.workspace_id ?? context.session.workspace_id;
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
      backend?: "native";
    }) => {
      const canProceed =
        coverageScore !== null && coverageScore >= THRESHOLD_FULL;
      const partial =
        coverageScore !== null &&
        coverageScore >= THRESHOLD_PARTIAL &&
        coverageScore < THRESHOLD_FULL;

      return createToolSuccessResult("ghostcrab_coverage", {
        agent_id: input.agent_id,
        domain: input.domain,
        workspace_id: effectiveWorkspaceId,
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
        backend: backend ?? "native"
      });
    };

    const parseScalar = (value: string): string | number | boolean | null => {
      if (value === "null") {
        return null;
      }
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
      const numeric = Number(value);
      if (value.trim() !== "" && Number.isFinite(numeric)) {
        return numeric;
      }
      return value;
    };

    const parseCoverageToon = (
      toon: string
    ): {
      coverage_ratio: number | null;
      covered_nodes: number;
      total_nodes: number;
      gaps: Array<{
        id: string;
        label: string;
        entity_type: string;
        criticality: string;
        decayed_confidence: number | null;
      }>;
    } | null => {
      const lines = toon.split(/\r?\n/).map((line) => line.trimEnd());
      const summary: Record<string, string | number | boolean | null> = {};
      const gaps: Array<{
        id: string;
        label: string;
        entity_type: string;
        criticality: string;
        decayed_confidence: number | null;
      }> = [];
      let mode: "root" | "summary" | "gaps" = "root";
      let gapColumns: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }
        if (line.startsWith("kind:")) {
          continue;
        }
        if (line === "summary:") {
          mode = "summary";
          continue;
        }
        const gapHeader = line.match(/^gaps(?:\[[^\]]*\])?\{([^}]*)\}:?$/);
        if (gapHeader) {
          mode = "gaps";
          gapColumns = gapHeader[1]
            .split("\t")
            .map((column) => column.trim())
            .filter(Boolean);
          continue;
        }

        if (mode === "summary") {
          const match = line.match(/^([^:]+):\s*(.*)$/);
          if (!match) {
            continue;
          }
          summary[match[1].trim()] = parseScalar(match[2].trim());
          continue;
        }

        if (mode === "gaps") {
          const values = line.split("\t");
          if (values.length < gapColumns.length) {
            continue;
          }
          const row = Object.fromEntries(
            gapColumns.map((column, index) => [
              column,
              values[index]?.trim() ?? ""
            ])
          ) as Record<string, string>;
          gaps.push({
            id: row.id ?? "",
            label: row.label ?? row.id ?? "",
            entity_type: row.entity_type ?? "unknown",
            criticality: row.criticality ?? "normal",
            decayed_confidence:
              row.decayed_confidence === undefined ||
              row.decayed_confidence === "" ||
              row.decayed_confidence === "null"
                ? null
                : Number(row.decayed_confidence)
          });
        }
      }

      if (typeof summary.coverage_ratio === "undefined") {
        return null;
      }

      return {
        coverage_ratio:
          summary.coverage_ratio === null
            ? null
            : Number(summary.coverage_ratio),
        covered_nodes: Number(summary.covered_nodes ?? 0),
        total_nodes: Number(summary.total_nodes ?? 0),
        gaps
      };
    };

    try {
      const config = resolveGhostcrabConfig();
      const toon = await runStandaloneCoverageReportToon({
        mindbrainUrl: config.mindbrainUrl,
        domainOrWorkspace: input.domain
      });
      const report = parseCoverageToon(toon);
      if (!report) {
        return buildResponse({
          coverageScore: null,
          message: `No ontology registered for domain: ${input.domain}.`,
          backend: "native"
        });
      }

      if (report.total_nodes === 0) {
        return buildResponse({
          coverageScore: null,
          message: `No ontology registered for domain: ${input.domain}.`,
          backend: "native"
        });
      }

      return buildResponse({
        coverageScore: report.coverage_ratio,
        coveredNodes: report.covered_nodes,
        totalNodes: report.total_nodes,
        gapNodes: report.gaps.map((node) => ({
          id: node.id,
          label: node.label,
          criticality: node.criticality,
          decayed_confidence: node.decayed_confidence
        })),
        backend: "native"
      });
    } catch (error) {
      return createToolErrorResult(
        "ghostcrab_coverage",
        error instanceof Error ? error.message : "coverage backend unavailable",
        "backend_unavailable"
      );
    }
  }
};

registerTool(coverageTool);
