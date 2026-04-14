/**
 * Single source of truth for GhostCrab product framing: MCP instructions,
 * ghostcrab_status preamble, static readme resource, and human-facing docs.
 */

/** URI advertised via resources/list and resources/read. */
export const GHOSTCRAB_README_URI = "ghostcrab://readme";

const ROLE_LINES = [
  "GhostCrab is durable structured memory for agents: persistent facts, schemas, knowledge graph, facets, and projections.",
  "Use it for workflow tracking, CRM pipelines, compliance, knowledge bases, and domain modeling."
] as const;

const NON_GOAL_LINE =
  "Non-goal: MCP is the ontology and query surface — high-throughput ingestion belongs on direct SQL, not MCP streaming.";

/** First-turn fuzzy onboarding: question count (aligned with ONBOARDING_CONTRACT.md). */
const FIRST_TURN_QUESTION_DISCIPLINE = [
  "First-turn fuzzy GhostCrab onboarding — question discipline:",
  "  Exactly 2–4 clarification questions (prefer 3). Each question uses exactly one question mark.",
  "  Do not bundle sub-questions or numbered sub-points inside a single question."
].join("\n");

/** Required closing lines for French default; models must translate when the user is not using French. */
const FIRST_TURN_REQUIRED_CLOSING_LINES = [
  "First-turn fuzzy onboarding — required closing lines:",
  "When the user mentions GhostCrab with a fuzzy/exploratory request and has not asked for implementation,",
  "the reply MUST end with exactly:",
  "",
  "  Vue probable : <view-name> — <one-line benefit>.",
  "  Je peux te rédiger le prochain prompt GhostCrab dès que tu m'as répondu.",
  "",
  "(Translate if the user is not speaking French.)"
].join("\n");

/** Checklist when embedded in ghostcrab_status (refers to fields in the same response). */
function firstCallChecklistForStatus(): string {
  return (
    "Checklist: (1) review this status for routing and autonomy; (2) inspect a recipe schema from suggested_recipe_queries below; " +
    "(3) scope to a workspace before writing; (4) read before write (search/count/pack first)."
  );
}

/** Checklist for static surfaces (readme resource, repo doc) — explicit tool names. */
function firstCallChecklistStandalone(): string {
  return [
    "First-call checklist:",
    "  1. Call ghostcrab_status before any other tool (routing, autonomy, recipe pointers).",
    "  2. For a natural-language modeling goal, use ghostcrab_modeling_guidance; otherwise inspect recipe schemas with ghostcrab_schema_inspect (see suggested_recipe_queries in status).",
    "  3. Scope writes to a workspace (create or select) before upsert/remember/learn.",
    "  4. Read before write: count → search → pack before changing data."
  ].join("\n");
}

/** Same narrative block as ghostcrab_status.preamble (optimized for the status JSON payload). */
export function buildStatusPreamble(): string {
  return [...ROLE_LINES, NON_GOAL_LINE, firstCallChecklistForStatus()].join("\n");
}

/** Markdown body for the ghostcrab://readme resource (mirrors preamble + checklist). */
export function buildReadmeMarkdown(): string {
  const title = "# GhostCrab — agent brief\n\n";
  const body = [...ROLE_LINES, "", NON_GOAL_LINE, "", firstCallChecklistStandalone()].join("\n");
  return title + body + "\n";
}

export interface McpInstructionsParams {
  backendUrlRedacted: string;
  toolCount: number;
  databaseReachable: boolean;
}

/**
 * MCP server `instructions` field (injected to clients). Kept aligned with readme and docs.
 */
export function buildMcpInstructions(params: McpInstructionsParams): string {
  const { backendUrlRedacted, toolCount, databaseReachable } = params;

  const onboardingDisciplineBlock = [
    FIRST_TURN_QUESTION_DISCIPLINE,
    "",
    FIRST_TURN_REQUIRED_CLOSING_LINES
  ].join("\n");

  if (!databaseReachable) {
    return (
      `GhostCrab — durable structured memory for agents.\n\n` +
      `${firstCallChecklistStandalone()}\n\n` +
      `${onboardingDisciplineBlock}\n\n` +
      `Backend: ${backendUrlRedacted}. ` +
      `WARNING: backend is unreachable. Call ghostcrab_status for diagnostics. ` +
      `Tools will return errors until the backend is available and the MCP server is restarted.`
    );
  }

  return (
    `GhostCrab — durable structured memory for agents.\n\n` +
    `Product role: persistent fact store with schemas, knowledge graph, facets, ` +
    `and projections. Use it for workflow tracking, CRM pipelines, compliance, ` +
    `knowledge bases, and domain modeling. MCP is the ontology and query surface; ` +
    `high-throughput ingestion uses direct SQL.\n\n` +
    `${firstCallChecklistStandalone()}\n\n` +
    `${onboardingDisciplineBlock}\n\n` +
    `Tool classification:\n` +
    `  Read  — search, pack, count, traverse, coverage, facet_tree, marketplace, schema_list, schema_inspect, workspace_list, workspace_inspect, workspace_export_model, query_geo\n` +
    `  Write — remember, learn, upsert, patch, schema_register, workspace_create\n` +
    `  Model — project, ddl_propose, ddl_execute, ddl_list_pending\n` +
    `  Guide — modeling_guidance (natural-language domain goals)\n` +
    `  Bootstrap — status (call first)\n\n` +
    `Backend: ${backendUrlRedacted}. Backend is reachable. ${toolCount} tools available.`
  );
}
