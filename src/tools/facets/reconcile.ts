import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";
import { reconcileFacetVocabularyWithReport } from "../../db/facet-reconciliation.js";

const FacetReconcileInput = z.object({
  apply: z.boolean().default(false)
});

export const facetReconcileTool: ToolHandler = {
  definition: {
    name: "ghostcrab_facet_reconcile",
    description:
      "Read/Write. Reconcile persisted facet definitions with native facet registration without creating columns.",
    inputSchema: {
      type: "object",
      properties: {
        apply: {
          type: "boolean",
          default: false
        }
      }
    }
  },
  async handler(args, context) {
    const input = FacetReconcileInput.parse(args);
    const report = await reconcileFacetVocabularyWithReport(
      context.database,
      context.extensions,
      { apply: input.apply }
    );

    return createToolSuccessResult("ghostcrab_facet_reconcile", {
      ...report,
      apply_requested: input.apply
    });
  }
};

registerTool(facetReconcileTool);
