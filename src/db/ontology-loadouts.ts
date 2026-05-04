export interface OntologyLoadoutDefinition {
  loadout_id: string;
  label: string;
  description: string;
  domain_profile: string;
  keywords: string[];
  recommended_for: string[];
  modeling_questions: string[];
  core_entities: string[];
  core_relations: string[];
  facet_focus: string[];
  graph_focus: string[];
  suggested_next_tools: string[];
  default_for_new_workspace?: boolean;
}

export interface OntologyLoadoutSkeletonNode {
  id: string;
  node_type: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface OntologyLoadoutSkeletonEdge {
  source: string;
  target: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface OntologyLoadoutSemanticProposal {
  table_semantics: Array<Record<string, unknown>>;
  column_semantics: Array<Record<string, unknown>>;
  relation_semantics: Array<Record<string, unknown>>;
}

const ONTOLOGY_LOADOUTS: OntologyLoadoutDefinition[] = [
  {
    loadout_id: "default-minimal",
    label: "Default Minimal",
    description:
      "Generic ontology starter for a workspace whose domain is not yet known.",
    domain_profile: "default-minimal",
    keywords: ["default", "minimal", "generic", "unknown domain", "scratch"],
    recommended_for: [
      "starting from scratch",
      "unknown domain",
      "small and generic model"
    ],
    modeling_questions: [
      "What domain are we modeling?",
      "What are the core entity families?",
      "Which relations must exist from day one?",
      "Which facets must be filterable immediately?"
    ],
    core_entities: ["entity", "event", "topic"],
    core_relations: ["references", "belongs_to", "depends_on"],
    facet_focus: ["status", "type", "source"],
    graph_focus: ["generic identity and dependency links"],
    suggested_next_tools: [
      "ghostcrab_schema_register",
      "ghostcrab_learn",
      "ghostcrab_remember"
    ],
    default_for_new_workspace: true
  },
  {
    loadout_id: "crm",
    label: "CRM",
    description:
      "Customer, account, pipeline, and activity ontology starter.",
    domain_profile: "crm",
    keywords: ["crm", "sales", "pipeline", "account", "lead", "prospect", "opportunity", "customer", "contact"],
    recommended_for: [
      "accounts and contacts",
      "opportunity pipelines",
      "customer lifecycle tracking"
    ],
    modeling_questions: [
      "What is the account hierarchy?",
      "Which pipeline stages are real in this business?",
      "How are contacts, owners, and opportunities related?",
      "Which records need status and ownership facets?"
    ],
    core_entities: ["account", "contact", "opportunity", "activity"],
    core_relations: ["account_has_contact", "account_has_opportunity", "opportunity_has_activity"],
    facet_focus: ["status", "stage", "owner", "source", "segment"],
    graph_focus: ["customer ownership and pipeline transitions"],
    suggested_next_tools: [
      "ghostcrab_schema_register",
      "ghostcrab_learn",
      "ghostcrab_workspace_export_model"
    ]
  },
  {
    loadout_id: "kanban",
    label: "Kanban",
    description:
      "Task, board, sprint, and blocker ontology starter.",
    domain_profile: "kanban",
    keywords: ["kanban", "task", "board", "issue", "ticket", "sprint", "workflow", "backlog", "project"],
    recommended_for: [
      "delivery boards",
      "issue tracking",
      "task workflows"
    ],
    modeling_questions: [
      "What is the unit of work?",
      "Do we need boards, projects, or both?",
      "Which statuses and priorities are canonical?",
      "What blockers or dependencies matter?"
    ],
    core_entities: ["task", "board", "project", "blocker"],
    core_relations: ["board_has_task", "task_blocks_task", "project_contains_board"],
    facet_focus: ["status", "priority", "assignee", "project", "board"],
    graph_focus: ["work items, dependencies, and status movement"],
    suggested_next_tools: [
      "ghostcrab_schema_register",
      "ghostcrab_learn",
      "ghostcrab_workspace_export_model"
    ]
  },
  {
    loadout_id: "knowledge-base",
    label: "Knowledge Base",
    description:
      "Article, note, topic, and reference ontology starter.",
    domain_profile: "knowledge-base",
    keywords: ["knowledge base", "wiki", "docs", "documentation", "notes", "articles", "references", "research", "glossary"],
    recommended_for: [
      "documentation portals",
      "note collections",
      "searchable reference libraries"
    ],
    modeling_questions: [
      "What counts as a document versus a note?",
      "Which topic taxonomy should we use?",
      "What provenance fields are required?",
      "Which facets should power search?"
    ],
    core_entities: ["document", "note", "topic", "source"],
    core_relations: ["document_mentions_topic", "note_references_source", "document_links_document"],
    facet_focus: ["topic", "source", "author", "type", "language"],
    graph_focus: ["document links and topical navigation"],
    suggested_next_tools: [
      "ghostcrab_schema_register",
      "ghostcrab_learn",
      "ghostcrab_remember"
    ]
  },
  {
    loadout_id: "incident-response",
    label: "Incident Response",
    description:
      "Operational incidents, alerts, services, and remediation ontology starter.",
    domain_profile: "incident-response",
    keywords: ["incident", "outage", "alert", "runbook", "on-call", "severity", "service", "page", "triage"],
    recommended_for: [
      "on-call workflows",
      "incident management",
      "service health tracking"
    ],
    modeling_questions: [
      "What is a service in this environment?",
      "How do incidents relate to alerts and runbooks?",
      "What severity model should be used?",
      "Which ownership facets must be searchable?"
    ],
    core_entities: ["service", "incident", "alert", "runbook", "action"],
    core_relations: ["incident_affects_service", "incident_has_alert", "incident_has_action"],
    facet_focus: ["severity", "status", "service", "owner", "impact"],
    graph_focus: ["incident causality and remediation links"],
    suggested_next_tools: [
      "ghostcrab_schema_register",
      "ghostcrab_learn",
      "ghostcrab_workspace_export_model"
    ]
  },
  {
    loadout_id: "compliance",
    label: "Compliance",
    description:
      "Policy, control, obligation, evidence, and exception ontology starter.",
    domain_profile: "compliance",
    keywords: ["compliance", "audit", "policy", "control", "evidence", "risk", "obligation", "framework", "regulation"],
    recommended_for: [
      "regulatory mapping",
      "audit evidence tracking",
      "control coverage"
    ],
    modeling_questions: [
      "What framework or regulation is in scope?",
      "What counts as evidence?",
      "How should obligations and controls be linked?",
      "Which exception states matter?"
    ],
    core_entities: ["policy", "control", "obligation", "evidence", "exception"],
    core_relations: ["policy_defines_control", "control_satisfies_obligation", "evidence_supports_control"],
    facet_focus: ["status", "framework", "control_area", "owner", "due_date"],
    graph_focus: ["coverage, obligation, and evidence links"],
    suggested_next_tools: [
      "ghostcrab_schema_register",
      "ghostcrab_learn",
      "ghostcrab_coverage"
    ]
  },
  {
    loadout_id: "workflow-tracking",
    label: "Workflow Tracking",
    description:
      "Recurring process, checkpoint, and execution rhythm ontology starter.",
    domain_profile: "workflow-tracking",
    keywords: ["workflow", "process", "run", "step", "checkpoint", "delivery", "execution", "rhythm", "heartbeat"],
    recommended_for: [
      "operational runbooks",
      "process tracking",
      "repeatable delivery flows"
    ],
    modeling_questions: [
      "What is the recurring unit of work?",
      "What checkpoints matter in the workflow?",
      "How are runs and steps related?",
      "Which status transitions should be tracked?"
    ],
    core_entities: ["workflow", "run", "step", "checkpoint"],
    core_relations: ["workflow_has_step", "run_executes_workflow", "step_has_checkpoint"],
    facet_focus: ["status", "run_type", "owner", "schedule", "checkpoint"],
    graph_focus: ["run lifecycle and step dependencies"],
    suggested_next_tools: [
      "ghostcrab_schema_register",
      "ghostcrab_learn",
      "ghostcrab_workspace_export_model"
    ]
  }
];

export function getOntologyLoadoutCatalogSnapshot(): OntologyLoadoutDefinition[] {
  return ONTOLOGY_LOADOUTS.map((loadout) => ({
    ...loadout,
    recommended_for: [...loadout.recommended_for],
    keywords: [...loadout.keywords],
    modeling_questions: [...loadout.modeling_questions],
    core_entities: [...loadout.core_entities],
    core_relations: [...loadout.core_relations],
    facet_focus: [...loadout.facet_focus],
    graph_focus: [...loadout.graph_focus],
    suggested_next_tools: [...loadout.suggested_next_tools]
  }));
}

export function loadOntologyLoadout(
  loadoutId: string
): OntologyLoadoutDefinition | null {
  const loadout = ONTOLOGY_LOADOUTS.find(
    (entry) => entry.loadout_id === loadoutId
  );
  if (!loadout) {
    return null;
  }

  return {
    ...loadout,
    recommended_for: [...loadout.recommended_for],
    keywords: [...loadout.keywords],
    modeling_questions: [...loadout.modeling_questions],
    core_entities: [...loadout.core_entities],
    core_relations: [...loadout.core_relations],
    facet_focus: [...loadout.facet_focus],
    graph_focus: [...loadout.graph_focus],
    suggested_next_tools: [...loadout.suggested_next_tools]
  };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestOntologyLoadouts(goal: string, limit = 3): Array<{
  loadout: OntologyLoadoutDefinition;
  score: number;
  matched_terms: string[];
}> {
  const goalNormalized = normalizeText(goal);
  const matches = ONTOLOGY_LOADOUTS.map((loadout) => {
    const terms = [
      loadout.loadout_id,
      loadout.label,
      loadout.description,
      ...loadout.keywords,
      ...loadout.recommended_for,
      ...loadout.core_entities,
      ...loadout.core_relations,
      ...loadout.facet_focus,
      ...loadout.graph_focus,
      ...loadout.modeling_questions
    ].map(normalizeText);

    const matchedTerms = new Set<string>();
    let score = 0;
    for (const term of terms) {
      if (!term) continue;
      if (goalNormalized.includes(term)) {
        matchedTerms.add(term);
        score += Math.max(1, Math.min(5, term.split(" ").length));
      }
    }

    for (const keyword of loadout.keywords) {
      const keywordNormalized = normalizeText(keyword);
      if (keywordNormalized && goalNormalized.includes(keywordNormalized)) {
        matchedTerms.add(keyword);
        score += keywordNormalized.split(" ").length >= 2 ? 3 : 1;
      }
    }

    return {
      loadout,
      score,
      matched_terms: [...matchedTerms]
    };
  });

  matches.sort((left, right) => right.score - left.score || left.loadout.loadout_id.localeCompare(right.loadout.loadout_id));

  const filtered = matches.filter((entry) => entry.score > 0);
  const fallback = matches.find((entry) => entry.loadout.loadout_id === "default-minimal");

  return (filtered.length > 0 ? filtered : fallback ? [fallback] : matches)
    .slice(0, limit)
    .map((entry) => ({
      loadout: {
        ...entry.loadout,
        recommended_for: [...entry.loadout.recommended_for],
        keywords: [...entry.loadout.keywords],
        modeling_questions: [...entry.loadout.modeling_questions],
        core_entities: [...entry.loadout.core_entities],
        core_relations: [...entry.loadout.core_relations],
        facet_focus: [...entry.loadout.facet_focus],
        graph_focus: [...entry.loadout.graph_focus],
        suggested_next_tools: [...entry.loadout.suggested_next_tools]
      },
      score: entry.score,
      matched_terms: entry.matched_terms
    }));
}

export function buildOntologyLoadoutSkeleton(
  loadoutId: string,
  workspaceId: string
): {
  nodes: OntologyLoadoutSkeletonNode[];
  edges: OntologyLoadoutSkeletonEdge[];
} | null {
  const loadout = loadOntologyLoadout(loadoutId);
  if (!loadout) {
    return null;
  }

  const rootId = `workspace:${workspaceId}:loadout:${loadout.loadout_id}`;
  const recipeId = `${rootId}:modeling-recipe`;
  const familyId = `${rootId}:activity-family`;
  const projectionId = `${rootId}:projection-recipe`;
  const signalId = `${rootId}:signal-pattern`;

  const entityNodes = loadout.core_entities.map((entity) => ({
    id: `${rootId}:entity:${entity}`,
    node_type: "ontology_entity",
    label: entity,
    properties: {
      workspace_id: workspaceId,
      loadout_id: loadout.loadout_id,
      entity_name: entity
    }
  }));

  const relationNodes = loadout.core_relations.map((relation) => ({
    id: `${rootId}:relation:${relation}`,
    node_type: "ontology_relation",
    label: relation,
    properties: {
      workspace_id: workspaceId,
      loadout_id: loadout.loadout_id,
      relation_name: relation
    }
  }));

  const nodes: OntologyLoadoutSkeletonNode[] = [
    {
      id: rootId,
      node_type: "ontology_loadout",
      label: loadout.label,
      properties: {
        workspace_id: workspaceId,
        loadout_id: loadout.loadout_id,
        domain_profile: loadout.domain_profile,
        keywords: loadout.keywords,
        recommended_for: loadout.recommended_for
      }
    },
    {
      id: recipeId,
      node_type: "modeling_recipe",
      label: `${loadout.label} modeling recipe`,
      properties: {
        workspace_id: workspaceId,
        loadout_id: loadout.loadout_id,
        modeling_questions: loadout.modeling_questions
      }
    },
    {
      id: familyId,
      node_type: "activity_family",
      label: `${loadout.label} family`,
      properties: {
        workspace_id: workspaceId,
        loadout_id: loadout.loadout_id,
        core_entities: loadout.core_entities
      }
    },
    {
      id: projectionId,
      node_type: "projection_recipe",
      label: `${loadout.label} projection recipe`,
      properties: {
        workspace_id: workspaceId,
        loadout_id: loadout.loadout_id,
        suggested_next_tools: loadout.suggested_next_tools
      }
    },
    {
      id: signalId,
      node_type: "signal_pattern",
      label: `${loadout.label} signal pattern`,
      properties: {
        workspace_id: workspaceId,
        loadout_id: loadout.loadout_id,
        facet_focus: loadout.facet_focus,
        graph_focus: loadout.graph_focus
      }
    },
    ...entityNodes,
    ...relationNodes
  ];

  const edges: OntologyLoadoutSkeletonEdge[] = [
    {
      source: rootId,
      target: recipeId,
      label: "has_recipe",
      properties: { workspace_id: workspaceId, loadout_id: loadout.loadout_id }
    },
    {
      source: rootId,
      target: familyId,
      label: "has_family",
      properties: { workspace_id: workspaceId, loadout_id: loadout.loadout_id }
    },
    {
      source: rootId,
      target: projectionId,
      label: "has_projection",
      properties: { workspace_id: workspaceId, loadout_id: loadout.loadout_id }
    },
    {
      source: rootId,
      target: signalId,
      label: "has_signal_pattern",
      properties: { workspace_id: workspaceId, loadout_id: loadout.loadout_id }
    },
    ...entityNodes.map((node) => ({
      source: rootId,
      target: node.id,
      label: "contains_entity",
      properties: { workspace_id: workspaceId, loadout_id: loadout.loadout_id }
    })),
    ...relationNodes.map((node) => ({
      source: rootId,
      target: node.id,
      label: "contains_relation",
      properties: { workspace_id: workspaceId, loadout_id: loadout.loadout_id }
    }))
  ];

  return { nodes, edges };
}

function isLifecycleEntity(name: string): boolean {
  return [
    "activity",
    "action",
    "alert",
    "check",
    "checkpoint",
    "incident",
    "opportunity",
    "run",
    "step",
    "task",
    "workflow"
  ].includes(name.toLowerCase());
}

function inferPlaceholderBusinessRole(
  loadoutId: string,
  entityName: string
): string {
  const entity = entityName.toLowerCase();
  if (loadoutId === "crm") {
    if (entity === "account" || entity === "contact") return "actor";
    if (entity === "opportunity") return "stateful_item";
    if (entity === "activity") return "event";
  }
  if (loadoutId === "kanban") {
    if (entity === "task") return "stateful_item";
    if (entity === "board" || entity === "project") return "reference";
    if (entity === "blocker") return "association";
  }
  if (loadoutId === "incident-response") {
    if (entity === "incident" || entity === "alert" || entity === "action") return "event";
    if (entity === "service" || entity === "runbook") return "reference";
  }
  if (loadoutId === "compliance") {
    if (entity === "exception") return "stateful_item";
    return "reference";
  }
  if (loadoutId === "workflow-tracking") {
    if (entity === "run" || entity === "step") return "event";
    return "reference";
  }
  if (loadoutId === "knowledge-base") {
    if (entity === "document" || entity === "note") return "reference";
    return "hierarchy";
  }
  if (isLifecycleEntity(entity)) {
    return "stateful_item";
  }
  return "reference";
}

function buildPlaceholderColumns(entityName: string): Array<Record<string, unknown>> {
  const lower = entityName.toLowerCase();
  const columns: Array<Record<string, unknown>> = [
    {
      column_name: "id",
      column_role: "id",
      public_column_role: "id",
      semantic_type: "identifier",
      graph_usage: "entity_name"
    },
    {
      column_name: "label",
      column_role: "attribute",
      public_column_role: "label",
      semantic_type: "free_text",
      graph_usage: "entity_name"
    }
  ];

  if (
    lower.includes("task") ||
    lower.includes("opportunity") ||
    lower.includes("incident") ||
    lower.includes("alert") ||
    lower.includes("run") ||
    lower.includes("workflow") ||
    lower.includes("service") ||
    lower.includes("document") ||
    lower.includes("note") ||
    lower.includes("policy") ||
    lower.includes("control") ||
    lower.includes("obligation") ||
    lower.includes("evidence") ||
    lower.includes("exception")
  ) {
    columns.push({
      column_name: "status",
      column_role: "status",
      public_column_role: "status",
      semantic_type: "state",
      graph_usage: "entity_property"
    });
  }

  return columns;
}

export function buildOntologyLoadoutSemanticProposal(
  loadoutId: string,
  workspaceId: string
): OntologyLoadoutSemanticProposal | null {
  const loadout = loadOntologyLoadout(loadoutId);
  if (!loadout) {
    return null;
  }

  const rootTableName = `loadout_${loadout.loadout_id}`;
  const table_semantics: Array<Record<string, unknown>> = [
    {
      table_schema: "loadout",
      table_name: rootTableName,
      business_role: "reference",
      generation_strategy: "unknown",
      emit_facets: false,
      emit_graph_entity: true,
      emit_graph_relation: false,
      notes: JSON.stringify({
        placeholder: true,
        loadout_id: loadout.loadout_id,
        workspace_id: workspaceId,
        label: loadout.label,
        description: loadout.description
      })
    }
  ];

  const column_semantics: Array<Record<string, unknown>> = [
    {
      table_schema: "loadout",
      table_name: rootTableName,
      column_name: "id",
      column_role: "id",
      public_column_role: "id",
      semantic_type: "identifier",
      graph_usage: "entity_name"
    },
    {
      table_schema: "loadout",
      table_name: rootTableName,
      column_name: "label",
      column_role: "attribute",
      public_column_role: "label",
      semantic_type: "free_text",
      graph_usage: "entity_name"
    },
    {
      table_schema: "loadout",
      table_name: rootTableName,
      column_name: "domain_profile",
      column_role: "attribute",
      public_column_role: "category",
      semantic_type: "enum",
      graph_usage: "entity_property"
    }
  ];

  const relation_semantics: Array<Record<string, unknown>> = [];

  for (const entityName of loadout.core_entities) {
    const entityTableName = `${loadout.loadout_id}_${entityName}`;
    table_semantics.push({
      table_schema: "loadout",
      table_name: entityTableName,
      business_role: inferPlaceholderBusinessRole(loadout.loadout_id, entityName),
      generation_strategy: "unknown",
      emit_facets: true,
      emit_graph_entity: true,
      emit_graph_relation: false,
      notes: JSON.stringify({
        placeholder: true,
        loadout_id: loadout.loadout_id,
        workspace_id: workspaceId,
        entity_name: entityName
      })
    });

    for (const column of buildPlaceholderColumns(entityName)) {
      column_semantics.push({
        table_schema: "loadout",
        table_name: entityTableName,
        ...column
      });
    }

    relation_semantics.push({
      from_schema: "loadout",
      from_table: rootTableName,
      to_schema: "loadout",
      to_table: entityTableName,
      fk_column: `${entityName}_id`,
      relation_kind: "unknown",
      relation_role: "contains",
      hierarchical: false,
      graph_label: `contains_${entityName}`,
      target_column: "id"
    });
  }

  return { table_semantics, column_semantics, relation_semantics };
}
