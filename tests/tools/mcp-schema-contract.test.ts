import { describe, expect, it } from "vitest";

import { coverageTool, CoverageInput } from "../../src/tools/dgraph/coverage.js";
import {
  graphSearchTool,
  GraphSearchInput
} from "../../src/tools/dgraph/graph-search.js";
import { learnTool, LearnInput } from "../../src/tools/dgraph/learn.js";
import {
  traverseTool,
  TraverseInput
} from "../../src/tools/dgraph/traverse.js";
import { countTool, CountInput } from "../../src/tools/facets/count.js";
import {
  facetCatalogTool,
  facetInspectTool,
  facetRegisterTool,
  facetValidateTool
} from "../../src/tools/facets/catalog.js";
import { rememberTool, RememberInput } from "../../src/tools/facets/remember.js";
import { searchTool, SearchInput } from "../../src/tools/facets/search.js";
import {
  schemaInspectTool,
  schemaListTool,
  SchemaInspectInput,
  SchemaListInput,
  schemaRegisterTool,
  SchemaRegisterInput,
  schemaOnboardingTool,
  ONBOARDING_SCHEMA_IDS
} from "../../src/tools/facets/schema.js";
import { upsertTool, UpsertInput } from "../../src/tools/facets/upsert.js";
import { packTool, PackInput } from "../../src/tools/pragma/pack.js";
import {
  projectTool,
  ProjectInput
} from "../../src/tools/pragma/project.js";
import {
  projectionGetTool,
  ProjectionGetInput
} from "../../src/tools/pragma/projection-get.js";
import { statusTool, StatusInput } from "../../src/tools/pragma/status.js";
import {
  toolSearchTool,
  ToolSearchInput
} from "../../src/tools/tool-search.js";
import {
  loadoutApplyTool,
  loadoutInspectTool,
  loadoutListTool,
  loadoutSuggestTool
} from "../../src/tools/workspace/loadouts.js";
import { loadoutSeedTool } from "../../src/tools/workspace/loadout-seed.js";
import { workspaceExportToonTool } from "../../src/tools/workspace/export-toon.js";

/**
 * Guards against MCP inputSchema drift from Zod: the LLM-visible JSON Schema
 * should document nested shapes (e.g. match.facets, definition.schema_id).
 *
 * Note: zod-to-json-schema does not emit useful schemas for Zod 4.x in this
 * project, so we assert structure + golden Zod parses instead of a full diff.
 */
