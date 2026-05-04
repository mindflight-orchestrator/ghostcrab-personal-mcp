import { randomUUID } from "node:crypto";

import type { DatabaseClient, Queryable } from "../db/client.js";
import {
  findGraphRelationByEndpoints,
  resolveGraphEntityId,
  upsertGraphEntity,
  upsertGraphRelation
} from "../db/graph.js";
import {
  buildFacetDefinitionSeedEntries,
  isKnownFacetName
} from "../db/facet-catalog.js";

interface BootstrapEntry {
  content: Record<string, unknown> | string;
  facets: Record<string, unknown>;
  lookupFacets: Record<string, unknown>;
  schemaId: string;
}

interface BootstrapGraphNode {
  id: string;
  label: string;
  nodeType: string;
  properties: Record<string, unknown>;
  schemaId?: string;
}

interface BootstrapGraphEdge {
  label: string;
  properties: Record<string, unknown>;
  source: string;
  target: string;
  weight?: number;
}

interface BootstrapProjection {
  agentId: string;
  content: string;
  lookup: Record<string, unknown>;
  projType: "CONSTRAINT" | "FACT" | "GOAL" | "STEP";
  scope?: string;
  sourceType?: string;
  status: "active" | "blocking" | "expired" | "resolved";
  weight: number;
}

interface BootstrapAgentState {
  agentId: string;
  health: "GREEN" | "RED" | "YELLOW";
  metrics: Record<string, unknown>;
  state: string;
}

export interface BootstrapSeedPlan {
  agentStates: number;
  facetDefinitions: number;
  graphEdges: number;
  graphNodes: number;
  ontologies: number;
  projections: number;
  productRecords: number;
  schemas: number;
  systemEntries: number;
  summary: string;
}

export interface BootstrapSeedSummary {
  insertedAgentStates: number;
  insertedFacetDefinitions: number;
  insertedGraphEdges: number;
  insertedGraphNodes: number;
  insertedOntologies: number;
  insertedProjections: number;
  insertedProductRecords: number;
  insertedSchemas: number;
  insertedSystemEntries: number;
  skipped: number;
}

