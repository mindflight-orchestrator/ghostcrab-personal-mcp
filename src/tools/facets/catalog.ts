import { z } from "zod";

import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolExecutionContext,
  type ToolHandler
} from "../registry.js";
import {
  buildFacetDefinitionRecord,
  FACET_DEFINITION_SCHEMA_ID,
  getFacetCatalogSnapshot,
  listPersistedFacetDefinitions,
  loadPersistedFacetDefinition,
  upsertFacetDefinitionRecord,
  validateFacetRecordBatch
} from "../../db/facet-vocabulary.js";
import {
  FACET_CATALOG,
  isKnownFacetName
} from "../../db/facet-catalog.js";

const FacetInspectInput = z.object({
  facet_name: z.string().min(1)
});

const FacetValidateRecordInput = z.object({
  schema_id: z.string().min(1).optional(),
  facets: z.record(z.string(), z.unknown()).default({}),
  lookup_facets: z.record(z.string(), z.unknown()).default({})
});

const FacetValidateInput = z.object({
  strict: z.boolean().default(false),
  record: FacetValidateRecordInput.optional(),
  records: z.array(FacetValidateRecordInput).optional()
});

const FacetRegisterInput = z.object({
  definition: z
    .object({
      facet_name: z.string().min(1),
      label: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      native: z.boolean().optional(),
      native_column: z.string().nullable().optional(),
      native_kind: z.enum(["plain", "boolean"]).nullable().optional()
    })
    .strict()
});

async function getPersistedFacetNames(
  context: Pick<ToolExecutionContext, "database">
): Promise<Set<string>> {
  const rows = await listPersistedFacetDefinitions(context.database);
  return new Set(
    rows
      .map((row) => String(row.facets.facet_name ?? ""))
      .filter((facetName) => facetName.length > 0)
  );
}

export const facetCatalogTool: ToolHandler = {
  definition: {
    name: "ghostcrab_facet_catalog",
    description:
      "Read. List the declared GhostCrab facet vocabulary and its native registration state.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  async handler(_args, context) {
    const persistedFacetNames = await getPersistedFacetNames(context);

    const catalog = getFacetCatalogSnapshot().map((entry) => ({
      facet_name: entry.facetName,
      description: entry.description,
      native: Boolean(entry.native),
      native_column: entry.native_column,
      native_kind: entry.native_kind,
      declared: true,
      persisted_definition: persistedFacetNames.has(entry.facetName),
      native_registered: false
    }));

    const persistedOnly = [...persistedFacetNames]
      .filter((facetName) => !isKnownFacetName(facetName))
      .sort((left, right) => left.localeCompare(right));
    const persistedOnlyDefinitions = persistedOnly.map((facetName) => ({
      facet_name: facetName
    }));

    return createToolSuccessResult("ghostcrab_facet_catalog", {
      schema_id: FACET_DEFINITION_SCHEMA_ID,
      total: catalog.length,
      catalog,
      persisted_only: persistedOnly,
      persisted_only_definitions: persistedOnlyDefinitions,
      native_registration_supported: false
    });
  }
};

export const facetInspectTool: ToolHandler = {
  definition: {
    name: "ghostcrab_facet_inspect",
    description:
      "Read. Inspect a single facet definition and its persisted/runtime state.",
    inputSchema: {
      type: "object",
      required: ["facet_name"],
      properties: {
        facet_name: {
          type: "string",
          minLength: 1
        }
      }
    }
  },
  async handler(args, context) {
    const input = FacetInspectInput.parse(args);
    const catalogEntry = FACET_CATALOG.find(
      (entry) => entry.facetName === input.facet_name
    );

    const persisted = await loadPersistedFacetDefinition(
      context.database,
      input.facet_name
    );

    if (!catalogEntry && !persisted) {
      return createToolErrorResult(
        "ghostcrab_facet_inspect",
        `Unknown facet name: ${input.facet_name}`,
        "unknown_facet_name"
      );
    }

    return createToolSuccessResult("ghostcrab_facet_inspect", {
      facet_name: input.facet_name,
      declared: Boolean(catalogEntry),
      native: Boolean(catalogEntry?.native),
      native_column: catalogEntry?.native?.column ?? null,
      native_kind: catalogEntry?.native?.kind ?? null,
      native_registered: false,
      persisted_definition: persisted
        ? {
            id: persisted.id,
            content: persisted.content,
            facets: persisted.facets,
            created_at: persisted.created_at
          }
        : null
    });
  }
};

