import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const OntologyCoverageRefInput = z.object({
  workspace_id: z.string().trim().min(1),
  reference_workspace_id: z.string().trim().min(1)
});

export const ontologyCoverageRefTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_coverage_ref",
    description:
      "Read. Compute ontology coverage of a workspace relative to a reference workspace. Returns coverage ratio and gap analysis. Requires pg_mindbrain.",
    inputSchema: {
      type: "object",
      required: ["workspace_id", "reference_workspace_id"],
      properties: {
        workspace_id: {
          type: "string",
          minLength: 1,
          description: "The workspace whose coverage is being measured."
        },
        reference_workspace_id: {
          type: "string",
          minLength: 1,
          description: "The reference (gold-standard) workspace to compare against."
        }
      }
    }
  },
  async handler(args, context) {
    if (!context.extensions.pgMindbrain) {
      return createToolErrorResult(
        "ghostcrab_ontology_coverage_ref",
        "pg_mindbrain extension is not loaded; ghostcrab_ontology_coverage_ref requires pg_mindbrain.",
        "extension_not_loaded"
      );
    }

    const input = OntologyCoverageRefInput.parse(args);

    const rows = await context.database.query<{ result: unknown }>(
      `SELECT mb_ontology.compute_ontology_coverage($1::text, $2::text) AS result`,
      [input.workspace_id, input.reference_workspace_id]
    );

    return createToolSuccessResult("ghostcrab_ontology_coverage_ref", {
      workspace_id: input.workspace_id,
      reference_workspace_id: input.reference_workspace_id,
      coverage: rows[0]?.result ?? null
    });
  }
};

registerTool(ontologyCoverageRefTool);