const SYSTEM_ENTRIES: BootstrapEntry[] = [
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_search retrieves ranked documents from your fact store. Combine query with exact facet filters. Empty query plus filters is the fastest pure filter mode.",
    facets: {
      entry_slug: "tool:ghostcrab_search",
      entry_type: "tool",
      level: "foundation",
      tool_name: "ghostcrab_search",
      use_when: "You need to retrieve specific content by topic or facet value"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_search"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_count returns counts grouped by facet dimension. Call it before ghostcrab_search to understand what exists without paying content token cost.",
    facets: {
      entry_slug: "tool:ghostcrab_count",
      entry_type: "tool",
      level: "foundation",
      tool_name: "ghostcrab_count",
      use_when: "You want to know what exists before fetching it"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_count"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_pack returns a compact ranked context bundle for the current query. Inject pack_text at the top of reasoning before any multi-step task.",
    facets: {
      entry_slug: "tool:ghostcrab_pack",
      entry_type: "tool",
      level: "foundation",
      tool_name: "ghostcrab_pack",
      use_when: "Before any multi-step reasoning or domain-specific task"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_pack"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_status returns a one-read snapshot of health, token budget, open gaps, directives, and runtime capability flags. Read directives first.",
    facets: {
      entry_slug: "tool:ghostcrab_status",
      entry_type: "tool",
      level: "foundation",
      tool_name: "ghostcrab_status",
      use_when:
        "Session start, before expensive actions, or when something feels wrong"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_status"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_remember stores a fact, document, or observation and returns its UUID. Facets are free-form, so design them for retrieval.",
    facets: {
      entry_slug: "tool:ghostcrab_remember",
      entry_type: "tool",
      level: "foundation",
      tool_name: "ghostcrab_remember",
      use_when: "Store any fact, observation, or document worth keeping"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_remember"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_upsert updates the current state of a fact in place using an exact selector such as record_id or id. Use it for status, owner, or content changes when duplicates would be harmful.",
    facets: {
      entry_slug: "tool:ghostcrab_upsert",
      entry_type: "tool",
      level: "foundation",
      tool_name: "ghostcrab_upsert",
      use_when:
        "Update the current state of a task, lead, blocker, or other durable record without creating duplicates"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_upsert"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_coverage checks how well this agent knows a domain by comparing its graph against a domain ontology. Below 0.70 means escalate.",
    facets: {
      entry_slug: "tool:ghostcrab_coverage",
      entry_type: "tool",
      level: "intermediate",
      tool_name: "ghostcrab_coverage",
      use_when: "Before autonomous action in a domain-specific task"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_coverage"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_traverse walks the knowledge graph from a start node. outbound means what this node affects, inbound means what affects this node.",
    facets: {
      entry_slug: "tool:ghostcrab_traverse",
      entry_type: "tool",
      level: "intermediate",
      tool_name: "ghostcrab_traverse",
      use_when: "You need structure, dependencies, or downstream impact"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_traverse"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_learn writes graph nodes and edges after a task completes. Structural learning is not done until the graph reflects it.",
    facets: {
      entry_slug: "tool:ghostcrab_learn",
      entry_type: "tool",
      level: "intermediate",
      tool_name: "ghostcrab_learn",
      use_when: "After completing a task that produced structural knowledge"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_learn"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "ghostcrab_schema_register creates a new facet schema, graph node type, or edge label. Call ghostcrab_schema_list first and register only after designing real examples.",
    facets: {
      entry_slug: "tool:ghostcrab_schema_register",
      entry_type: "tool",
      level: "intermediate",
      tool_name: "ghostcrab_schema_register",
      use_when:
        "You encounter a new type of information with no matching schema"
    },
    lookupFacets: {
      entry_slug: "tool:ghostcrab_schema_register"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Reading sequence: (1) ghostcrab_count for shape, (2) ghostcrab_search for the right slice, (3) ghostcrab_traverse for structure, (4) ghostcrab_pack for working context. Use the cheapest level that answers the question.",
    facets: {
      entry_slug: "rule:reading-sequence",
      entry_type: "rule",
      level: "foundation",
      use_when: "Any memory read operation"
    },
    lookupFacets: {
      entry_slug: "rule:reading-sequence"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Write-back is mandatory. After each task, use ghostcrab_remember for facts and ghostcrab_learn for graph updates. Memory not written back is lost.",
    facets: {
      entry_slug: "rule:write-back",
      entry_type: "rule",
      level: "foundation",
      use_when: "After every completed task, before ending the session"
    },
    lookupFacets: {
      entry_slug: "rule:write-back"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "When the user asks for a compact project status, weekly view, or simple board summary, prefer the workflow-tracking mini-heartbeat. It should stay small: one-line summary, tasks by status, one primary blocker, and this week's top priorities.",
    facets: {
      entry_slug: "view:mini-heartbeat",
      entry_type: "view",
      level: "foundation",
      use_when:
        "You need a compact status view for workflow-tracking without inventing a custom format"
    },
    lookupFacets: {
      entry_slug: "view:mini-heartbeat"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "For long-running project recovery, prefer a phase-heartbeat view: active phase, what changed since the last checkpoint, current blockers, environment-specific constraints, and next actions.",
    facets: {
      entry_slug: "view:phase-heartbeat",
      entry_type: "view",
      level: "foundation",
      use_when:
        "You need to resume a multi-phase project after a pause or report progress across phases"
    },
    lookupFacets: {
      entry_slug: "view:phase-heartbeat"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "For environment-specific delivery, prefer a deployment-brief view: target environment, rollout status, environment blockers, key decisions, and the next safe rollout step.",
    facets: {
      entry_slug: "view:deployment-brief",
      entry_type: "view",
      level: "foundation",
      use_when:
        "You need a compact deployment or rollout summary for a specific environment"
    },
    lookupFacets: {
      entry_slug: "view:deployment-brief"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "For external integrations, prefer an integration-health-brief view: endpoint status, evidence sources, active blockers, and next normalization or mapping steps.",
    facets: {
      entry_slug: "view:integration-health-brief",
      entry_type: "view",
      level: "foundation",
      use_when:
        "You need a compact summary of API, database, or connector integration work"
    },
    lookupFacets: {
      entry_slug: "view:integration-health-brief"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "For durable research memory, prefer a knowledge-snapshot view: active topic, strongest sources, open questions, contradiction candidates, and the next clarification step.",
    facets: {
      entry_slug: "view:knowledge-snapshot",
      entry_type: "view",
      level: "foundation",
      use_when:
        "You need a compact knowledge retrieval view without turning the workspace into a wiki"
    },
    lookupFacets: {
      entry_slug: "view:knowledge-snapshot"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Escalation format: {escalate:true, gap_node_id, gap_label, covered_up_to, reason, resume_condition}. Use it when coverage is too low or a blocking constraint is present.",
    facets: {
      entry_slug: "rule:escalation-format",
      entry_type: "rule",
      level: "foundation",
      use_when: "Gap detected or blocking constraint found"
    },
    lookupFacets: {
      entry_slug: "rule:escalation-format"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Schema design checklist before ghostcrab_schema_register: examples ready, required fields always available, filter dimensions explicit, edge labels read as true sentences, and list checked first.",
    facets: {
      entry_slug: "rule:schema-design-checklist",
      entry_type: "rule",
      level: "intermediate",
      tool_name: "ghostcrab_schema_register",
      use_when: "Before designing a new schema"
    },
    lookupFacets: {
      entry_slug: "rule:schema-design-checklist"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "On a first-turn fuzzy onboarding request, do not call ghostcrab_schema_register. First infer the most likely activity family, state a short intent hypothesis, ask 2 to 4 clarification questions with at least half shaped by that family, mention the likely compact view when visible, offer prompt help before any implementation, treat the request as independent unless the user explicitly says it continues an existing workspace, and do not merge it into an existing scope based only on session context.",
    facets: {
      entry_slug: "policy:first-turn-onboarding",
      entry_type: "policy",
      level: "foundation",
      use_when:
        "A user says they installed GhostCrab but does not know how to use it yet"
    },
    lookupFacets: {
      entry_slug: "policy:first-turn-onboarding"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Do not treat raw external payloads from APIs, logs, or database inspection as final durable records. Summarize them first, then store source-backed notes, tasks, constraints, or decisions.",
    facets: {
      entry_slug: "anti-pattern:raw-external-payloads",
      entry_type: "anti-pattern",
      level: "foundation",
      use_when:
        "You are ingesting information from an external system into GhostCrab"
    },
    lookupFacets: {
      entry_slug: "anti-pattern:raw-external-payloads"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Environment names should be retrieval facets, not just prose. If staging, prod, or a customer environment matters later, store it explicitly on the durable record.",
    facets: {
      entry_slug: "anti-pattern:environment-only-in-prose",
      entry_type: "anti-pattern",
      level: "foundation",
      use_when:
        "You are storing deployment, integration, or customer-specific operational context"
    },
    lookupFacets: {
      entry_slug: "anti-pattern:environment-only-in-prose"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Do not mix deployment state, project state, and narrative notes inside one record. Keep current execution state on canonical records, blockers on constraints, and summaries on notes or observations.",
    facets: {
      entry_slug: "anti-pattern:mixed-operational-layers",
      entry_type: "anti-pattern",
      level: "foundation",
      use_when:
        "You are modeling long-running work that spans delivery, environments, and external evidence"
    },
    lookupFacets: {
      entry_slug: "anti-pattern:mixed-operational-layers"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "For long-running project recovery, rebuild the picture from canonical current-state records first, then add sources, notes, and projections. Do not trust stale narrative summaries over current task or constraint state.",
    facets: {
      entry_slug: "rule:recovery-from-canonical-state",
      entry_type: "rule",
      level: "foundation",
      use_when:
        "An agent resumes work after a pause and needs to reconstruct the current situation"
    },
    lookupFacets: {
      entry_slug: "rule:recovery-from-canonical-state"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "Facets are application state. A status facet powers search filters, dashboards, and state transitions at the same time, so design it intentionally.",
    facets: {
      entry_slug: "concept:facets-are-state",
      entry_type: "concept",
      level: "advanced",
      use_when: "Designing schemas that track workflow or lifecycle"
    },
    lookupFacets: {
      entry_slug: "concept:facets-are-state"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "The embedding interface is prepared but semantic ranking stays disabled until vectors are produced and queried end-to-end. BM25 remains the honest default.",
    facets: {
      entry_slug: "concept:embedding-interface",
      entry_type: "concept",
      level: "advanced",
      use_when: "Understanding current search ranking behavior"
    },
    lookupFacets: {
      entry_slug: "concept:embedding-interface"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "GhostCrab product modeling pattern: represent runtime components, roadmap PRs, distribution targets, and native compatibility records as facets with shared project and capability keys. Use graph edges for dependencies between them.",
    facets: {
      entry_slug: "pattern:ghostcrab-product-modeling",
      entry_type: "pattern",
      level: "advanced",
      domain: "ghostcrab-product",
      use_when:
        "You want to describe the GhostCrab product itself inside its own memory model"
    },
    lookupFacets: {
      entry_slug: "pattern:ghostcrab-product-modeling"
    }
  },
  {
    schemaId: "mindbrain:system",
    content:
      "GhostCrab release pattern: use ghostcrab:roadmap-pr for delivery units, ghostcrab:distribution-target for npm and Docker outputs, and ghostcrab:runtime-component for the internal stack those outputs depend on.",
    facets: {
      entry_slug: "pattern:ghostcrab-release-flow",
      entry_type: "pattern",
      level: "advanced",
      domain: "ghostcrab-product",
      use_when:
        "You need to plan, inspect, or report on product delivery and release readiness"
    },
    lookupFacets: {
      entry_slug: "pattern:ghostcrab-release-flow"
    }
  }
];

const CANONICAL_SCHEMAS: BootstrapEntry[] = [
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:task",
      description: "Atomic unit of work tracked by a GhostCrab-enabled workflow.",
      facets: {
        required: {
          project: "string",
          status: "enum",
          priority: "enum"
        },
        optional: {
          owner: "string",
          phase: "string",
          domain: "string"
        }
      },
      examples: [
        {
          project: "ghostcrab-core",
          status: "in_progress",
          priority: "high"
        },
        {
          project: "ghostcrab-core",
          status: "blocked",
          priority: "critical"
        },
        {
          project: "docs-import",
          status: "done",
          priority: "medium"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:task",
      target: "facets",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:task",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:decision",
      description:
        "Architecture or product decision with rationale and status.",
      facets: {
        required: {
          project: "string",
          status: "enum",
          category: "enum"
        },
        optional: {
          owner: "string",
          supersedes: "string"
        }
      },
      examples: [
        {
          project: "ghostcrab-core",
          status: "accepted",
          category: "architecture"
        },
        {
          project: "ghostcrab-core",
          status: "proposed",
          category: "api"
        },
        {
          project: "docs-import",
          status: "rejected",
          category: "process"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:decision",
      target: "facets",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:decision",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:constraint",
      description:
        "Operational or product constraint that may block autonomy or delivery.",
      facets: {
        required: {
          scope: "string",
          severity: "enum",
          status: "enum"
        },
        optional: {
          domain: "string",
          owner: "string"
        }
      },
      examples: [
        {
          scope: "build-native",
          severity: "high",
          status: "open"
        },
        {
          scope: "docker-fallback",
          severity: "medium",
          status: "mitigated"
        },
        {
          scope: "api-surface",
          severity: "critical",
          status: "blocking"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:constraint",
      target: "facets",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:constraint",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:source",
      description:
        "External or internal evidence source such as an API response, document, SQL inspection result, log, or message-derived reference.",
      facets: {
        required: {
          project: "string",
          source_kind: "enum",
          status: "enum"
        },
        optional: {
          scope: "string",
          environment: "string",
          system_name: "string",
          uri: "string",
          owner: "string"
        }
      },
      examples: [
        {
          project: "apollo-rollout",
          source_kind: "api_spec",
          status: "active"
        },
        {
          project: "apollo-rollout",
          source_kind: "db_inspection",
          status: "active"
        },
        {
          project: "apollo-rollout",
          source_kind: "deploy_log",
          status: "archived"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:source",
      target: "facets",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:source",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:note",
      description:
        "Durable synthesized interpretation that compresses one or more sources into stable working knowledge.",
      facets: {
        required: {
          project: "string",
          note_kind: "enum",
          status: "enum"
        },
        optional: {
          scope: "string",
          environment: "string",
          source_ref: "string",
          owner: "string"
        }
      },
      examples: [
        {
          project: "apollo-rollout",
          note_kind: "checkpoint",
          status: "active"
        },
        {
          project: "apollo-rollout",
          note_kind: "schema-summary",
          status: "active"
        },
        {
          project: "apollo-rollout",
          note_kind: "recovery-brief",
          status: "active"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:note",
      target: "facets",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:note",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:integration-endpoint",
      description:
        "External system boundary such as an API, database, webhook, or connector target tracked during integration work.",
      facets: {
        required: {
          project: "string",
          endpoint_kind: "enum",
          status: "enum"
        },
        optional: {
          scope: "string",
          environment: "string",
          system_name: "string",
          transport: "string",
          owner: "string"
        }
      },
      examples: [
        {
          project: "apollo-rollout",
          endpoint_kind: "api",
          status: "active"
        },
        {
          project: "apollo-rollout",
          endpoint_kind: "postgresql",
          status: "blocked"
        },
        {
          project: "apollo-rollout",
          endpoint_kind: "webhook",
          status: "planned"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:integration-endpoint",
      target: "facets",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:integration-endpoint",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:environment-context",
      description:
        "Environment-specific operational context such as staging, production, or customer-specific delivery constraints.",
      facets: {
        required: {
          project: "string",
          environment: "string",
          status: "enum"
        },
        optional: {
          scope: "string",
          platform: "string",
          customer: "string",
          region: "string",
          owner: "string"
        }
      },
      examples: [
        {
          project: "apollo-rollout",
          environment: "staging",
          status: "active"
        },
        {
          project: "apollo-rollout",
          environment: "customer-acme-prod",
          status: "blocked"
        },
        {
          project: "apollo-rollout",
          environment: "production",
          status: "planned"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:environment-context",
      target: "facets",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:environment-context",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:knowledge-node",
      description:
        "Canonical graph node definition for concepts, tasks, tools, and process knowledge.",
      properties: {
        required: {
          id: "string",
          node_type: "string",
          label: "string"
        },
        optional: {
          domain: "string",
          mastery: "number",
          status: "string",
          source_ref: "string"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:knowledge-node",
      target: "graph_node",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:knowledge-node",
      target: "graph_node"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:knowledge-edge",
      description:
        "Canonical graph edge definition for dependency and gap relationships.",
      labels: [
        "REQUIRES",
        "ENABLES",
        "BLOCKS",
        "CONTRADICTS",
        "SUPERSEDES",
        "BELONGS_TO",
        "HAS_GAP",
        "DELEGATES_TO",
        "DEPENDS_ON",
        "NEXT",
        "IMPACTS",
        "TRIGGERED_BY",
        "OWNED_BY",
        "EXPLAINS",
        "RELATES_TO",
        "DERIVES_FROM",
        "INTERESTED_IN"
      ]
    },
    facets: {
      schema_id: "ghostcrab:knowledge-edge",
      target: "graph_edge",
      domain: "ghostcrab-core",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:knowledge-edge",
      target: "graph_edge"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:runtime-component",
      description:
        "Internal GhostCrab runtime component such as the MCP server, Docker fallback, SQL migration runner, or native extension chain.",
      facets: {
        required: {
          component: "string",
          layer: "enum",
          status: "enum"
        },
        optional: {
          capability: "string",
          delivery_surface: "string",
          owner: "string"
        }
      },
      examples: [
        {
          component: "mcp-server",
          layer: "application",
          status: "active"
        },
        {
          component: "docker-fallback",
          layer: "distribution",
          status: "active"
        },
        {
          component: "native-extension-build",
          layer: "native",
          status: "deferred"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:runtime-component",
      target: "facets",
      domain: "ghostcrab-product",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:runtime-component",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:roadmap-pr",
      description:
        "Delivery unit aligned with the GhostCrab roadmap, tracked as a PR-sized increment.",
      facets: {
        required: {
          roadmap_phase: "string",
          pr_id: "string",
          status: "enum"
        },
        optional: {
          scope: "string",
          surface: "string",
          depends_on: "string"
        }
      },
      examples: [
        {
          roadmap_phase: "phase-1",
          pr_id: "PR-1.3",
          status: "done"
        },
        {
          roadmap_phase: "phase-2",
          pr_id: "PR-2.3",
          status: "done"
        },
        {
          roadmap_phase: "phase-3",
          pr_id: "PR-3.2",
          status: "planned"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:roadmap-pr",
      target: "facets",
      domain: "ghostcrab-product",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:roadmap-pr",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:distribution-target",
      description:
        "Public packaging or deployment target for GhostCrab such as npm, Docker image, or MCP compose service.",
      facets: {
        required: {
          target: "string",
          channel: "enum",
          readiness: "enum"
        },
        optional: {
          public_name: "string",
          transport: "string",
          runtime: "string"
        }
      },
      examples: [
        {
          target: "npm-package",
          channel: "npm",
          readiness: "active"
        },
        {
          target: "docker-image",
          channel: "docker",
          readiness: "active"
        },
        {
          target: "compose-mcp-service",
          channel: "compose",
          readiness: "planned"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:distribution-target",
      target: "facets",
      domain: "ghostcrab-product",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:distribution-target",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:native-compatibility",
      description:
        "Compatibility record for native extension build variables such as Zig version, PostgreSQL major, and fallback status.",
      facets: {
        required: {
          surface: "string",
          compatibility_state: "enum",
          postgres_major: "string"
        },
        optional: {
          zig_version: "string",
          blocker: "string",
          fallback: "string"
        }
      },
      examples: [
        {
          surface: "pg_facets",
          compatibility_state: "pending",
          postgres_major: "17"
        },
        {
          surface: "pg_dgraph",
          compatibility_state: "pending",
          postgres_major: "17"
        },
        {
          surface: "docker-fallback",
          compatibility_state: "active",
          postgres_major: "17"
        }
      ]
    },
    facets: {
      schema_id: "ghostcrab:native-compatibility",
      target: "facets",
      domain: "ghostcrab-product",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:native-compatibility",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:activity-family",
      description:
        "Reusable activity family that tells agents what kind of domain they are entering and which modeling pattern fits it.",
      facets: {
        required: {
          activity_family: "string",
          maturity: "enum",
          default_projection: "string"
        },
        optional: {
          keywords: "array",
          default_scope: "string",
          title: "string"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:activity-family",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:activity-family",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:capability",
      description:
        "Explicit capability statement describing what an agent may do with GhostCrab before asking for confirmation.",
      facets: {
        required: {
          capability: "string",
          scope: "string",
          autonomy_level: "enum"
        },
        optional: {
          requires_confirmation: "boolean",
          activity_family: "string"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:capability",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:capability",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:autonomy-policy",
      description:
        "Policy statement governing when the agent may act alone, when it should disclose uncertainty, and when it must ask for confirmation.",
      facets: {
        required: {
          policy_id: "string",
          scope: "string",
          action: "string"
        },
        optional: {
          confirmation_required: "boolean",
          applies_to: "string",
          escalation_mode: "string"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:autonomy-policy",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:autonomy-policy",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:modeling-recipe",
      description:
        "Recipe for creating a minimal provisional domain model with facts first, graph second, and projections third.",
      facets: {
        required: {
          activity_family: "string",
          recipe_stage: "string",
          provisional_namespace: "string"
        },
        optional: {
          fact_schema_hint: "string",
          graph_node_hint: "string",
          graph_edge_labels: "array"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:modeling-recipe",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:modeling-recipe",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:projection-recipe",
      description:
        "Recipe for building a compact working projection or heartbeat view for a detected activity family.",
      facets: {
        required: {
          activity_family: "string",
          projection_kind: "string",
          trigger: "string"
        },
        optional: {
          target_budget: "number",
          preferred_kpis: "array",
          preferred_proj_type: "string"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:projection-recipe",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:projection-recipe",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:kpi-pattern",
      description:
        "KPI pattern describing which grouped indicator to read for a given activity family.",
      facets: {
        required: {
          activity_family: "string",
          metric_name: "string",
          facet_key: "string"
        },
        optional: {
          schema_id: "string",
          filter_key: "string",
          filter_value: "string"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:kpi-pattern",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:kpi-pattern",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:intent-pattern",
      description:
        "Intent pattern that helps route a vague user request toward the correct GhostCrab activity family and action policy.",
      facets: {
        required: {
          intent_id: "string",
          job: "string",
          requires_ghostcrab: "boolean"
        },
        optional: {
          candidate_activity_families: "array",
          default_action: "string",
          requires_confirmation: "boolean"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:intent-pattern",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:intent-pattern",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:signal-pattern",
      description:
        "Signal pattern mapping vague user language or external cues to one or more likely activity families.",
      facets: {
        required: {
          signal_id: "string",
          signal_type: "string",
          candidate_activity_families: "array"
        },
        optional: {
          examples: "array",
          implies_tracking: "boolean",
          source_kind: "string"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:signal-pattern",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:signal-pattern",
      target: "facets"
    }
  },
  {
    schemaId: "mindbrain:schema",
    content: {
      schema_id: "ghostcrab:ingest-pattern",
      description:
        "Ingest pattern describing how an external source should become a durable fact, graph update, or projection candidate inside GhostCrab.",
      facets: {
        required: {
          pattern_id: "string",
          source_kind: "string",
          recommended_action: "string"
        },
        optional: {
          recommended_schema: "string",
          recommended_activity_family: "string",
          privacy_mode: "string",
          requires_confirmation: "boolean"
        }
      }
    },
    facets: {
      schema_id: "ghostcrab:ingest-pattern",
      target: "facets",
      domain: "ghostcrab-meta",
      version: 1
    },
    lookupFacets: {
      schema_id: "ghostcrab:ingest-pattern",
      target: "facets"
    }
  }
];

const CANONICAL_ONTOLOGY: BootstrapEntry[] = [
  {
    schemaId: "mindbrain:ontology",
    content:
      "Understand ghostcrab_count as the zero-token shape-of-knowledge entry point before reading content.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-bootstrap",
      label: "Facet counting first",
      node_id: "concept:ghostcrab:count-first"
    },
    lookupFacets: {
      domain: "ghostcrab-bootstrap",
      node_id: "concept:ghostcrab:count-first"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Understand ghostcrab_search as the primary retrieval surface for canonical memory and system guidance.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-bootstrap",
      label: "Canonical retrieval",
      node_id: "concept:ghostcrab:search-retrieval"
    },
    lookupFacets: {
      domain: "ghostcrab-bootstrap",
      node_id: "concept:ghostcrab:search-retrieval"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Understand ghostcrab_pack as the compact working-memory surface before complex reasoning.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-bootstrap",
      label: "Working memory pack",
      node_id: "concept:ghostcrab:pack-working-memory"
    },
    lookupFacets: {
      domain: "ghostcrab-bootstrap",
      node_id: "concept:ghostcrab:pack-working-memory"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Understand that write-back through ghostcrab_remember and ghostcrab_learn is mandatory after meaningful work.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-bootstrap",
      label: "Mandatory write-back",
      node_id: "concept:ghostcrab:write-back"
    },
    lookupFacets: {
      domain: "ghostcrab-bootstrap",
      node_id: "concept:ghostcrab:write-back"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Understand schema and ontology self-description as first-class product behavior, not side documentation.",
    facets: {
      criticality: "medium",
      domain: "ghostcrab-bootstrap",
      label: "Self-describing schemas",
      node_id: "concept:ghostcrab:self-description"
    },
    lookupFacets: {
      domain: "ghostcrab-bootstrap",
      node_id: "concept:ghostcrab:self-description"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Know that GhostCrab must expose a stable public MCP surface while keeping mindbrain_* storage internals private.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-product",
      label: "Public MCP surface",
      node_id: "concept:ghostcrab:public-mcp-surface"
    },
    lookupFacets: {
      domain: "ghostcrab-product",
      node_id: "concept:ghostcrab:public-mcp-surface"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Know that GhostCrab boot and seed must start from the native Docker PostgreSQL stack with pg_facets, pg_dgraph, and pg_pragma loaded.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-product",
      label: "Native Docker bootstrap default",
      node_id: "concept:ghostcrab:docker-fallback-default"
    },
    lookupFacets: {
      domain: "ghostcrab-product",
      node_id: "concept:ghostcrab:docker-fallback-default"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Know that the migration runner plus idempotent bootstrap seed are part of product startup, not just development convenience.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-product",
      label: "Migrations and bootstrap are startup behavior",
      node_id: "concept:ghostcrab:startup-bootstrap"
    },
    lookupFacets: {
      domain: "ghostcrab-product",
      node_id: "concept:ghostcrab:startup-bootstrap"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Know that npm, Docker, and MCP compose are distinct distribution targets with different readiness and packaging constraints.",
    facets: {
      criticality: "medium",
      domain: "ghostcrab-product",
      label: "Distribution targets",
      node_id: "concept:ghostcrab:distribution-targets"
    },
    lookupFacets: {
      domain: "ghostcrab-product",
      node_id: "concept:ghostcrab:distribution-targets"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Know that native extension compatibility remains a first-class constraint domain because Zig and PostgreSQL version pinning are unresolved.",
    facets: {
      criticality: "high",
      domain: "ghostcrab-product",
      label: "Native compatibility constraint",
      node_id: "concept:ghostcrab:native-compatibility"
    },
    lookupFacets: {
      domain: "ghostcrab-product",
      node_id: "concept:ghostcrab:native-compatibility"
    }
  },
  {
    schemaId: "mindbrain:ontology",
    content:
      "Know that embeddings are an explicit runtime capability axis, but honest BM25 fallback must remain available when vectors are absent.",
    facets: {
      criticality: "medium",
      domain: "ghostcrab-product",
      label: "Embeddings capability axis",
      node_id: "concept:ghostcrab:embeddings-capability"
    },
    lookupFacets: {
      domain: "ghostcrab-product",
      node_id: "concept:ghostcrab:embeddings-capability"
    }
  }
];

const PRODUCT_RECORDS: BootstrapEntry[] = [
  {
    schemaId: "ghostcrab:runtime-component",
    content:
      "The MCP server is the public stdio surface for GhostCrab. It exposes the registered ghostcrab_* tools backed by PostgreSQL.",
    facets: {
      record_id: "runtime:mcp-server",
      project: "ghostcrab",
      component: "mcp-server",
      layer: "application",
      status: "active",
      capability: "public-mcp-tools",
      delivery_surface: "stdio"
    },
    lookupFacets: {
      record_id: "runtime:mcp-server"
    }
  },
  {
    schemaId: "ghostcrab:runtime-component",
    content:
      "The PostgreSQL runtime stores mindbrain_* tables and powers facets, graph, projections, and migrations for GhostCrab.",
    facets: {
      record_id: "runtime:postgres-core",
      project: "ghostcrab",
      component: "postgres-core",
      layer: "data",
      status: "active",
      capability: "persistent-memory",
      delivery_surface: "postgres"
    },
    lookupFacets: {
      record_id: "runtime:postgres-core"
    }
  },
  {
    schemaId: "ghostcrab:runtime-component",
    content:
      "The SQL migration runner applies ordered schema files and then triggers the idempotent bootstrap seed.",
    facets: {
      record_id: "runtime:migration-runner",
      project: "ghostcrab",
      component: "migration-runner",
      layer: "application",
      status: "active",
      capability: "schema-management",
      delivery_surface: "node-cli"
    },
    lookupFacets: {
      record_id: "runtime:migration-runner"
    }
  },
  {
    schemaId: "ghostcrab:runtime-component",
    content:
      "The native Docker PostgreSQL stack is the default local bootstrap path and must load pg_facets, pg_dgraph, and pg_pragma before GhostCrab boot or seed runs.",
    facets: {
      record_id: "runtime:docker-fallback",
      project: "ghostcrab",
      component: "docker-fallback",
      layer: "distribution",
      status: "active",
      capability: "local-bootstrap",
      delivery_surface: "docker-compose"
    },
    lookupFacets: {
      record_id: "runtime:docker-fallback"
    }
  },
  {
    schemaId: "ghostcrab:runtime-component",
    content:
      "The bootstrap seed populates mindbrain:system, mindbrain:schema, mindbrain:ontology, and first product records so the system can describe itself from cold start.",
    facets: {
      record_id: "runtime:bootstrap-seed",
      project: "ghostcrab",
      component: "bootstrap-seed",
      layer: "application",
      status: "active",
      capability: "self-description",
      delivery_surface: "startup"
    },
    lookupFacets: {
      record_id: "runtime:bootstrap-seed"
    }
  },
  {
    schemaId: "ghostcrab:runtime-component",
    content:
      "The native extension build chain is present in the repository but still deferred until Zig and PostgreSQL versions are pinned correctly.",
    facets: {
      record_id: "runtime:native-extension-build",
      project: "ghostcrab",
      component: "native-extension-build",
      layer: "native",
      status: "deferred",
      capability: "postgres-extensions",
      delivery_surface: "postgres-shared-library"
    },
    lookupFacets: {
      record_id: "runtime:native-extension-build"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-0.1 established the TypeScript package scaffold, linting, formatting, CI, and baseline repository layout.",
    facets: {
      record_id: "roadmap:PR-0.1",
      project: "ghostcrab",
      roadmap_phase: "phase-0",
      pr_id: "PR-0.1",
      status: "done",
      scope: "repository scaffold",
      surface: "tooling"
    },
    lookupFacets: {
      record_id: "roadmap:PR-0.1"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-0.2 established the Docker/PostgreSQL fallback stack with healthcheck and best-effort extension loading.",
    facets: {
      record_id: "roadmap:PR-0.2",
      project: "ghostcrab",
      roadmap_phase: "phase-0",
      pr_id: "PR-0.2",
      status: "done",
      scope: "docker foundation",
      surface: "docker"
    },
    lookupFacets: {
      record_id: "roadmap:PR-0.2"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-1.1 delivered the MCP server skeleton, stdio transport, tool registry, and fail-fast database startup gate.",
    facets: {
      record_id: "roadmap:PR-1.1",
      project: "ghostcrab",
      roadmap_phase: "phase-1",
      pr_id: "PR-1.1",
      status: "done",
      scope: "mcp server skeleton",
      surface: "server"
    },
    lookupFacets: {
      record_id: "roadmap:PR-1.1"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-1.2 delivered the core SQL migrations for facets, graph, projections, and agent state.",
    facets: {
      record_id: "roadmap:PR-1.2",
      project: "ghostcrab",
      roadmap_phase: "phase-1",
      pr_id: "PR-1.2",
      status: "done",
      scope: "core migrations",
      surface: "database"
    },
    lookupFacets: {
      record_id: "roadmap:PR-1.2"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-1.3 delivered the first pg_facets tools: ghostcrab_search, ghostcrab_remember, and ghostcrab_count.",
    facets: {
      record_id: "roadmap:PR-1.3",
      project: "ghostcrab",
      roadmap_phase: "phase-1",
      pr_id: "PR-1.3",
      status: "done",
      scope: "facets tools",
      surface: "mcp-tools"
    },
    lookupFacets: {
      record_id: "roadmap:PR-1.3"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-2.1 delivered schema registration and inspection tools for self-describing data design.",
    facets: {
      record_id: "roadmap:PR-2.1",
      project: "ghostcrab",
      roadmap_phase: "phase-2",
      pr_id: "PR-2.1",
      status: "done",
      scope: "schema tools",
      surface: "mcp-tools"
    },
    lookupFacets: {
      record_id: "roadmap:PR-2.1"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-2.2 delivered graph coverage, traversal, and learning tools on top of graph.entity and graph.relation.",
    facets: {
      record_id: "roadmap:PR-2.2",
      project: "ghostcrab",
      roadmap_phase: "phase-2",
      pr_id: "PR-2.2",
      status: "done",
      scope: "graph tools",
      surface: "mcp-tools"
    },
    lookupFacets: {
      record_id: "roadmap:PR-2.2"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-2.3 delivered pack and status tools plus self-describing bootstrap data at startup.",
    facets: {
      record_id: "roadmap:PR-2.3",
      project: "ghostcrab",
      roadmap_phase: "phase-2",
      pr_id: "PR-2.3",
      status: "done",
      scope: "context tools and bootstrap",
      surface: "mcp-tools"
    },
    lookupFacets: {
      record_id: "roadmap:PR-2.3"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-3.1 is still planned: SQL fallback helper functions and Docker bootstrap scripts need to be aligned without introducing schema drift.",
    facets: {
      record_id: "roadmap:PR-3.1",
      project: "ghostcrab",
      roadmap_phase: "phase-3",
      pr_id: "PR-3.1",
      status: "planned",
      scope: "sql fallback functions",
      surface: "docker"
    },
    lookupFacets: {
      record_id: "roadmap:PR-3.1"
    }
  },
  {
    schemaId: "ghostcrab:roadmap-pr",
    content:
      "PR-3.2 is still planned: npm packaging, compose MCP service, and end-to-end distribution smoke remain to be closed out.",
    facets: {
      record_id: "roadmap:PR-3.2",
      project: "ghostcrab",
      roadmap_phase: "phase-3",
      pr_id: "PR-3.2",
      status: "planned",
      scope: "packaging and compose smoke",
      surface: "distribution"
    },
    lookupFacets: {
      record_id: "roadmap:PR-3.2"
    }
  },
  {
    schemaId: "ghostcrab:distribution-target",
    content:
      "The npm package target is the public Node distribution surface for the GhostCrab MCP server.",
    facets: {
      record_id: "distribution:npm-package",
      project: "ghostcrab",
      target: "npm-package",
      channel: "npm",
      readiness: "active",
      public_name: "@mindflight/ghostcrab",
      transport: "stdio",
      runtime: "node"
    },
    lookupFacets: {
      record_id: "distribution:npm-package"
    }
  },
  {
    schemaId: "ghostcrab:distribution-target",
    content:
      "The native Docker PostgreSQL image target provides the default local bootstrap path for GhostCrab and ships pg_facets, pg_dgraph, and pg_pragma.",
    facets: {
      record_id: "distribution:docker-fallback",
      project: "ghostcrab",
      target: "docker-fallback",
      channel: "docker",
      readiness: "active",
      public_name: "mindflight/ghostcrab-postgres",
      transport: "postgres",
      runtime: "docker"
    },
    lookupFacets: {
      record_id: "distribution:docker-fallback"
    }
  },
  {
    schemaId: "ghostcrab:distribution-target",
    content:
      "The compose MCP service target is documented in the roadmap but remains planned until PR-3.2 lands.",
    facets: {
      record_id: "distribution:compose-mcp-service",
      project: "ghostcrab",
      target: "compose-mcp-service",
      channel: "compose",
      readiness: "planned",
      public_name: "ghostcrab-mcp-service",
      transport: "stdio",
      runtime: "docker-compose"
    },
    lookupFacets: {
      record_id: "distribution:compose-mcp-service"
    }
  },
  {
    schemaId: "ghostcrab:native-compatibility",
    content:
      "pg_facets is required in the native GhostCrab bootstrap stack and must be present before boot or seed completes.",
    facets: {
      record_id: "native:pg_facets",
      project: "ghostcrab",
      surface: "pg_facets",
      compatibility_state: "required",
      postgres_major: "17",
      blocker: "Boot or seed must refuse SQL-only bootstrap when native stack is expected",
      fallback: "none"
    },
    lookupFacets: {
      record_id: "native:pg_facets"
    }
  },
  {
    schemaId: "ghostcrab:native-compatibility",
    content:
      "pg_dgraph is required in the native GhostCrab bootstrap stack and must be present before boot or seed completes.",
    facets: {
      record_id: "native:pg_dgraph",
      project: "ghostcrab",
      surface: "pg_dgraph",
      compatibility_state: "required",
      postgres_major: "17",
      blocker: "Boot or seed must refuse SQL-only bootstrap when native stack is expected",
      fallback: "none"
    },
    lookupFacets: {
      record_id: "native:pg_dgraph"
    }
  },
  {
    schemaId: "ghostcrab:native-compatibility",
    content:
      "pg_pragma is required in the native GhostCrab bootstrap stack and must be present before boot or seed completes.",
    facets: {
      record_id: "native:pg_pragma",
      project: "ghostcrab",
      surface: "pg_pragma",
      compatibility_state: "required",
      postgres_major: "17",
      blocker: "Boot or seed must refuse SQL-only bootstrap when native stack is expected",
      fallback: "none"
    },
    lookupFacets: {
      record_id: "native:pg_pragma"
    }
  },
  {
    schemaId: "ghostcrab:native-compatibility",
    content:
      "The SQL-first Docker fallback remains an explicit portability path, but it must not be treated as the default GhostCrab boot or seed stack.",
    facets: {
      record_id: "native:docker-fallback",
      project: "ghostcrab",
      surface: "docker-fallback",
      compatibility_state: "optional",
      postgres_major: "17",
      fallback: "manual-only"
    },
    lookupFacets: {
      record_id: "native:docker-fallback"
    }
  },
  {
    schemaId: "ghostcrab:decision",
    content:
      "Public branding and MCP API use ghostcrab_* names, while internal SQL tables and JSONB namespaces stay mindbrain_* and mindbrain:.",
    facets: {
      record_id: "decision:public-branding-split",
      project: "ghostcrab",
      status: "accepted",
      category: "product-branding",
      owner: "core-team"
    },
    lookupFacets: {
      record_id: "decision:public-branding-split"
    }
  },
  {
    schemaId: "ghostcrab:decision",
    content:
      "The default bootstrap path uses native Docker PostgreSQL so GhostCrab boot and seed always see pg_facets, pg_dgraph, and pg_pragma.",
    facets: {
      record_id: "decision:docker-fallback-first",
      project: "ghostcrab",
      status: "accepted",
      category: "architecture",
      owner: "core-team"
    },
    lookupFacets: {
      record_id: "decision:docker-fallback-first"
    }
  },
  {
    schemaId: "ghostcrab:decision",
    content:
      "The embedding interface is prepared ahead of provider selection so semantic search can land later without destabilizing the public tool contracts.",
    facets: {
      record_id: "decision:embedding-interface-first",
      project: "ghostcrab",
      status: "accepted",
      category: "architecture",
      owner: "core-team"
    },
    lookupFacets: {
      record_id: "decision:embedding-interface-first"
    }
  },
  {
    schemaId: "ghostcrab:constraint",
    content:
      "Native extension build remains blocked until the canonical documentation arrives with the correct Zig and PostgreSQL version pins.",
    facets: {
      record_id: "constraint:native-version-pinning",
      project: "ghostcrab",
      scope: "native-extension-build",
      severity: "high",
      status: "blocking",
      domain: "native-build"
    },
    lookupFacets: {
      record_id: "constraint:native-version-pinning"
    }
  },
  {
    schemaId: "ghostcrab:constraint",
    content:
      "Real semantic vector search remains intentionally disabled until a real embeddings provider and write path are wired end-to-end.",
    facets: {
      record_id: "constraint:semantic-search-disabled",
      project: "ghostcrab",
      scope: "semantic-search",
      severity: "medium",
      status: "open",
      domain: "retrieval"
    },
    lookupFacets: {
      record_id: "constraint:semantic-search-disabled"
    }
  },
  {
    schemaId: "ghostcrab:task",
    content:
      "Phase 0 foundation is complete: TypeScript package scaffold, CI, env template, and Docker fallback are present in the repository.",
    facets: {
      record_id: "task:phase-0-foundation",
      project: "ghostcrab",
      status: "done",
      priority: "high",
      phase: "phase-0",
      domain: "bootstrap"
    },
    lookupFacets: {
      record_id: "task:phase-0-foundation"
    }
  },
  {
    schemaId: "ghostcrab:task",
    content:
      "Phase 1 MCP core is complete: server skeleton, migrations, and the first facets tools are working.",
    facets: {
      record_id: "task:phase-1-core",
      project: "ghostcrab",
      status: "done",
      priority: "high",
      phase: "phase-1",
      domain: "mcp-core"
    },
    lookupFacets: {
      record_id: "task:phase-1-core"
    }
  },
  {
    schemaId: "ghostcrab:task",
    content:
      "Phase 2 tool surface is complete: schema, graph, pack, and status tools are all wired behind the public MCP registry.",
    facets: {
      record_id: "task:phase-2-surface",
      project: "ghostcrab",
      status: "done",
      priority: "high",
      phase: "phase-2",
      domain: "mcp-tools"
    },
    lookupFacets: {
      record_id: "task:phase-2-surface"
    }
  },
  {
    schemaId: "ghostcrab:task",
    content:
      "Product bootstrap is now populated with real GhostCrab schemas, ontologies, and first factual objects about the repository itself.",
    facets: {
      record_id: "task:product-bootstrap-records",
      project: "ghostcrab",
      status: "done",
      priority: "high",
      phase: "phase-3",
      domain: "bootstrap"
    },
    lookupFacets: {
      record_id: "task:product-bootstrap-records"
    }
  },
  {
    schemaId: "ghostcrab:task",
    content:
      "Native toolchain pinning is still open and blocks any trustworthy promotion of the native extension build path.",
    facets: {
      record_id: "task:native-toolchain-pinning",
      project: "ghostcrab",
      status: "blocked",
      priority: "critical",
      phase: "phase-3",
      domain: "native-build"
    },
    lookupFacets: {
      record_id: "task:native-toolchain-pinning"
    }
  },
  {
    schemaId: "ghostcrab:environment-context",
    content:
      "Apollo rollout is currently executing in the customer staging environment for Acme EU. This environment is the first real delivery target before production cutover.",
    facets: {
      record_id: "environment:apollo:acme-eu-staging",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      status: "active",
      platform: "kubernetes",
      customer: "acme-eu",
      region: "eu-west-1",
      owner: "delivery-team"
    },
    lookupFacets: {
      record_id: "environment:apollo:acme-eu-staging"
    }
  },
  {
    schemaId: "ghostcrab:integration-endpoint",
    content:
      "Billing API endpoint for Apollo rollout. It is reachable in staging and acts as the reference external API for customer account sync.",
    facets: {
      record_id: "integration:apollo:billing-api",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      endpoint_kind: "api",
      status: "active",
      system_name: "billing-api",
      transport: "https",
      owner: "integration-team"
    },
    lookupFacets: {
      record_id: "integration:apollo:billing-api"
    }
  },
  {
    schemaId: "ghostcrab:integration-endpoint",
    content:
      "ERP PostgreSQL source for Apollo rollout. Schema inspection is incomplete because the customer credential handoff is not finished yet.",
    facets: {
      record_id: "integration:apollo:erp-postgres",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      endpoint_kind: "postgresql",
      status: "blocked",
      system_name: "erp-postgres",
      transport: "postgres",
      owner: "integration-team"
    },
    lookupFacets: {
      record_id: "integration:apollo:erp-postgres"
    }
  },
  {
    schemaId: "ghostcrab:source",
    content:
      "OpenAPI export for the Billing API v3.1 used during Apollo rollout integration mapping.",
    facets: {
      record_id: "source:apollo:billing-api-openapi",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      source_kind: "api_spec",
      status: "active",
      system_name: "billing-api",
      uri: "https://api.acme.example/openapi.json",
      owner: "integration-team"
    },
    lookupFacets: {
      record_id: "source:apollo:billing-api-openapi"
    }
  },
  {
    schemaId: "ghostcrab:source",
    content:
      "Manual schema inspection notes from the customer ERP PostgreSQL source. Only the accounts and contacts tables were inspected before credential access failed.",
    facets: {
      record_id: "source:apollo:erp-postgres-inspection",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      source_kind: "db_inspection",
      status: "active",
      system_name: "erp-postgres",
      owner: "integration-team"
    },
    lookupFacets: {
      record_id: "source:apollo:erp-postgres-inspection"
    }
  },
  {
    schemaId: "ghostcrab:note",
    content:
      "Recovery checkpoint: Apollo rollout is in phase-2 integration hardening. Billing API mapping is partially validated, ERP PostgreSQL access remains blocked, and the next safe step is to finish credential recovery before schema mapping resumes.",
    facets: {
      record_id: "note:apollo:recovery-checkpoint",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      note_kind: "recovery-brief",
      status: "active",
      source_ref: "source:apollo:erp-postgres-inspection",
      owner: "delivery-team"
    },
    lookupFacets: {
      record_id: "note:apollo:recovery-checkpoint"
    }
  },
  {
    schemaId: "ghostcrab:decision",
    content:
      "Apollo rollout will use a canonical customer_id mapping table before production cutover so Billing API and ERP PostgreSQL records can be reconciled deterministically.",
    facets: {
      record_id: "decision:apollo:customer-id-mapping",
      project: "apollo-rollout",
      status: "accepted",
      category: "integration",
      owner: "delivery-team"
    },
    lookupFacets: {
      record_id: "decision:apollo:customer-id-mapping"
    }
  },
  {
    schemaId: "ghostcrab:constraint",
    content:
      "Customer firewall rules still block the integration worker from reaching the ERP PostgreSQL source from the staging cluster.",
    facets: {
      record_id: "constraint:apollo:erp-firewall",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      severity: "high",
      status: "blocking",
      domain: "integration",
      owner: "platform-team"
    },
    lookupFacets: {
      record_id: "constraint:apollo:erp-firewall"
    }
  },
  {
    schemaId: "ghostcrab:task",
    content:
      "Finish ERP PostgreSQL credential recovery and validate read-only access from the staging worker before resuming schema mapping.",
    facets: {
      record_id: "task:apollo:erp-credential-recovery",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      status: "blocked",
      priority: "critical",
      phase: "phase-2",
      domain: "integration",
      owner: "integration-team"
    },
    lookupFacets: {
      record_id: "task:apollo:erp-credential-recovery"
    }
  },
  {
    schemaId: "ghostcrab:task",
    content:
      "Validate Billing API account mapping against the canonical customer_id table and prepare the next cutover checklist.",
    facets: {
      record_id: "task:apollo:billing-api-mapping",
      project: "apollo-rollout",
      scope: "project:apollo-rollout",
      environment: "acme-eu-staging",
      status: "in_progress",
      priority: "high",
      phase: "phase-2",
      domain: "integration",
      owner: "delivery-team"
    },
    lookupFacets: {
      record_id: "task:apollo:billing-api-mapping"
    }
  }
];

const META_RECORDS: BootstrapEntry[] = [
  {
    schemaId: "ghostcrab:capability",
    content:
      "GhostCrab may be used to create a provisional domain model for repeated workflows. Start with facts, then add graph structure, then add a compact projection.",
    facets: {
      record_id: "capability:provisional-domain-modeling",
      capability: "create_provisional_domain_model",
      scope: "repeated-workflows",
      autonomy_level: "guided-autonomous",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "capability:provisional-domain-modeling"
    }
  },
  {
    schemaId: "ghostcrab:capability",
    content:
      "GhostCrab may generate dynamic projections and heartbeat context from current facts, graph edges, and KPI patterns instead of expanding static prompt files.",
    facets: {
      record_id: "capability:dynamic-projection-selection",
      capability: "generate_dynamic_projection",
      scope: "heartbeat-and-working-memory",
      autonomy_level: "guided-autonomous",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "capability:dynamic-projection-selection"
    }
  },
  {
    schemaId: "ghostcrab:capability",
    content:
      "GhostCrab may extend an existing domain before inventing a new one. Search and coverage checks should happen before any new schema or namespace proposal.",
    facets: {
      record_id: "capability:extend-existing-domain",
      capability: "extend_existing_domain",
      scope: "all-domains",
      autonomy_level: "guided-autonomous",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "capability:extend-existing-domain"
    }
  },
  {
    schemaId: "ghostcrab:capability",
    content:
      "Canonical schema registration is allowed only after examples, filters, and lifecycle states are clear. Freezing a public schema requires explicit confirmation.",
    facets: {
      record_id: "capability:canonical-schema-registration",
      capability: "register_canonical_schema",
      scope: "schema-design",
      autonomy_level: "confirm-before-freeze",
      requires_confirmation: true
    },
    lookupFacets: {
      record_id: "capability:canonical-schema-registration"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "If the user asks for persistent tracking of a repeated activity, create a small provisional model first instead of waiting for a perfect ontology.",
    facets: {
      record_id: "policy:provisional-model-first",
      policy_id: "provisional-model-first",
      scope: "modeling",
      action: "create_provisional_model",
      confirmation_required: false,
      applies_to: "repeated-workflows",
      escalation_mode: "disclose_assumptions"
    },
    lookupFacets: {
      record_id: "policy:provisional-model-first"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "Before freezing a canonical public schema, confirm naming, lifecycle states, and long-lived retrieval filters with the user.",
    facets: {
      record_id: "policy:confirm-before-freeze",
      policy_id: "confirm-before-freeze",
      scope: "schema-design",
      action: "confirm_before_schema_freeze",
      confirmation_required: true,
      applies_to: "public-schema"
    },
    lookupFacets: {
      record_id: "policy:confirm-before-freeze"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "Prefer live projections and KPI reads over growing static heartbeat files. Static prompts should carry method, not runtime state.",
    facets: {
      record_id: "policy:prefer-live-projections",
      policy_id: "prefer-live-projections",
      scope: "heartbeat",
      action: "prefer_dynamic_projection",
      confirmation_required: false,
      applies_to: "openclaw-heartbeat"
    },
    lookupFacets: {
      record_id: "policy:prefer-live-projections"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "When coverage is partial or a blocking constraint exists, continue only with explicit disclosure or escalate. Do not hide the gap behind a confident summary.",
    facets: {
      record_id: "policy:gap-disclosure",
      policy_id: "gap-disclosure",
      scope: "autonomy",
      action: "disclose_or_escalate",
      confirmation_required: false,
      applies_to: "partial-coverage"
    },
    lookupFacets: {
      record_id: "policy:gap-disclosure"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "For a first-turn fuzzy onboarding request, lead with intent analysis, infer the most likely activity family, state a short intent hypothesis, ask 2 to 4 clarification questions with at least half shaped by that family, offer a likely compact view when visible, explicitly offer help writing the next GhostCrab prompt, treat the request as independent unless the user explicitly says it continues an existing workspace, and do not merge it into an existing scope based only on session context. Do not start implementation or schema design first.",
    facets: {
      record_id: "policy:first-turn-fuzzy-onboarding",
      policy_id: "first-turn-fuzzy-onboarding",
      scope: "onboarding",
      action: "clarify_before_implementing",
      confirmation_required: false,
      applies_to: "natural-user-help-requests"
    },
    lookupFacets: {
      record_id: "policy:first-turn-fuzzy-onboarding"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "Do not treat session continuity alone as permission to attach a new fuzzy onboarding request to an existing GhostCrab scope. Merge only after the user explicitly confirms the request continues that workspace.",
    facets: {
      record_id: "policy:explicit-workspace-continuation-only",
      policy_id: "explicit-workspace-continuation-only",
      scope: "onboarding-and-routing",
      action: "require_explicit_scope_continuation",
      confirmation_required: false,
      applies_to: "session-context-routing"
    },
    lookupFacets: {
      record_id: "policy:explicit-workspace-continuation-only"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "For long-running execution, treat canonical current-state records as the source of truth. Notes and observations may add context but must not override current task, constraint, or environment state.",
    facets: {
      record_id: "policy:canonical-current-state-first",
      policy_id: "canonical-current-state-first",
      scope: "execution-and-recovery",
      action: "prefer_canonical_current_state",
      confirmation_required: false,
      applies_to: "long-running-projects"
    },
    lookupFacets: {
      record_id: "policy:canonical-current-state-first"
    }
  },
  {
    schemaId: "ghostcrab:autonomy-policy",
    content:
      "When environment or integration context materially changes execution, store it as retrieval facets on durable records instead of leaving it in prose only.",
    facets: {
      record_id: "policy:environment-and-integration-facets",
      policy_id: "environment-and-integration-facets",
      scope: "long-running-operations",
      action: "store_environment_as_facets",
      confirmation_required: false,
      applies_to: "deployments-and-integrations"
    },
    lookupFacets: {
      record_id: "policy:environment-and-integration-facets"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user wants something remembered or retrievable later. GhostCrab becomes the durable store, but the model can stay minimal.",
    facets: {
      record_id: "intent:remember-for-later",
      intent_id: "remember-for-later",
      job: "remember_for_later",
      requires_ghostcrab: true,
      default_action: "remember",
      requires_confirmation: false,
      candidate_activity_families: ["knowledge-base", "workflow-tracking"]
    },
    lookupFacets: {
      record_id: "intent:remember-for-later"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user wants progress tracked across time. GhostCrab is mandatory because state, blockers, and next steps must persist. On a fuzzy first turn, ask questions about active phases, blockers, handoffs, and the smallest useful resume view before proposing structure.",
    facets: {
      record_id: "intent:track-over-time",
      intent_id: "track-over-time",
      job: "track_over_time",
      requires_ghostcrab: true,
      default_action: "model_and_project",
      requires_confirmation: false,
      candidate_activity_families: [
        "workflow-tracking",
        "software-delivery",
        "crm-pipeline"
      ]
    },
    lookupFacets: {
      record_id: "intent:track-over-time"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user asks for a new board, tracker, pipeline, or knowledge space. Start with a provisional model before freezing schemas.",
    facets: {
      record_id: "intent:structure-a-domain",
      intent_id: "structure-a-domain",
      job: "structure_a_domain",
      requires_ghostcrab: true,
      default_action: "create_provisional_model",
      requires_confirmation: false,
      candidate_activity_families: [
        "workflow-tracking",
        "knowledge-base",
        "crm-pipeline"
      ]
    },
    lookupFacets: {
      record_id: "intent:structure-a-domain"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user wants a current-state explanation with blockers, KPIs, or disclosure. Prefer compact projections over long prompt state.",
    facets: {
      record_id: "intent:explain-current-state",
      intent_id: "explain-current-state",
      job: "explain_current_state",
      requires_ghostcrab: true,
      default_action: "pack_and_disclose",
      requires_confirmation: false,
      candidate_activity_families: [
        "workflow-tracking",
        "software-delivery",
        "incident-response",
        "compliance-audit"
      ]
    },
    lookupFacets: {
      record_id: "intent:explain-current-state"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user explicitly asks for metrics, dashboards, or a heartbeat. GhostCrab projections and KPI patterns become mandatory.",
    facets: {
      record_id: "intent:monitor-with-kpis",
      intent_id: "monitor-with-kpis",
      job: "monitor_with_kpis",
      requires_ghostcrab: true,
      default_action: "project_and_count",
      requires_confirmation: false,
      candidate_activity_families: [
        "workflow-tracking",
        "software-delivery",
        "incident-response",
        "crm-pipeline"
      ]
    },
    lookupFacets: {
      record_id: "intent:monitor-with-kpis"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when an external message, email, event, or search result may need durable follow-up. First ingest, then route to the best activity family.",
    facets: {
      record_id: "intent:act-from-external-signal",
      intent_id: "act-from-external-signal",
      job: "act_from_external_signal",
      requires_ghostcrab: true,
      default_action: "ingest_then_route",
      requires_confirmation: false,
      candidate_activity_families: [
        "workflow-tracking",
        "crm-pipeline",
        "knowledge-base",
        "incident-response"
      ]
    },
    lookupFacets: {
      record_id: "intent:act-from-external-signal"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user wants to deploy or roll out work into a named environment. Environment context, rollout blockers, and next safe steps become part of the durable operational memory. On a fuzzy first turn, ask about the target environment, local rollout gates, current rollout stage, and the next safe step.",
    facets: {
      record_id: "intent:deploy-to-environment",
      intent_id: "deploy-to-environment",
      job: "deploy_to_environment",
      requires_ghostcrab: true,
      default_action: "model_environment_and_project",
      requires_confirmation: false,
      candidate_activity_families: [
        "environment-delivery",
        "software-delivery",
        "workflow-tracking"
      ]
    },
    lookupFacets: {
      record_id: "intent:deploy-to-environment"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user wants to connect GhostCrab-backed work to an external PostgreSQL source. Capture endpoint context, schema evidence, blockers, and next integration tasks. On a fuzzy first turn, ask about access constraints, schema observations, environment scope, and the current blocker or next validation step.",
    facets: {
      record_id: "intent:connect-external-postgresql",
      intent_id: "connect-external-postgresql",
      job: "connect_external_postgresql",
      requires_ghostcrab: true,
      default_action: "model_integration_then_ingest",
      requires_confirmation: false,
      candidate_activity_families: [
        "integration-operations",
        "environment-delivery"
      ]
    },
    lookupFacets: {
      record_id: "intent:connect-external-postgresql"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user wants to connect or sync an external API into a project. The agent should normalize evidence into sources, blockers, tasks, and integration context instead of storing raw payloads. On a fuzzy first turn, ask about the external system, auth constraints, critical endpoints or flows, evidence sources, and the current blocker or next mapping step.",
    facets: {
      record_id: "intent:sync-from-external-api",
      intent_id: "sync-from-external-api",
      job: "sync_from_external_api",
      requires_ghostcrab: true,
      default_action: "normalize_external_evidence",
      requires_confirmation: false,
      candidate_activity_families: [
        "integration-operations",
        "workflow-tracking",
        "crm-pipeline"
      ]
    },
    lookupFacets: {
      record_id: "intent:sync-from-external-api"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user returns after a pause or asks what changed since the last checkpoint. Rebuild the state from canonical current-state records before relying on narrative memory.",
    facets: {
      record_id: "intent:resume-paused-project",
      intent_id: "resume-paused-project",
      job: "resume_paused_project",
      requires_ghostcrab: true,
      default_action: "reconstruct_then_project",
      requires_confirmation: false,
      candidate_activity_families: [
        "workflow-tracking",
        "software-delivery",
        "environment-delivery",
        "integration-operations"
      ]
    },
    lookupFacets: {
      record_id: "intent:resume-paused-project"
    }
  },
  {
    schemaId: "ghostcrab:intent-pattern",
    content:
      "Use this intent when the user asks to investigate a failure after an interruption. Compare the current blockers, environment context, and newest evidence sources before summarizing the state.",
    facets: {
      record_id: "intent:investigate-after-interruption",
      intent_id: "investigate-after-interruption",
      job: "investigate_after_interruption",
      requires_ghostcrab: true,
      default_action: "read_current_state_then_sources",
      requires_confirmation: false,
      candidate_activity_families: [
        "environment-delivery",
        "integration-operations",
        "software-delivery",
        "incident-response"
      ]
    },
    lookupFacets: {
      record_id: "intent:investigate-after-interruption"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as board, kanban, backlog, WIP, and column usually mean the user wants a repeated workflow tracked over time.",
    facets: {
      record_id: "signal:workflow-tracking",
      signal_id: "signal:workflow-tracking",
      signal_type: "language",
      candidate_activity_families: ["workflow-tracking"],
      examples: ["kanban", "board", "backlog", "column", "wip"],
      implies_tracking: true
    },
    lookupFacets: {
      record_id: "signal:workflow-tracking"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as release, deploy, PR, migration, and blocker usually point to software delivery rather than a generic task board.",
    facets: {
      record_id: "signal:software-delivery",
      signal_id: "signal:software-delivery",
      signal_type: "language",
      candidate_activity_families: ["software-delivery", "workflow-tracking"],
      examples: ["release", "deploy", "pull request", "migration", "blocker"],
      implies_tracking: true
    },
    lookupFacets: {
      record_id: "signal:software-delivery"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as incident, outage, latency, alert, and runbook point to incident response and should bias toward blocker and impact traversal.",
    facets: {
      record_id: "signal:incident-response",
      signal_id: "signal:incident-response",
      signal_type: "language",
      candidate_activity_families: ["incident-response"],
      examples: ["incident", "outage", "latency", "alert", "runbook"],
      implies_tracking: true
    },
    lookupFacets: {
      record_id: "signal:incident-response"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as audit, evidence, regulation, policy, and compliance point to compliance work and require explicit disclosure of missing proof.",
    facets: {
      record_id: "signal:compliance-audit",
      signal_id: "signal:compliance-audit",
      signal_type: "language",
      candidate_activity_families: ["compliance-audit"],
      examples: ["audit", "evidence", "regulation", "policy", "compliance"],
      implies_tracking: true
    },
    lookupFacets: {
      record_id: "signal:compliance-audit"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as lead, deal, pipeline, stage, and outreach point to CRM pipeline work and should bias toward daily follow-up projections.",
    facets: {
      record_id: "signal:crm-pipeline",
      signal_id: "signal:crm-pipeline",
      signal_type: "language",
      candidate_activity_families: ["crm-pipeline"],
      examples: ["lead", "deal", "pipeline", "stage", "outreach"],
      implies_tracking: true
    },
    lookupFacets: {
      record_id: "signal:crm-pipeline"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as note, concept, source, research, and question point to knowledge-base work and should bias toward source-backed memory rather than operational tracking.",
    facets: {
      record_id: "signal:knowledge-base",
      signal_id: "signal:knowledge-base",
      signal_type: "language",
      candidate_activity_families: ["knowledge-base"],
      examples: ["note", "concept", "source", "research", "question"],
      implies_tracking: false
    },
    lookupFacets: {
      record_id: "signal:knowledge-base"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as deploy, rollout, staging, production, customer environment, and verification point to environment-delivery work where environment context must stay explicit.",
    facets: {
      record_id: "signal:environment-delivery",
      signal_id: "signal:environment-delivery",
      signal_type: "language",
      candidate_activity_families: [
        "environment-delivery",
        "software-delivery"
      ],
      examples: [
        "deploy",
        "rollout",
        "staging",
        "production",
        "customer environment",
        "verification"
      ],
      implies_tracking: true
    },
    lookupFacets: {
      record_id: "signal:environment-delivery"
    }
  },
  {
    schemaId: "ghostcrab:signal-pattern",
    content:
      "Words such as api, webhook, external postgres, connector, schema mapping, sync, and credentials point to integration-operations work.",
    facets: {
      record_id: "signal:integration-operations",
      signal_id: "signal:integration-operations",
      signal_type: "language",
      candidate_activity_families: [
        "integration-operations",
        "environment-delivery"
      ],
      examples: [
        "api",
        "webhook",
        "external postgres",
        "connector",
        "schema mapping",
        "sync",
        "credentials"
      ],
      implies_tracking: true
    },
    lookupFacets: {
      record_id: "signal:integration-operations"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "A chat or messaging thread should become a short durable summary, task candidate, or blocker record rather than a raw transcript dump.",
    facets: {
      record_id: "ingest:message-to-task-candidate",
      pattern_id: "message-to-task-candidate",
      source_kind: "message_thread",
      recommended_action: "summarize_then_remember",
      recommended_schema: "ghostcrab:task",
      recommended_activity_family: "workflow-tracking",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:message-to-task-candidate"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "An email about a customer, deal, or request should first be summarized, then routed into CRM or workflow tracking rather than copied verbatim.",
    facets: {
      record_id: "ingest:email-to-opportunity",
      pattern_id: "email-to-opportunity",
      source_kind: "email",
      recommended_action: "summarize_then_route",
      recommended_schema: "crm:opportunity",
      recommended_activity_family: "crm-pipeline",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:email-to-opportunity"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "A calendar event should become a deadline, follow-up task, or scheduling note rather than a raw invite payload.",
    facets: {
      record_id: "ingest:calendar-to-deadline",
      pattern_id: "calendar-to-deadline",
      source_kind: "calendar_event",
      recommended_action: "extract_deadline_or_task",
      recommended_schema: "ghostcrab:task",
      recommended_activity_family: "workflow-tracking",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:calendar-to-deadline"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "A search result or external page should become a source-backed note, concept support, or evidence record only after the useful claim is summarized.",
    facets: {
      record_id: "ingest:search-result-to-source",
      pattern_id: "search-result-to-source",
      source_kind: "search_result",
      recommended_action: "summarize_then_link_source",
      recommended_schema: "knowledge:source",
      recommended_activity_family: "knowledge-base",
      privacy_mode: "store_summary_plus_link",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:search-result-to-source"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "A meeting should become decision candidates, blockers, and next actions rather than a raw transcript or calendar blob.",
    facets: {
      record_id: "ingest:meeting-to-decision-candidate",
      pattern_id: "meeting-to-decision-candidate",
      source_kind: "meeting",
      recommended_action: "extract_decisions_and_tasks",
      recommended_schema: "ghostcrab:decision",
      recommended_activity_family: "workflow-tracking",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:meeting-to-decision-candidate"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "An incident channel or outage thread should become incident facts, service blockers, and one compact runbook projection candidate.",
    facets: {
      record_id: "ingest:incident-thread-to-blocker",
      pattern_id: "incident-thread-to-blocker",
      source_kind: "incident_thread",
      recommended_action: "extract_blockers_and_impacted_services",
      recommended_schema: "demo:incident-response:event",
      recommended_activity_family: "incident-response",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:incident-thread-to-blocker"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "An external API response should become a summarized source plus any task, blocker, or integration-endpoint updates implied by the payload, never a raw durable dump.",
    facets: {
      record_id: "ingest:api-response-to-source",
      pattern_id: "api-response-to-source",
      source_kind: "api_response",
      recommended_action: "summarize_then_normalize",
      recommended_schema: "ghostcrab:source",
      recommended_activity_family: "integration-operations",
      privacy_mode: "store_summary_plus_link",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:api-response-to-source"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "A database inspection result should become a source-backed schema summary or integration note plus any discovered blocker or next action.",
    facets: {
      record_id: "ingest:db-inspection-to-note",
      pattern_id: "db-inspection-to-note",
      source_kind: "db_inspection",
      recommended_action: "summarize_schema_then_route",
      recommended_schema: "ghostcrab:note",
      recommended_activity_family: "integration-operations",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:db-inspection-to-note"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "A deployment log should become a short source-backed operational summary plus any blocker, decision, or follow-up task candidates.",
    facets: {
      record_id: "ingest:deploy-log-to-operations",
      pattern_id: "deploy-log-to-operations",
      source_kind: "deploy_log",
      recommended_action: "summarize_then_extract_operational_state",
      recommended_schema: "ghostcrab:source",
      recommended_activity_family: "environment-delivery",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:deploy-log-to-operations"
    }
  },
  {
    schemaId: "ghostcrab:ingest-pattern",
    content:
      "Customer environment feedback should become an environment-specific blocker, follow-up task, or checkpoint note with the customer environment stored as a retrieval facet.",
    facets: {
      record_id: "ingest:customer-feedback-to-blocker",
      pattern_id: "customer-feedback-to-blocker",
      source_kind: "customer_feedback",
      recommended_action: "extract_environment_blockers",
      recommended_schema: "ghostcrab:constraint",
      recommended_activity_family: "environment-delivery",
      privacy_mode: "store_summary_not_raw",
      requires_confirmation: false
    },
    lookupFacets: {
      record_id: "ingest:customer-feedback-to-blocker"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "Workflow tracking covers kanban boards, recurring task systems, daily execution loops, and project follow-through where items move across explicit states.",
    facets: {
      record_id: "activity-family:workflow-tracking",
      activity_family: "workflow-tracking",
      title: "Workflow Tracking",
      maturity: "stable",
      default_projection: "mini-heartbeat",
      default_scope: "workflow",
      keywords: [
        "kanban",
        "workflow",
        "board",
        "task",
        "column",
        "phase",
        "step",
        "daily",
        "weekly",
        "heartbeat",
        "status"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:workflow-tracking"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For workflow tracking, start with facts for tasks and columns, add nodes for phase/step/task/column, connect them with BELONGS_TO, NEXT, BLOCKS, and DEPENDS_ON, then create a mini-heartbeat projection for the current working view.",
    facets: {
      record_id: "recipe:modeling:workflow-tracking",
      activity_family: "workflow-tracking",
      recipe_stage: "minimal-model",
      provisional_namespace: "project:workflow",
      fact_schema_hint: "ghostcrab:task",
      graph_node_hint: "phase|step|task|column",
      graph_edge_labels: ["BELONGS_TO", "NEXT", "BLOCKS", "DEPENDS_ON"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:workflow-tracking"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For workflow tracking, the mini-heartbeat should include a one-line summary, tasks by status, one primary blocker, and this week's top priorities in a format that can render cleanly as a markdown table or compact list.",
    facets: {
      record_id: "recipe:projection:workflow-tracking",
      activity_family: "workflow-tracking",
      projection_kind: "mini-heartbeat",
      trigger: "repeated-follow-up",
      target_budget: 120,
      preferred_kpis: ["tasks_by_status", "tasks_by_priority"],
      preferred_proj_type: "STEP",
      render_sections: ["summary", "tasks_table", "blockers", "this_week"],
      preferred_output_formats: ["markdown-table", "compact-list"]
    },
    lookupFacets: {
      record_id: "recipe:projection:workflow-tracking"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For long-running workflow tracking, the phase-heartbeat should include the active phase, what changed since the last checkpoint, one primary blocker, environment-specific constraints when relevant, and the next concrete actions.",
    facets: {
      record_id: "recipe:projection:workflow-tracking:phase-heartbeat",
      activity_family: "workflow-tracking",
      projection_kind: "phase-heartbeat",
      trigger: "resume-after-gap",
      target_budget: 150,
      preferred_kpis: [
        "tasks_by_status",
        "tasks_by_priority",
        "tasks_by_phase"
      ],
      preferred_proj_type: "STEP",
      render_sections: [
        "summary",
        "active_phase",
        "changes_since_checkpoint",
        "blockers",
        "next_actions"
      ],
      preferred_output_formats: ["compact-list", "markdown-table"]
    },
    lookupFacets: {
      record_id: "recipe:projection:workflow-tracking:phase-heartbeat"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count workflow items by status first to see where work is accumulating before reading any task content.",
    facets: {
      record_id: "kpi:workflow-tracking:tasks-by-status",
      activity_family: "workflow-tracking",
      metric_name: "tasks_by_status",
      schema_id: "ghostcrab:task",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:workflow-tracking:tasks-by-status"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count workflow items by priority to spot where critical or blocked work is clustering.",
    facets: {
      record_id: "kpi:workflow-tracking:tasks-by-priority",
      activity_family: "workflow-tracking",
      metric_name: "tasks_by_priority",
      schema_id: "ghostcrab:task",
      facet_key: "priority"
    },
    lookupFacets: {
      record_id: "kpi:workflow-tracking:tasks-by-priority"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count workflow items by phase to understand where long-running work is currently clustered across the project lifecycle.",
    facets: {
      record_id: "kpi:workflow-tracking:tasks-by-phase",
      activity_family: "workflow-tracking",
      metric_name: "tasks_by_phase",
      schema_id: "ghostcrab:task",
      facet_key: "phase"
    },
    lookupFacets: {
      record_id: "kpi:workflow-tracking:tasks-by-phase"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "Software delivery covers bugs, pull requests, migrations, releases, and service dependencies where technical blockers matter more than pure task state.",
    facets: {
      record_id: "activity-family:software-delivery",
      activity_family: "software-delivery",
      title: "Software Delivery",
      maturity: "stable",
      default_projection: "release-readiness",
      default_scope: "delivery",
      keywords: [
        "pr",
        "pull request",
        "release",
        "migration",
        "bug",
        "deploy",
        "service",
        "dependency"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:software-delivery"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For software delivery, store bugs, PRs, and migrations as facts, model services and release nodes in the graph, then connect blockers and dependencies before creating a release-readiness projection.",
    facets: {
      record_id: "recipe:modeling:software-delivery",
      activity_family: "software-delivery",
      recipe_stage: "minimal-model",
      provisional_namespace: "project:delivery",
      fact_schema_hint: "ghostcrab:task",
      graph_node_hint: "service|pr|bug|migration|release",
      graph_edge_labels: ["BLOCKS", "DEPENDS_ON", "ENABLES", "BELONGS_TO"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:software-delivery"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For software delivery, projections should lead with release blockers, affected services, active PRs or migrations, and one next safe step.",
    facets: {
      record_id: "recipe:projection:software-delivery",
      activity_family: "software-delivery",
      projection_kind: "release-readiness",
      trigger: "delivery-change",
      target_budget: 140,
      preferred_kpis: ["items_by_status", "items_by_severity"],
      preferred_proj_type: "CONSTRAINT"
    },
    lookupFacets: {
      record_id: "recipe:projection:software-delivery"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count delivery items by status to see whether work is piling up in blocked or review-ready states.",
    facets: {
      record_id: "kpi:software-delivery:items-by-status",
      activity_family: "software-delivery",
      metric_name: "items_by_status",
      schema_id: "ghostcrab:roadmap-pr",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:software-delivery:items-by-status"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count delivery constraints by severity so critical blockers surface before the rest of the work queue.",
    facets: {
      record_id: "kpi:software-delivery:constraints-by-severity",
      activity_family: "software-delivery",
      metric_name: "constraints_by_severity",
      schema_id: "ghostcrab:constraint",
      facet_key: "severity"
    },
    lookupFacets: {
      record_id: "kpi:software-delivery:constraints-by-severity"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "Incident response covers live outages, degraded services, hypotheses, impact paths, and runbook-driven remediation under time pressure.",
    facets: {
      record_id: "activity-family:incident-response",
      activity_family: "incident-response",
      title: "Incident Response",
      maturity: "stable",
      default_projection: "incident-snapshot",
      default_scope: "incident",
      keywords: [
        "incident",
        "outage",
        "latency",
        "alert",
        "runbook",
        "service",
        "sla",
        "degraded"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:incident-response"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For incident response, write incident and service facts first, create service and incident nodes, connect them with BLOCKS, IMPACTS, TRIGGERED_BY, and OWNED_BY edges, then seed a runbook projection.",
    facets: {
      record_id: "recipe:modeling:incident-response",
      activity_family: "incident-response",
      recipe_stage: "minimal-model",
      provisional_namespace: "ops:incident",
      fact_schema_hint: "demo:incident-response:event",
      graph_node_hint: "incident|service|runbook|hypothesis",
      graph_edge_labels: ["BLOCKS", "IMPACTS", "TRIGGERED_BY", "OWNED_BY"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:incident-response"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For incident response, projections should show severity, directly impacted services, active blocker paths, and the next runbook step.",
    facets: {
      record_id: "recipe:projection:incident-response",
      activity_family: "incident-response",
      projection_kind: "incident-snapshot",
      trigger: "operational-degradation",
      target_budget: 110,
      preferred_kpis: ["incidents_by_status", "services_by_health"],
      preferred_proj_type: "CONSTRAINT"
    },
    lookupFacets: {
      record_id: "recipe:projection:incident-response"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count incident facts by status to separate active incidents from resolved or observing states.",
    facets: {
      record_id: "kpi:incident-response:incidents-by-status",
      activity_family: "incident-response",
      metric_name: "incidents_by_status",
      schema_id: "demo:incident-response:event",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:incident-response:incidents-by-status"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count service facts by health to understand whether the incident footprint is widening or contained.",
    facets: {
      record_id: "kpi:incident-response:services-by-health",
      activity_family: "incident-response",
      metric_name: "services_by_health",
      schema_id: "demo:incident-response:service",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:incident-response:services-by-health"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "Compliance audit covers obligations, evidence, deadlines, and regulatory gaps where disclosure and proof matter more than broad narrative summary.",
    facets: {
      record_id: "activity-family:compliance-audit",
      activity_family: "compliance-audit",
      title: "Compliance Audit",
      maturity: "stable",
      default_projection: "audit-snapshot",
      default_scope: "compliance",
      keywords: [
        "compliance",
        "audit",
        "regulation",
        "obligation",
        "evidence",
        "gdpr",
        "soc2",
        "policy"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:compliance-audit"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For compliance audit, store obligations and evidence as facts, model obligations or concepts as graph nodes, connect them with REQUIRES, VALIDATES, and HAS_GAP edges, then create a blocking audit projection.",
    facets: {
      record_id: "recipe:modeling:compliance-audit",
      activity_family: "compliance-audit",
      recipe_stage: "minimal-model",
      provisional_namespace: "legal:compliance",
      fact_schema_hint: "demo:compliance-audit:obligation",
      graph_node_hint: "obligation|evidence|concept|deadline",
      graph_edge_labels: ["REQUIRES", "VALIDATES", "HAS_GAP", "SUPERSEDES"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:compliance-audit"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For compliance audit, projections should lead with critical uncovered obligations, supporting evidence, deadlines, and one next remediation action.",
    facets: {
      record_id: "recipe:projection:compliance-audit",
      activity_family: "compliance-audit",
      projection_kind: "audit-snapshot",
      trigger: "regulatory-review",
      target_budget: 130,
      preferred_kpis: ["obligations_by_status", "obligations_by_criticality"],
      preferred_proj_type: "CONSTRAINT"
    },
    lookupFacets: {
      record_id: "recipe:projection:compliance-audit"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count compliance obligations by status before reading the underlying documents so gaps are obvious immediately.",
    facets: {
      record_id: "kpi:compliance-audit:obligations-by-status",
      activity_family: "compliance-audit",
      metric_name: "obligations_by_status",
      schema_id: "demo:compliance-audit:obligation",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:compliance-audit:obligations-by-status"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count compliance obligations by criticality so the heartbeat can surface critical gaps before lower-risk work.",
    facets: {
      record_id: "kpi:compliance-audit:obligations-by-criticality",
      activity_family: "compliance-audit",
      metric_name: "obligations_by_criticality",
      schema_id: "demo:compliance-audit:obligation",
      facet_key: "criticality"
    },
    lookupFacets: {
      record_id: "kpi:compliance-audit:obligations-by-criticality"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "CRM pipeline covers leads, accounts, opportunities, stages, and follow-up blockers where movement through a funnel matters more than static notes.",
    facets: {
      record_id: "activity-family:crm-pipeline",
      activity_family: "crm-pipeline",
      title: "CRM Pipeline",
      maturity: "stable",
      default_projection: "pipeline-snapshot",
      default_scope: "crm",
      keywords: [
        "crm",
        "lead",
        "account",
        "opportunity",
        "deal",
        "pipeline",
        "stage",
        "outreach"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:crm-pipeline"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For CRM pipeline, store leads and opportunities as facts, create stage and account nodes, connect them with BELONGS_TO, NEXT, and BLOCKS edges, then generate a pipeline snapshot projection.",
    facets: {
      record_id: "recipe:modeling:crm-pipeline",
      activity_family: "crm-pipeline",
      recipe_stage: "minimal-model",
      provisional_namespace: "sales:crm",
      fact_schema_hint: "demo:crm-pipeline:lead",
      graph_node_hint: "lead|account|opportunity|stage",
      graph_edge_labels: ["BELONGS_TO", "NEXT", "BLOCKS", "ENABLES"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:crm-pipeline"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For CRM pipeline, projections should show leads by stage, blocked opportunities, next outreach targets, and one daily revenue-moving step.",
    facets: {
      record_id: "recipe:projection:crm-pipeline",
      activity_family: "crm-pipeline",
      projection_kind: "pipeline-snapshot",
      trigger: "daily-follow-up",
      target_budget: 120,
      preferred_kpis: ["leads_by_stage", "opportunities_by_status"],
      preferred_proj_type: "STEP"
    },
    lookupFacets: {
      record_id: "recipe:projection:crm-pipeline"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count leads by stage to understand where the funnel is currently clustered.",
    facets: {
      record_id: "kpi:crm-pipeline:leads-by-stage",
      activity_family: "crm-pipeline",
      metric_name: "leads_by_stage",
      schema_id: "demo:crm-pipeline:lead",
      facet_key: "stage"
    },
    lookupFacets: {
      record_id: "kpi:crm-pipeline:leads-by-stage"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count opportunities by status to see where the pipeline is blocked, qualified, or waiting for follow-up.",
    facets: {
      record_id: "kpi:crm-pipeline:opportunities-by-status",
      activity_family: "crm-pipeline",
      metric_name: "opportunities_by_status",
      schema_id: "demo:crm-pipeline:opportunity",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:crm-pipeline:opportunities-by-status"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "Knowledge base work covers concepts, sources, notes, contradictions, and reusable explanations that should be revisited over time.",
    facets: {
      record_id: "activity-family:knowledge-base",
      activity_family: "knowledge-base",
      title: "Knowledge Base",
      maturity: "stable",
      default_projection: "knowledge-snapshot",
      default_scope: "knowledge",
      keywords: [
        "knowledge",
        "concept",
        "topic",
        "source",
        "note",
        "research",
        "wiki",
        "briefing"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:knowledge-base"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For knowledge base work, store concepts and sources as facts, model concepts and notes as graph nodes, connect them with EXPLAINS, RELATES_TO, DERIVES_FROM, or CONTRADICTS edges, then create a compact briefing projection.",
    facets: {
      record_id: "recipe:modeling:knowledge-base",
      activity_family: "knowledge-base",
      recipe_stage: "minimal-model",
      provisional_namespace: "knowledge:base",
      fact_schema_hint: "demo:knowledge-base:concept",
      graph_node_hint: "concept|source|note|topic",
      graph_edge_labels: ["EXPLAINS", "RELATES_TO", "DERIVES_FROM", "CONTRADICTS"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:knowledge-base"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For knowledge base work, the knowledge-snapshot should show the active topic, strongest supporting sources, unresolved contradictions, open questions, and the next concept to clarify.",
    facets: {
      record_id: "recipe:projection:knowledge-base",
      activity_family: "knowledge-base",
      projection_kind: "knowledge-snapshot",
      trigger: "research-or-recall",
      target_budget: 140,
      preferred_kpis: ["concepts_by_status", "sources_by_kind"],
      preferred_proj_type: "FACT",
      render_sections: [
        "summary",
        "active_topic",
        "strongest_sources",
        "open_questions",
        "next_clarification"
      ],
      preferred_output_formats: ["compact-list", "markdown-table"]
    },
    lookupFacets: {
      record_id: "recipe:projection:knowledge-base"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count knowledge concepts by status so unresolved or draft concepts surface before polished ones.",
    facets: {
      record_id: "kpi:knowledge-base:concepts-by-status",
      activity_family: "knowledge-base",
      metric_name: "concepts_by_status",
      schema_id: "demo:knowledge-base:concept",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:knowledge-base:concepts-by-status"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count sources by kind to understand whether the current knowledge base is grounded in notes, docs, or external references.",
    facets: {
      record_id: "kpi:knowledge-base:sources-by-kind",
      activity_family: "knowledge-base",
      metric_name: "sources_by_kind",
      schema_id: "demo:knowledge-base:source",
      facet_key: "source_kind"
    },
    lookupFacets: {
      record_id: "kpi:knowledge-base:sources-by-kind"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "Integration operations covers external APIs, PostgreSQL sources, connectors, schema mapping, auth blockers, and evidence normalization for long-running delivery work.",
    facets: {
      record_id: "activity-family:integration-operations",
      activity_family: "integration-operations",
      title: "Integration Operations",
      maturity: "provisional",
      default_projection: "integration-health-brief",
      default_scope: "integration",
      keywords: [
        "api",
        "webhook",
        "external postgres",
        "connector",
        "integration",
        "schema mapping",
        "credentials",
        "sync"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:integration-operations"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For integration operations, keep current execution state on tasks and constraints, store external evidence as ghostcrab:source, summarize stable findings as ghostcrab:note, and track systems as ghostcrab:integration-endpoint before adding graph structure.",
    facets: {
      record_id: "recipe:modeling:integration-operations",
      activity_family: "integration-operations",
      recipe_stage: "minimal-model",
      provisional_namespace: "ops:integration",
      fact_schema_hint: "ghostcrab:integration-endpoint",
      graph_node_hint: "integration|system|mapping|dependency",
      graph_edge_labels: ["DEPENDS_ON", "BLOCKS", "ENABLES", "DERIVES_FROM"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:integration-operations"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For integration operations, the integration-health-brief should include endpoint status, newest evidence sources, active blockers, environment context, and the next normalization or mapping step.",
    facets: {
      record_id: "recipe:projection:integration-operations",
      activity_family: "integration-operations",
      projection_kind: "integration-health-brief",
      trigger: "integration-change",
      target_budget: 150,
      preferred_kpis: [
        "endpoints_by_status",
        "constraints_by_severity",
        "tasks_by_environment"
      ],
      preferred_proj_type: "CONSTRAINT",
      render_sections: [
        "summary",
        "endpoint_status",
        "evidence",
        "blockers",
        "next_actions"
      ],
      preferred_output_formats: ["compact-list", "markdown-table"]
    },
    lookupFacets: {
      record_id: "recipe:projection:integration-operations"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count integration endpoints by status to see which external systems are active, blocked, or still planned.",
    facets: {
      record_id: "kpi:integration-operations:endpoints-by-status",
      activity_family: "integration-operations",
      metric_name: "endpoints_by_status",
      schema_id: "ghostcrab:integration-endpoint",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:integration-operations:endpoints-by-status"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count integration tasks by environment so environment-specific mapping or credential issues surface quickly.",
    facets: {
      record_id: "kpi:integration-operations:tasks-by-environment",
      activity_family: "integration-operations",
      metric_name: "tasks_by_environment",
      schema_id: "ghostcrab:task",
      facet_key: "environment"
    },
    lookupFacets: {
      record_id: "kpi:integration-operations:tasks-by-environment"
    }
  },
  {
    schemaId: "ghostcrab:activity-family",
    content:
      "Environment delivery covers staging, production, and customer-specific rollout work where environment context, compatibility, and safe next steps matter as much as pure task status.",
    facets: {
      record_id: "activity-family:environment-delivery",
      activity_family: "environment-delivery",
      title: "Environment Delivery",
      maturity: "provisional",
      default_projection: "deployment-brief",
      default_scope: "environment",
      keywords: [
        "deploy",
        "rollout",
        "staging",
        "production",
        "customer environment",
        "compatibility",
        "verification",
        "release"
      ]
    },
    lookupFacets: {
      record_id: "activity-family:environment-delivery"
    }
  },
  {
    schemaId: "ghostcrab:modeling-recipe",
    content:
      "For environment delivery, keep rollout tasks and blockers on canonical task and constraint records, store environment details in ghostcrab:environment-context, attach supporting evidence as ghostcrab:source, and capture durable rollout choices as ghostcrab:decision.",
    facets: {
      record_id: "recipe:modeling:environment-delivery",
      activity_family: "environment-delivery",
      recipe_stage: "minimal-model",
      provisional_namespace: "ops:environment",
      fact_schema_hint: "ghostcrab:environment-context",
      graph_node_hint: "environment|service|deployment|decision",
      graph_edge_labels: ["DEPENDS_ON", "BLOCKS", "ENABLES", "BELONGS_TO"]
    },
    lookupFacets: {
      record_id: "recipe:modeling:environment-delivery"
    }
  },
  {
    schemaId: "ghostcrab:projection-recipe",
    content:
      "For environment delivery, the deployment-brief should include the target environment, rollout status, primary blockers, recent changes, and the next safe rollout step.",
    facets: {
      record_id: "recipe:projection:environment-delivery",
      activity_family: "environment-delivery",
      projection_kind: "deployment-brief",
      trigger: "environment-change",
      target_budget: 145,
      preferred_kpis: [
        "tasks_by_environment",
        "constraints_by_environment",
        "environments_by_status"
      ],
      preferred_proj_type: "STEP",
      render_sections: [
        "summary",
        "environment",
        "rollout_status",
        "blockers",
        "next_safe_step"
      ],
      preferred_output_formats: ["compact-list", "markdown-table"]
    },
    lookupFacets: {
      record_id: "recipe:projection:environment-delivery"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count environment contexts by status to see where rollout work is active, blocked, or planned.",
    facets: {
      record_id: "kpi:environment-delivery:environments-by-status",
      activity_family: "environment-delivery",
      metric_name: "environments_by_status",
      schema_id: "ghostcrab:environment-context",
      facet_key: "status"
    },
    lookupFacets: {
      record_id: "kpi:environment-delivery:environments-by-status"
    }
  },
  {
    schemaId: "ghostcrab:kpi-pattern",
    content:
      "Count constraints by environment to surface rollout blockers that are isolated to one environment instead of the whole project.",
    facets: {
      record_id: "kpi:environment-delivery:constraints-by-environment",
      activity_family: "environment-delivery",
      metric_name: "constraints_by_environment",
      schema_id: "ghostcrab:constraint",
      facet_key: "environment"
    },
    lookupFacets: {
      record_id: "kpi:environment-delivery:constraints-by-environment"
    }
  }
];

const BOOTSTRAP_AGENT_STATE: BootstrapAgentState = {
  agentId: "agent:self",
  health: "YELLOW",
  state: "READY",
  metrics: {
    avg_latency_ms: 120,
    token_budget_remaining: 12000,
    bootstrap_mode: "seeded-demo",
    last_bootstrap_scope: "ghostcrab-product",
    autonomy_mode: "guided-autonomous",
    known_activity_families: 8,
    heartbeat_policy: "prefer_dynamic_projection"
  }
};

const BOOTSTRAP_PROJECTIONS: BootstrapProjection[] = [
  {
    agentId: "agent:self",
    projType: "GOAL",
    content:
      "Deliver a public GhostCrab MCP package with reproducible Docker fallback validation and stable tool contracts.",
    weight: 0.95,
    status: "active",
    scope: "ghostcrab-product",
    sourceType: "bootstrap",
    lookup: {
      agent_id: "agent:self",
      proj_type: "GOAL",
      content:
        "Deliver a public GhostCrab MCP package with reproducible Docker fallback validation and stable tool contracts."
    }
  },
  {
    agentId: "agent:self",
    projType: "CONSTRAINT",
    content:
      "Treat native extension build as blocked until the canonical Zig/PostgreSQL version matrix is pinned.",
    weight: 1,
    status: "blocking",
    scope: "native-build",
    sourceType: "bootstrap",
    lookup: {
      agent_id: "agent:self",
      proj_type: "CONSTRAINT",
      content:
        "Treat native extension build as blocked until the canonical Zig/PostgreSQL version matrix is pinned."
    }
  },
  {
    agentId: "agent:self",
    projType: "STEP",
    content:
      "Run verify:e2e before distribution-facing changes so the native Docker bootstrap stack and public MCP scenarios stay aligned.",
    weight: 0.82,
    status: "active",
    scope: "distribution",
    sourceType: "bootstrap",
    lookup: {
      agent_id: "agent:self",
      proj_type: "STEP",
      content:
        "Run verify:e2e before distribution-facing changes so the native Docker bootstrap stack and public MCP scenarios stay aligned."
    }
  }
];

const PRODUCT_GRAPH_NODES: BootstrapGraphNode[] = [
  {
    id: "agent:self",
    label: "Seeded GhostCrab Agent",
    nodeType: "agent",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "ready",
      bootstrap: true
    }
  },
  {
    id: "product:ghostcrab",
    label: "GhostCrab",
    nodeType: "product",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "phase:ghostcrab:phase-0",
    label: "Phase 0",
    nodeType: "phase",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "done"
    }
  },
  {
    id: "phase:ghostcrab:phase-1",
    label: "Phase 1",
    nodeType: "phase",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "done"
    }
  },
  {
    id: "phase:ghostcrab:phase-2",
    label: "Phase 2",
    nodeType: "phase",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "done"
    }
  },
  {
    id: "phase:ghostcrab:phase-3",
    label: "Phase 3",
    nodeType: "phase",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "in_progress"
    }
  },
  {
    id: "component:ghostcrab:mcp-server",
    label: "MCP Server",
    nodeType: "component",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "component:ghostcrab:postgres-core",
    label: "Postgres Core",
    nodeType: "component",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "component:ghostcrab:migration-runner",
    label: "Migration Runner",
    nodeType: "component",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "component:ghostcrab:docker-fallback",
    label: "Native Docker Postgres",
    nodeType: "component",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "component:ghostcrab:bootstrap-seed",
    label: "Bootstrap Seed",
    nodeType: "component",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "component:ghostcrab:native-extension-build",
    label: "Native Extension Build",
    nodeType: "component",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "deferred"
    }
  },
  {
    id: "distribution:ghostcrab:npm-package",
    label: "npm Package",
    nodeType: "distribution",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "distribution:ghostcrab:docker-fallback",
    label: "Native Docker Postgres Distribution",
    nodeType: "distribution",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "active"
    }
  },
  {
    id: "distribution:ghostcrab:compose-mcp-service",
    label: "Compose MCP Service",
    nodeType: "distribution",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "planned"
    }
  },
  {
    id: "task:ghostcrab:phase-0-foundation",
    label: "Phase 0 Foundation",
    nodeType: "task",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "done"
    }
  },
  {
    id: "task:ghostcrab:phase-1-core",
    label: "Phase 1 Core",
    nodeType: "task",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "done"
    }
  },
  {
    id: "task:ghostcrab:phase-2-surface",
    label: "Phase 2 Surface",
    nodeType: "task",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "done"
    }
  },
  {
    id: "task:ghostcrab:product-bootstrap-records",
    label: "Product Bootstrap Records",
    nodeType: "task",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "done"
    }
  },
  {
    id: "task:ghostcrab:native-toolchain-pinning",
    label: "Native Toolchain Pinning",
    nodeType: "task",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "blocked"
    }
  },
  {
    id: "decision:ghostcrab:public-branding-split",
    label: "Public Branding Split",
    nodeType: "decision",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "accepted"
    }
  },
  {
    id: "decision:ghostcrab:docker-fallback-first",
    label: "Native Docker Bootstrap First",
    nodeType: "decision",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "accepted"
    }
  },
  {
    id: "decision:ghostcrab:embedding-interface-first",
    label: "Embedding Interface First",
    nodeType: "decision",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "accepted"
    }
  },
  {
    id: "constraint:ghostcrab:native-version-pinning",
    label: "Native Version Pinning",
    nodeType: "constraint",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "blocking"
    }
  },
  {
    id: "constraint:ghostcrab:semantic-search-disabled",
    label: "Semantic Search Disabled",
    nodeType: "constraint",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      status: "open"
    }
  },
  {
    id: "concept:ghostcrab:public-mcp-surface",
    label: "Public MCP surface",
    nodeType: "concept",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      mastery: 1,
      status: "known"
    }
  },
  {
    id: "concept:ghostcrab:docker-fallback-default",
    label: "Native Docker bootstrap default",
    nodeType: "concept",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      mastery: 1,
      status: "known"
    }
  },
  {
    id: "concept:ghostcrab:startup-bootstrap",
    label: "Migrations and bootstrap are startup behavior",
    nodeType: "concept",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      mastery: 1,
      status: "known"
    }
  },
  {
    id: "concept:ghostcrab:distribution-targets",
    label: "Distribution targets",
    nodeType: "concept",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      mastery: 1,
      status: "known"
    }
  },
  {
    id: "concept:ghostcrab:embeddings-capability",
    label: "Embeddings capability axis",
    nodeType: "concept",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      domain: "ghostcrab-product",
      mastery: 0,
      status: "partial"
    }
  },
  {
    id: "concept:ghostcrab:native-compatibility",
    label: "Native compatibility constraint",
    nodeType: "concept",
    schemaId: "ghostcrab:knowledge-node",
    properties: {
      mastery: 0,
      status: "gap"
    }
  }
];

const PRODUCT_GRAPH_EDGES: BootstrapGraphEdge[] = [
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "agent:self",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "phase:ghostcrab:phase-0",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "phase:ghostcrab:phase-1",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "phase:ghostcrab:phase-2",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "phase:ghostcrab:phase-3",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:phase-0-foundation",
    target: "phase:ghostcrab:phase-0"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:phase-1-core",
    target: "phase:ghostcrab:phase-1"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:phase-2-surface",
    target: "phase:ghostcrab:phase-2"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:product-bootstrap-records",
    target: "phase:ghostcrab:phase-3"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:native-toolchain-pinning",
    target: "phase:ghostcrab:phase-3"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "component:ghostcrab:mcp-server",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "component:ghostcrab:postgres-core",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "component:ghostcrab:migration-runner",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "component:ghostcrab:docker-fallback",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "component:ghostcrab:bootstrap-seed",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "component:ghostcrab:native-extension-build",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "distribution:ghostcrab:npm-package",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "distribution:ghostcrab:docker-fallback",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "distribution:ghostcrab:compose-mcp-service",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "decision:ghostcrab:public-branding-split",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "decision:ghostcrab:docker-fallback-first",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "decision:ghostcrab:embedding-interface-first",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "constraint:ghostcrab:native-version-pinning",
    target: "product:ghostcrab"
  },
  {
    label: "BELONGS_TO",
    properties: { domain: "ghostcrab-product" },
    source: "constraint:ghostcrab:semantic-search-disabled",
    target: "product:ghostcrab"
  },
  {
    label: "ENABLES",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:phase-0-foundation",
    target: "component:ghostcrab:docker-fallback"
  },
  {
    label: "ENABLES",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:phase-1-core",
    target: "component:ghostcrab:mcp-server"
  },
  {
    label: "ENABLES",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:phase-2-surface",
    target: "component:ghostcrab:bootstrap-seed"
  },
  {
    label: "BLOCKS",
    properties: { domain: "ghostcrab-product" },
    source: "constraint:ghostcrab:native-version-pinning",
    target: "component:ghostcrab:native-extension-build"
  },
  {
    label: "BLOCKS",
    properties: { domain: "ghostcrab-product" },
    source: "component:ghostcrab:native-extension-build",
    target: "distribution:ghostcrab:compose-mcp-service"
  },
  {
    label: "HAS_GAP",
    properties: { domain: "ghostcrab-product" },
    source: "task:ghostcrab:native-toolchain-pinning",
    target: "concept:ghostcrab:native-compatibility"
  },
  {
    label: "HAS_GAP",
    properties: { domain: "ghostcrab-product", source: "bootstrap-status" },
    source: "agent:self",
    target: "concept:ghostcrab:native-compatibility"
  },
  {
    label: "ENABLES",
    properties: { domain: "ghostcrab-product" },
    source: "decision:ghostcrab:docker-fallback-first",
    target: "component:ghostcrab:docker-fallback"
  },
  {
    label: "ENABLES",
    properties: { domain: "ghostcrab-product" },
    source: "decision:ghostcrab:embedding-interface-first",
    target: "concept:ghostcrab:embeddings-capability"
  }
];

const FACET_DEFINITION_ENTRIES: BootstrapEntry[] =
  buildFacetDefinitionSeedEntries() as BootstrapEntry[];

const ALL_BOOTSTRAP_ENTRIES = [
  ...FACET_DEFINITION_ENTRIES,
  ...SYSTEM_ENTRIES,
  ...CANONICAL_SCHEMAS,
  ...CANONICAL_ONTOLOGY,
  ...PRODUCT_RECORDS,
  ...META_RECORDS
];

export function getBootstrapSeedPlan(): BootstrapSeedPlan {
  return {
    agentStates: 1,
    facetDefinitions: FACET_DEFINITION_ENTRIES.length,
    graphEdges: PRODUCT_GRAPH_EDGES.length,
    graphNodes: PRODUCT_GRAPH_NODES.length,
    systemEntries: SYSTEM_ENTRIES.length,
    schemas: CANONICAL_SCHEMAS.length,
    ontologies: CANONICAL_ONTOLOGY.length,
    projections: BOOTSTRAP_PROJECTIONS.length,
    productRecords: PRODUCT_RECORDS.length + META_RECORDS.length,
    summary:
      "Bootstrap data seeds declared facet definitions, mindbrain:system guidance, canonical schemas, starter ontologies, first factual GhostCrab product records, meta recipes for autonomy/projections across six activity families, a seeded product graph, and a ready-to-demo agent runtime state."
  };
}

export async function ensureBootstrapData(
  database: DatabaseClient
): Promise<BootstrapSeedSummary> {
  return database.transaction(async (queryable) => {
    const summary: BootstrapSeedSummary = {
      insertedAgentStates: 0,
      insertedFacetDefinitions: 0,
      insertedGraphEdges: 0,
      insertedGraphNodes: 0,
      insertedSystemEntries: 0,
      insertedSchemas: 0,
      insertedOntologies: 0,
      insertedProjections: 0,
      insertedProductRecords: 0,
      skipped: 0
    };

    for (const entry of ALL_BOOTSTRAP_ENTRIES) {
      const inserted = await ensureFacetEntry(queryable, entry);

      if (!inserted) {
        summary.skipped += 1;
        continue;
      }

      if (entry.schemaId === "mindbrain:system") {
        summary.insertedSystemEntries += 1;
      } else if (entry.schemaId === "mindbrain:facet-definition") {
        summary.insertedFacetDefinitions += 1;
      } else if (entry.schemaId === "mindbrain:schema") {
        summary.insertedSchemas += 1;
      } else if (entry.schemaId === "mindbrain:ontology") {
        summary.insertedOntologies += 1;
      } else {
        summary.insertedProductRecords += 1;
      }
    }

    for (const node of PRODUCT_GRAPH_NODES) {
      const inserted = await ensureGraphNode(queryable, node);

      if (!inserted) {
        summary.skipped += 1;
        continue;
      }

      summary.insertedGraphNodes += 1;
    }

    for (const edge of PRODUCT_GRAPH_EDGES) {
      const inserted = await ensureGraphEdge(queryable, edge);

      if (!inserted) {
        summary.skipped += 1;
        continue;
      }

      summary.insertedGraphEdges += 1;
    }

    const insertedAgentState = await ensureAgentState(
      queryable,
      BOOTSTRAP_AGENT_STATE
    );

    if (insertedAgentState) {
      summary.insertedAgentStates += 1;
    } else {
      summary.skipped += 1;
    }

    for (const projection of BOOTSTRAP_PROJECTIONS) {
      const inserted = await ensureProjection(queryable, projection);

      if (!inserted) {
        summary.skipped += 1;
        continue;
      }

      summary.insertedProjections += 1;
    }

    return summary;
  });
}

async function ensureFacetEntry(
  queryable: Queryable,
  entry: BootstrapEntry
): Promise<boolean> {
  validateFacetEntry(entry);
  // Build a json_extract-based WHERE clause for each lookupFacets key so the
  // query works with SQLite (which has no @> containment operator).
  const lookupPairs = Object.entries(entry.lookupFacets);
  const jsonExtractClauses = lookupPairs.map(
    ([key]) => `json_extract(facets_json, '$.${key}') = ?`
  );
  const lookupValues = lookupPairs.map(([, val]) =>
    typeof val === "object" && val !== null ? JSON.stringify(val) : val
  );

  const [existing] = await queryable.query<{
    content: string;
    facets_json: string;
    id: string;
  }>(
    `
      SELECT id, content, facets_json
      FROM mb_pragma.facets
      WHERE schema_id = ?
        ${jsonExtractClauses.length > 0 ? `AND ${jsonExtractClauses.join(" AND ")}` : ""}
      LIMIT 1
    `,
    [entry.schemaId, ...lookupValues]
  );

  const serializedContent = serializeContent(entry.content);
  const serializedFacets = JSON.stringify(entry.facets);

  if (existing) {
    const existingFacets =
      typeof existing.facets_json === "string"
        ? existing.facets_json
        : JSON.stringify(existing.facets_json ?? {});

    if (
      existing.content !== serializedContent ||
      existingFacets !== serializedFacets
    ) {
      await queryable.query(
        `
          UPDATE mb_pragma.facets
          SET content = ?,
              facets_json = ?
          WHERE id = ?
        `,
        [serializedContent, serializedFacets, existing.id]
      );
    }

    return false;
  }

  await queryable.query(
    `
      INSERT INTO mb_pragma.facets (schema_id, content, facets_json)
      VALUES (?, ?, ?)
    `,
    [entry.schemaId, serializedContent, serializedFacets]
  );

  return true;
}

function validateFacetEntry(entry: BootstrapEntry): void {
  if (entry.schemaId === "mindbrain:facet-definition") {
    return;
  }

  const unknownFacetKeys = Object.keys(entry.facets).filter(
    (key) => !isKnownFacetName(key)
  );
  const unknownLookupFacetKeys = Object.keys(entry.lookupFacets).filter(
    (key) => !isKnownFacetName(key)
  );

  if (unknownFacetKeys.length === 0 && unknownLookupFacetKeys.length === 0) {
    return;
  }

  const details = [
    unknownFacetKeys.length > 0 ? `facets=${unknownFacetKeys.join(", ")}` : null,
    unknownLookupFacetKeys.length > 0
      ? `lookupFacets=${unknownLookupFacetKeys.join(", ")}`
      : null
  ]
    .filter((part): part is string => part !== null)
    .join("; ");

  throw new Error(
    `Bootstrap entry ${entry.schemaId} uses undeclared facet keys: ${details}`
  );
}

function serializeContent(content: BootstrapEntry["content"]): string {
  return typeof content === "string"
    ? content
    : JSON.stringify(content, null, 2);
}

async function ensureGraphNode(
  queryable: Queryable,
  node: BootstrapGraphNode
): Promise<boolean> {
  const existing = await resolveGraphEntityId(queryable, node.id);

  if (existing !== null) {
    return false;
  }

  await upsertGraphEntity(queryable, {
    nodeId: node.id,
    nodeType: node.nodeType,
    label: node.label,
    properties: node.properties,
    schemaId: node.schemaId ?? null
  });

  return true;
}

async function ensureGraphEdge(
  queryable: Queryable,
  edge: BootstrapGraphEdge
): Promise<boolean> {
  const existing = await findGraphRelationByEndpoints(queryable, {
    sourceName: edge.source,
    targetName: edge.target,
    label: edge.label
  });

  if (existing) {
    return false;
  }

  await upsertGraphEntity(queryable, {
    nodeId: edge.source,
    nodeType: "unknown",
    label: edge.source,
    properties: {},
    schemaId: null
  });
  await upsertGraphEntity(queryable, {
    nodeId: edge.target,
    nodeType: "unknown",
    label: edge.target,
    properties: {},
    schemaId: null
  });

  const sourceId = await resolveGraphEntityId(queryable, edge.source);
  const targetId = await resolveGraphEntityId(queryable, edge.target);

  if (sourceId === null || targetId === null) {
    return false;
  }

  await upsertGraphRelation(queryable, {
    label: edge.label,
    properties: edge.properties,
    sourceId,
    targetId,
    confidence: edge.weight ?? 1
  });

  return true;
}

async function ensureAgentState(
  queryable: Queryable,
  agentState: BootstrapAgentState
): Promise<boolean> {
  const [existing] = await queryable.query<{ agent_id: string }>(
    `
      SELECT agent_id
      FROM mb_pragma.agent_state
      WHERE agent_id = ?
      LIMIT 1
    `,
    [agentState.agentId]
  );

  if (existing) {
    return false;
  }

  await queryable.query(
    `
      INSERT INTO mb_pragma.agent_state (agent_id, health, state, metrics_json)
      VALUES (?, ?, ?, ?)
    `,
    [
      agentState.agentId,
      agentState.health,
      agentState.state,
      JSON.stringify(agentState.metrics)
    ]
  );

  return true;
}

async function ensureProjection(
  queryable: Queryable,
  projection: BootstrapProjection
): Promise<boolean> {
  const scope = projection.scope ?? null;

  const [existing] = await queryable.query<{ id: string }>(
    `
      SELECT id
      FROM mb_pragma.projections
      WHERE agent_id = ?
        AND (scope = ? OR (scope IS NULL AND ? IS NULL))
        AND proj_type = ?
        AND content = ?
      LIMIT 1
    `,
    [projection.agentId, scope, scope, projection.projType, projection.content]
  );

  if (existing) {
    return false;
  }

  await queryable.query(
    `
      INSERT INTO mb_pragma.projections (
        id,
        agent_id,
        scope,
        proj_type,
        content,
        weight,
        source_type,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      randomUUID(),
      projection.agentId,
      scope,
      projection.projType,
      projection.content,
      projection.weight,
      projection.sourceType ?? null,
      projection.status
    ]
  );

  return true;
}
