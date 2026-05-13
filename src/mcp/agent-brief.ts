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

/** Naive create/setup requests: align with ONBOARDING_CONTRACT.md §2 and §9. */
const DOMAIN_MODELING_GATE = [
  "Domain modeling gate (naive humans or agent callers):",
  "  Callers often do not know facets, graph, or projections — use product language first.",
  "  For create / set up / initialize in GhostCrab: share a short Model Proposal and get explicit user confirmation before workspace_create, remember, upsert, learn, or schema_register.",
  "  Canonical detail: ONBOARDING_CONTRACT.md §2 (naive literacy) and §9 (phases and confirmation)."
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

/** Markdown body for the ghostcrab://readme resource. */
export function buildReadmeMarkdown(): string {
  return `# GhostCrab — agent brief

## Role

${ROLE_LINES.join("\n")}

${NON_GOAL_LINE}

## Tool classification

| Class     | Tools |
|-----------|-------|
| Bootstrap | \`ghostcrab_status\` — call first for routing, autonomy, recipe pointers |
| Read      | \`search\`, \`count\`, \`schema_list\`, \`schema_inspect\`, \`pack\`, \`tool_search\` |
| Write     | \`remember\`, \`upsert\` |
| Model     | \`project\` |
| Guide     | \`modeling_guidance\` — natural-language domain goals |

The MCP default list is intentionally compact. Use \`ghostcrab_tool_search\` to discover hidden specialized tools such as workspace, ontology, loadout, graph, or DDL operations on demand.

## First-call checklist

${firstCallChecklistStandalone()}

## Domain modeling gate (naive callers)

- Callers often do not know facets, graph, or projections — use product language first.
- For create / set up / initialize in GhostCrab: share a short Model Proposal and get explicit user confirmation before \`workspace_create\`, \`remember\`, \`upsert\`, \`learn\`, or \`schema_register\`.
- Canonical detail: ONBOARDING_CONTRACT.md §2 (naive literacy) and §9 (phases and confirmation).

## Session start

For normal work (after intake is clear):

1. Call \`ghostcrab_status\` when runtime health, autonomy, or global blockers may affect the answer.
2. Call \`ghostcrab_search\` with explicit \`schema_id\` and exact filters when the entity family is recognizable.
3. Call \`ghostcrab_pack\` before heavy reasoning — only after at least one factual read.
4. Call \`ghostcrab_tool_search\` when the compact list does not expose the specialized tool family you need.

For local ingest (email, messages, calendar, search results): skip \`ghostcrab_status\`; follow ingest-specific patterns; store summaries, not raw payloads.

## Read and write discipline

- **Query before asserting.** Never treat one empty read as proof the whole domain is empty.
- **Read ladder:** count (broad domain) → search (concrete question) → pack (complex work, after a factual read).
- **One write per user request.** Finalize the summary before writing.
- **Tool choice:**
  - \`ghostcrab_remember\` — durable facts, architecture decisions, bug root causes, stable insights
  - \`ghostcrab_upsert\` — in-place current-state changes (status, owner, stage, blocker)
  - \`ghostcrab_learn\` — stable graph structure, blocker/enablement relations, gap nodes
  - \`ghostcrab_project\` — provisional compact views and delivery snapshots

## Workspace scope

- Call \`ghostcrab_workspace_use\` with a \`workspace_id\` (and optionally \`schema_id\`) to set session defaults for this MCP server process.
- After calling \`ghostcrab_workspace_use\`, all subsequent tool calls use that workspace/schema unless they pass explicit \`workspace_id\` / \`schema_id\` overrides.
- \`ghostcrab_status\` always echoes \`active_workspace_id\` and \`active_schema_id\` so you can verify the current session context.
- Scope writes to a workspace before calling upsert/remember/learn.
- Stay inside one workspace unless you explicitly announce a switch.
- If the user already chose GhostCrab, do not reopen the storage decision.
- Session context is shared across all chats in the same MCP server process. For parallel-chat isolation, pass explicit \`workspace_id\` / \`schema_id\` per call, or use separate MCP server entries.

## Living tracker and checkpoints

- Use \`ghostcrab:task\` as source of truth for current task state; use \`ghostcrab_upsert\` for status/owner/priority changes.
- End each meaningful session or phase boundary with a checkpoint: \`ghostcrab:note\`, \`note_kind: "checkpoint"\`.
- Before overwriting a current-state record, preserve the transition rationale when losing it would hurt recovery.

## Gap handling

- If \`ghostcrab_status\` or \`ghostcrab_coverage\` shows gaps, continue only with disclosure when acceptable; otherwise escalate with the specific gap.
- For local tasks, do not import unrelated global gaps unless they affect the answer.
`;
}

export interface McpInstructionsParams {
  backendUrlRedacted: string;
  databaseReachable: boolean;
  extendedToolCount: number;
  listedToolCount: number;
}

/**
 * MCP server `instructions` field (injected to clients). Kept aligned with readme and docs.
 */
export function buildMcpInstructions(params: McpInstructionsParams): string {
  const {
    backendUrlRedacted,
    databaseReachable,
    extendedToolCount,
    listedToolCount
  } = params;

  const onboardingDisciplineBlock = [
    FIRST_TURN_QUESTION_DISCIPLINE,
    "",
    FIRST_TURN_REQUIRED_CLOSING_LINES,
    "",
    DOMAIN_MODELING_GATE
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
    `  Read  — search, count, schema_list, schema_inspect, pack, tool_search\n` +
    `  Write — remember, upsert\n` +
    `  Model — project\n` +
    `  Guide — modeling_guidance (natural-language domain goals)\n` +
    `  Bootstrap — status (call first)\n\n` +
    `The default list is intentionally compact. Use ghostcrab_tool_search to discover specialized hidden tools on demand.\n\n` +
    `Backend: ${backendUrlRedacted}. Backend is reachable. ${listedToolCount} tools are listed by default; ${extendedToolCount} tools are registered in the full catalog.`
  );
}