export const facetValidateTool: ToolHandler = {
  definition: {
    name: "ghostcrab_facet_validate",
    description:
      "Read. Validate facet keys against the declared vocabulary before writing or importing records.",
    inputSchema: {
      type: "object",
      properties: {
        strict: {
          type: "boolean",
          default: false
        },
        record: {
          type: "object",
          properties: {
            schema_id: {
              type: "string"
            },
            facets: {
              type: "object",
              additionalProperties: true
            },
            lookup_facets: {
              type: "object",
              additionalProperties: true
            }
          }
        },
        records: {
          type: "array",
          items: {
            type: "object",
            properties: {
              schema_id: {
                type: "string"
              },
              facets: {
                type: "object",
                additionalProperties: true
              },
              lookup_facets: {
                type: "object",
                additionalProperties: true
              }
            }
          }
        }
      }
    }
  },
  async handler(args, context) {
    const input = FacetValidateInput.parse(args);
    const records =
      input.records ??
      (input.record ? [input.record] : []);

    if (records.length === 0) {
      return createToolErrorResult(
        "ghostcrab_facet_validate",
        "Provide a record or records array to validate.",
        "validation_error"
      );
    }

    const persistedFacetNames = await getPersistedFacetNames(context);
    const allowedFacetNames = new Set([
      ...FACET_CATALOG.map((entry) => entry.facetName),
      ...persistedFacetNames
    ]);

    const issues = validateFacetRecordBatch(records, allowedFacetNames);
    const valid = issues.length === 0;

    if (!valid && input.strict) {
      return createToolErrorResult(
        "ghostcrab_facet_validate",
        "Facet validation failed.",
        "facet_validation_failed",
        {
          issues
        }
      );
    }

    return createToolSuccessResult("ghostcrab_facet_validate", {
      valid,
      issues,
      validated: records.length,
      strict: input.strict
    });
  }
};

export const facetRegisterTool: ToolHandler = {
  definition: {
    name: "ghostcrab_facet_register",
    description:
      "Write. Register or update a facet definition in the durable facet-definition store.",
    inputSchema: {
      type: "object",
      required: ["definition"],
      properties: {
        definition: {
          type: "object",
          required: ["facet_name"],
          additionalProperties: false,
          properties: {
            facet_name: {
              type: "string",
              minLength: 1
            },
            label: {
              type: "string"
            },
            description: {
              type: "string"
            },
            native: {
              type: "boolean"
            },
            native_column: {
              type: ["string", "null"]
            },
            native_kind: {
              type: ["string", "null"],
              enum: ["plain", "boolean", null]
            }
          }
        }
      }
    }
  },
  async handler(args, context) {
    const input = FacetRegisterInput.parse(args);
    const catalogEntry = FACET_CATALOG.find(
      (entry) => entry.facetName === input.definition.facet_name
    );

    if (!catalogEntry && !input.definition.label && !input.definition.description) {
      return createToolErrorResult(
        "ghostcrab_facet_register",
        "Unknown facet names must include an explicit label or description so the record is self-describing.",
        "unknown_facet_name"
      );
    }

    const validationIssues = validateFacetRecordBatch(
      [
        {
          schema_id: FACET_DEFINITION_SCHEMA_ID,
          facets: {
            facet_name: input.definition.facet_name,
            label: input.definition.label ?? undefined,
            description: input.definition.description ?? undefined,
            native: input.definition.native ?? catalogEntry?.native !== undefined,
            native_column:
              input.definition.native_column ?? catalogEntry?.native?.column ?? null,
            native_kind:
              input.definition.native_kind ?? catalogEntry?.native?.kind ?? null
          }
        }
      ],
      [input.definition.facet_name]
    );

    if (validationIssues.length > 0) {
      return createToolErrorResult(
        "ghostcrab_facet_register",
        "Facet definition payload failed validation.",
        "facet_validation_failed",
        {
          issues: validationIssues
        }
      );
    }

    const record = buildFacetDefinitionRecord(input.definition.facet_name, {
      label: input.definition.label,
      description: input.definition.description,
      native: input.definition.native,
      native_column: input.definition.native_column,
      native_kind: input.definition.native_kind
    });

    const { id, created } = await upsertFacetDefinitionRecord(
      context.database,
      record
    );

    return createToolSuccessResult("ghostcrab_facet_register", {
      registered: true,
      created,
      id,
      facet_name: record.facet_name,
      cataloged: Boolean(catalogEntry)
    });
  }
};

registerTool(facetCatalogTool);
registerTool(facetInspectTool);
registerTool(facetValidateTool);
registerTool(facetRegisterTool);