describe("MCP inputSchema contract (drift guard)", () => {
  describe("ghostcrab_upsert", () => {
    const match = (
      upsertTool.definition.inputSchema as {
        properties: { match: Record<string, unknown> };
      }
    ).properties.match;

    it("documents match.facets and forbids extra keys on match", () => {
      expect(match.additionalProperties).toBe(false);
      expect(
        (match.properties as Record<string, unknown> | undefined)?.facets
      ).toBeDefined();
    });

    it("Zod accepts facet keys only under match.facets", () => {
      expect(
        UpsertInput.safeParse({
          schema_id: "mindbrain:note",
          match: { facets: { record_id: "r:1" } },
          set_content: "body"
        }).success
      ).toBe(true);

      expect(
        UpsertInput.safeParse({
          schema_id: "mindbrain:note",
          match: { label: "wrong nesting" },
          set_content: "body"
        }).success
      ).toBe(false);
    });

    it("documents set_facets as an open object", () => {
      const setFacets = (
        upsertTool.definition.inputSchema as {
          properties: { set_facets: Record<string, unknown> };
        }
      ).properties.set_facets;
      expect(setFacets.type).toBe("object");
      expect(setFacets.additionalProperties).toBe(true);
    });
  });

  describe("ghostcrab_schema_register", () => {
    const definition = (
      schemaRegisterTool.definition.inputSchema as {
        properties: { definition: Record<string, unknown> };
      }
    ).properties.definition;

    it("requires schema_id and description inside definition in MCP schema", () => {
      expect(definition.required).toEqual(
        expect.arrayContaining(["schema_id", "description"])
      );
      expect(definition.additionalProperties).toBe(true);
      expect(
        (definition.properties as Record<string, unknown> | undefined)
          ?.schema_id
      ).toBeDefined();
    });

    it("Zod rejects schema_id only at payload root", () => {
      expect(
        SchemaRegisterInput.safeParse({
          target: "facets",
          schema_id: "my:schema",
          definition: { description: "only description under definition" }
        }).success
      ).toBe(false);
    });

    it("Zod accepts schema_id inside definition", () => {
      expect(
        SchemaRegisterInput.safeParse({
          target: "facets",
          definition: {
            schema_id: "my:schema",
            description: "A schema",
            extra_field: true
          }
        }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_facet_catalog", () => {
    const schema = facetCatalogTool.definition.inputSchema as {
      properties?: Record<string, unknown>;
    };

    it("has an empty input schema", () => {
      expect(schema.properties).toEqual({});
    });
  });

  describe("ghostcrab_facet_inspect", () => {
    const schema = facetInspectTool.definition.inputSchema as {
      required?: string[];
      properties: { facet_name: { minLength?: number } };
    };

    it("requires facet_name", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["facet_name"]));
      expect(schema.properties.facet_name.minLength).toBe(1);
    });
  });

  describe("ghostcrab_facet_validate", () => {
    const schema = facetValidateTool.definition.inputSchema as {
      properties: {
        strict: { default?: boolean };
        record: Record<string, unknown>;
        records: Record<string, unknown>;
      };
    };

    it("documents strict validation and accepts single or batched records", () => {
      expect(schema.properties.strict.default).toBe(false);
      expect(schema.properties.record).toBeDefined();
      expect(schema.properties.records).toBeDefined();
    });
  });

  describe("ghostcrab_facet_register", () => {
    const schema = facetRegisterTool.definition.inputSchema as {
      required?: string[];
      properties: { definition: Record<string, unknown> };
    };

    it("requires a definition object", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["definition"]));
      expect(schema.properties.definition).toBeDefined();
    });
  });

  describe("ghostcrab_loadout_list", () => {
    const schema = loadoutListTool.definition.inputSchema as {
      properties?: Record<string, unknown>;
    };

    it("has an empty input schema", () => {
      expect(schema.properties).toEqual({});
    });
  });

  describe("ghostcrab_loadout_inspect", () => {
    const schema = loadoutInspectTool.definition.inputSchema as {
      required?: string[];
      properties: { loadout_id: { minLength?: number } };
    };

    it("requires loadout_id", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["loadout_id"]));
      expect(schema.properties.loadout_id.minLength).toBe(1);
    });
  });

  describe("ghostcrab_loadout_apply", () => {
    const schema = loadoutApplyTool.definition.inputSchema as {
      required?: string[];
      properties: { overwrite: { default?: boolean } };
    };

    it("documents overwrite with default false", () => {
      expect(schema.required).toEqual(
        expect.arrayContaining(["workspace_id", "loadout_id"])
      );
      expect(schema.properties.overwrite.default).toBe(false);
    });
  });

  describe("ghostcrab_loadout_suggest", () => {
    const schema = loadoutSuggestTool.definition.inputSchema as {
      required?: string[];
      properties: { goal: Record<string, unknown>; limit: { default?: number } };
    };

    it("requires goal and documents limit default", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["goal"]));
      expect(schema.properties.goal).toBeDefined();
      expect(schema.properties.limit.default).toBe(3);
    });
  });

  describe("ghostcrab_loadout_seed", () => {
    const schema = loadoutSeedTool.definition.inputSchema as {
      required?: string[];
      properties: {
        persist_semantics: { default?: boolean };
      };
    };

    it("requires workspace_id and loadout_id with persist_semantics defaulting true", () => {
      expect(schema.required).toEqual(
        expect.arrayContaining(["workspace_id", "loadout_id"])
      );
      expect(schema.properties.persist_semantics.default).toBe(true);
    });
  });

  describe("ghostcrab_learn", () => {
    const node = (
      learnTool.definition.inputSchema as {
        properties: { node: Record<string, unknown> };
      }
    ).properties.node;

    it("documents required node keys in MCP schema", () => {
      expect(node.required).toEqual(
        expect.arrayContaining(["id", "node_type", "label"])
      );
    });

    it("Zod requires at least one of node or edge", () => {
      expect(LearnInput.safeParse({}).success).toBe(false);
      expect(
        LearnInput.safeParse({
          node: { id: "n1", node_type: "topic", label: "L" }
        }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_search", () => {
    const filters = (
      searchTool.definition.inputSchema as {
        properties: { filters: Record<string, unknown> };
      }
    ).properties.filters;

    it("documents filters as an open object for facet keys", () => {
      expect(filters.type).toBe("object");
      expect(filters.additionalProperties).toBe(true);
    });

    it("documents mode enum and limit bounds", () => {
      const schema = searchTool.definition.inputSchema as {
        properties: {
          mode: { enum?: string[] };
          limit: { minimum?: number; maximum?: number };
        };
      };
      expect(schema.properties.mode.enum).toEqual([
        "hybrid",
        "bm25",
        "semantic"
      ]);
      expect(schema.properties.limit.minimum).toBe(1);
      expect(schema.properties.limit.maximum).toBe(100);
    });

    it("Zod parses empty query with filters", () => {
      expect(
        SearchInput.safeParse({
          query: "",
          filters: { status: "open" }
        }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_graph_search", () => {
    const schema = graphSearchTool.definition.inputSchema as {
      properties: {
        collection_id: { type?: string | string[] };
        entity_types: { default?: unknown[]; items?: { type?: string } };
        include_relations: { default?: boolean };
        limit: { minimum?: number; maximum?: number };
        metadata_filters: { additionalProperties?: boolean };
      };
    };

    it("documents graph filters and relation expansion", () => {
      expect(schema.properties.collection_id.type).toEqual(["string", "null"]);
      expect(schema.properties.entity_types.default).toEqual([]);
      expect(schema.properties.entity_types.items?.type).toBe("string");
      expect(schema.properties.metadata_filters.additionalProperties).toBe(true);
      expect(schema.properties.include_relations.default).toBe(false);
      expect(schema.properties.limit.minimum).toBe(1);
      expect(schema.properties.limit.maximum).toBe(100);
    });

    it("Zod accepts nil-like collection scope and filter-only graph reads", () => {
      const parsed = GraphSearchInput.safeParse({
        collection_id: "nil",
        entity_types: ["SEOIssue"],
        metadata_filters: { severity: "high" },
        include_relations: true
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.collection_id).toBeUndefined();
      }
    });
  });

  describe("ghostcrab_tool_search", () => {
    const schema = toolSearchTool.definition.inputSchema as {
      properties: {
        include_input_schema: { default?: boolean };
        limit: { maximum?: number; minimum?: number };
        query: { maxLength?: number };
        subsystem: Record<string, unknown>;
        visibility: Record<string, unknown>;
      };
    };

    it("documents compact-catalog search with bounded query length", () => {
      expect(schema.properties.query.maxLength).toBe(200);
      expect(schema.properties.limit.minimum).toBe(1);
      expect(schema.properties.limit.maximum).toBe(20);
      expect(schema.properties.include_input_schema.default).toBe(false);
      expect(schema.properties.subsystem).toBeDefined();
      expect(schema.properties.visibility).toBeDefined();
    });

    it("Zod accepts faceted search and rejects overlong queries", () => {
      expect(
        ToolSearchInput.safeParse({
          query: "workspace export tools",
          subsystem: ["workspace"],
          visibility: ["extended"],
          limit: 3
        }).success
      ).toBe(true);

      expect(
        ToolSearchInput.safeParse({
          query: "x".repeat(201)
        }).success
      ).toBe(false);
    });
  });

  describe("ghostcrab_remember", () => {
    const schema = rememberTool.definition.inputSchema as {
      required?: string[];
      properties: { facets: Record<string, unknown> };
    };

    it("requires content and documents facets as open object", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["content"]));
      expect(schema.properties.facets.type).toBe("object");
      expect(schema.properties.facets.additionalProperties).toBe(true);
    });

    it("Zod rejects empty content", () => {
      expect(
        RememberInput.safeParse({ content: "   " }).success
      ).toBe(false);
      expect(
        RememberInput.safeParse({
          content: "note",
          facets: { k: "v" }
        }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_count", () => {
    const schema = countTool.definition.inputSchema as {
      required?: string[];
      properties: {
        group_by: Record<string, unknown>;
        filters: Record<string, unknown>;
      };
    };

    it("requires group_by and documents filters as open object", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["group_by"]));
      expect(schema.properties.filters.type).toBe("object");
      expect(schema.properties.filters.additionalProperties).toBe(true);
      expect(schema.properties.group_by.minItems).toBe(1);
      expect(schema.properties.group_by.maxItems).toBe(5);
    });

    it("Zod rejects empty group_by", () => {
      expect(CountInput.safeParse({ group_by: [] }).success).toBe(false);
      expect(
        CountInput.safeParse({
          group_by: ["status"],
          filters: { x: 1 }
        }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_pack", () => {
    const schema = packTool.definition.inputSchema as {
      required?: string[];
      properties: { limit: { minimum?: number; maximum?: number } };
    };

    it("requires query and bounds limit", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["query"]));
      expect(schema.properties.limit.minimum).toBe(1);
      expect(schema.properties.limit.maximum).toBe(50);
    });

    it("Zod rejects empty query", () => {
      expect(PackInput.safeParse({ query: "  " }).success).toBe(false);
      expect(
        PackInput.safeParse({ query: "sprint status", limit: 10 }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_projection_get", () => {
    const schema = projectionGetTool.definition.inputSchema as {
      required?: string[];
      properties: {
        collection_id: { type?: string | string[] };
        include_evidence: { default?: boolean };
        include_deltas: { default?: boolean };
      };
    };

    it("requires projection_id and defaults graph expansions on", () => {
      expect(schema.required).toEqual(
        expect.arrayContaining(["projection_id"])
      );
      expect(schema.properties.collection_id.type).toEqual(["string", "null"]);
      expect(schema.properties.include_evidence.default).toBe(true);
      expect(schema.properties.include_deltas.default).toBe(true);
    });

    it("Zod rejects blank projection_id", () => {
      expect(ProjectionGetInput.safeParse({ projection_id: "  " }).success).toBe(
        false
      );
      expect(
        ProjectionGetInput.safeParse({
          collection_id: null,
          projection_id: "proj_keyword_opportunities"
        }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_project", () => {
    const schema = projectTool.definition.inputSchema as {
      required?: string[];
      properties: {
        proj_type: { enum?: string[] };
        status: { enum?: string[] };
        weight: { minimum?: number; maximum?: number };
      };
    };

    it("requires scope and content with enums", () => {
      expect(schema.required).toEqual(
        expect.arrayContaining(["scope", "content"])
      );
      expect(schema.properties.proj_type.enum).toEqual([
        "FACT",
        "GOAL",
        "STEP",
        "CONSTRAINT"
      ]);
      expect(schema.properties.status.enum).toEqual([
        "active",
        "resolved",
        "expired",
        "blocking"
      ]);
      expect(schema.properties.weight.minimum).toBe(0);
      expect(schema.properties.weight.maximum).toBe(1);
    });

    it("Zod parses minimal projection", () => {
      expect(
        ProjectInput.safeParse({
          scope: "sprint-42",
          content: "Ship MCP contract tests"
        }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_status", () => {
    it("documents optional agent_id", () => {
      const schema = statusTool.definition.inputSchema as {
        properties: { agent_id: Record<string, unknown> };
      };
      expect(schema.properties.agent_id.type).toBe("string");
    });

    it("Zod applies default agent_id", () => {
      const parsed = StatusInput.safeParse({});
      expect(parsed.success).toBe(true);
      expect(parsed.success ? parsed.data.agent_id : "").toBe("agent:self");
    });
  });

  describe("ghostcrab_coverage", () => {
    const schema = coverageTool.definition.inputSchema as {
      required?: string[];
    };

    it("requires domain", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["domain"]));
    });

    it("Zod rejects empty domain", () => {
      expect(CoverageInput.safeParse({ domain: "  " }).success).toBe(false);
      expect(
        CoverageInput.safeParse({ domain: "ghostcrab-product" }).success
      ).toBe(true);
    });
  });

  describe("ghostcrab_traverse", () => {
    const schema = traverseTool.definition.inputSchema as {
      required?: string[];
      properties: {
        direction: { enum?: string[] };
        depth: { minimum?: number; maximum?: number };
        edge_labels: { type?: string };
      };
    };

    it("requires start and documents direction and depth", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["start"]));
      expect(schema.properties.direction.enum).toEqual([
        "outbound",
        "inbound"
      ]);
      expect(schema.properties.depth.minimum).toBe(1);
      expect(schema.properties.depth.maximum).toBe(10);
      expect(schema.properties.edge_labels.type).toBe("array");
    });

    it("Zod parses minimal traverse", () => {
      expect(TraverseInput.safeParse({ start: "n1" }).success).toBe(true);
    });
  });

  describe("ghostcrab_schema_list", () => {
    const inputSchema = (
      schemaListTool.definition.inputSchema as {
        properties: {
          target: { enum?: string[] };
          domain: { type?: string };
          summary_only: { type?: string | boolean };
        };
      }
    );

    it("documents target enum", () => {
      expect(inputSchema.properties.target.enum).toEqual([
        "facets",
        "graph_node",
        "graph_edge",
        "all"
      ]);
    });

    it("documents domain and summary_only properties", () => {
      expect(inputSchema.properties.domain.type).toBe("string");
      expect(inputSchema.properties.summary_only.type).toBe("boolean");
    });

    it("Zod parses empty args with defaults", () => {
      const parsed = SchemaListInput.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.target).toBe("all");
        expect(parsed.data.summary_only).toBe(false);
        expect(parsed.data.domain).toBeUndefined();
      }
    });

    it("Zod accepts domain and summary_only", () => {
      const parsed = SchemaListInput.safeParse({
        domain: "ghostcrab",
        summary_only: true
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.domain).toBe("ghostcrab");
        expect(parsed.data.summary_only).toBe(true);
      }
    });

    it("Zod rejects empty string domain", () => {
      expect(SchemaListInput.safeParse({ domain: "" }).success).toBe(false);
    });
  });

  describe("ghostcrab_onboarding_schemas", () => {
    it("exposes no required arguments", () => {
      const schema = schemaOnboardingTool.definition.inputSchema as {
        required?: string[];
        properties: Record<string, unknown>;
      };
      expect(schema.required ?? []).toHaveLength(0);
    });

    it("ONBOARDING_SCHEMA_IDS contains the 4 curated schema IDs", () => {
      expect(ONBOARDING_SCHEMA_IDS).toContain("ghostcrab:modeling-recipe");
      expect(ONBOARDING_SCHEMA_IDS).toContain("ghostcrab:activity-family");
      expect(ONBOARDING_SCHEMA_IDS).toContain("ghostcrab:projection-recipe");
      expect(ONBOARDING_SCHEMA_IDS).toContain("ghostcrab:signal-pattern");
      expect(ONBOARDING_SCHEMA_IDS).toHaveLength(4);
    });
  });

  describe("ghostcrab_workspace_export_model_toon", () => {
    const schema = workspaceExportToonTool.definition.inputSchema as {
      required?: string[];
      properties: {
        workspace_id: { type?: string };
      };
    };

    it("requires workspace_id", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["workspace_id"]));
      expect(schema.properties.workspace_id.type).toBe("string");
    });
  });

  describe("ghostcrab_schema_inspect", () => {
    const schema = schemaInspectTool.definition.inputSchema as {
      required?: string[];
    };

    it("requires schema_id", () => {
      expect(schema.required).toEqual(expect.arrayContaining(["schema_id"]));
    });

    it("Zod rejects missing schema_id", () => {
      expect(SchemaInspectInput.safeParse({}).success).toBe(false);
      expect(
        SchemaInspectInput.safeParse({ schema_id: "ghostcrab:task" }).success
      ).toBe(true);
    });
  });
});
