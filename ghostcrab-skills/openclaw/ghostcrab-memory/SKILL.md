---
name: ghostcrab-memory
description: Use the GhostCrab MCP server as persistent memory and epistemic support.
---

# GhostCrab Memory Skill

Use the `ghostcrab` MCP server as persistent memory and epistemic support.

**Canonical first-turn fuzzy onboarding and hard gate:** [../../shared/ONBOARDING_CONTRACT.md](../../shared/ONBOARDING_CONTRACT.md). This skill adds OpenClaw execution habits; do not contradict the contract.

## Persona Rule

Speak in product language first.
If the user is still figuring out their project, do not lead with schemas, graph edges, or MCP tool names.

## Core Rules

1. Search before asserting durable facts.
2. Prefer structured retrieval before semantic or broad retrieval.
3. Pack only after at least one factual read when the task depends on stored product data.
4. Write back durable learning before the session ends.
5. If coverage is partial, disclose the gap instead of guessing.
6. For a new activity domain, read GhostCrab's autonomy and recipe layer before inventing a model.
7. If the user request implies persistence, repeated follow-up, KPIs, blockers, or an external signal that should become durable, GhostCrab becomes mandatory.
8. When the user gives execution constraints, obey them exactly. Do not create more writes, sections, or domains than requested.
9. For long-running work, keep phase, environment, and external-system context queryable on durable records rather than leaving them in prose only.
10. End each meaningful session or phase boundary with a checkpoint.
11. Before overwriting a meaningful current-state record, preserve transition rationale when recovery would otherwise lose why the state changed.

## Low-Reasoning Discipline

Assume the active LLM may be good but not frontier-level.

That means:

1. prefer a short fixed tool sequence over open exploration
2. do not branch unless the user asked for alternatives
3. if a read is empty or ambiguous, disclose it and stop expanding the search after two failed attempts
4. if the user asks for exactly one write, do exactly one write
5. if the user asks for exact headings or a strict response format, follow it literally
6. if a domain or profile is named, stay inside it unless you explicitly announce a switch
7. treat one zero-result read as local evidence only, never as proof that the whole domain is empty
8. for local ingest tasks, finalize the summary before writing and do not issue a corrective second write in the same run

## Structured Retrieval First

When the user asks about a known GhostCrab entity type, do not start with a vague search.
Use `ghostcrab_search` with an explicit `schema_id` and exact `filters` first.

Examples:

- runtime components:
  - `schema_id="ghostcrab:runtime-component"`
  - use exact filters like `{"status":"active"}` or `{"status":"blocking"}`
- roadmap items:
  - `schema_id="ghostcrab:roadmap-pr"`
  - use exact filters like `{"status":"done"}` or `{"status":"planned"}`
- distribution targets:
  - `schema_id="ghostcrab:distribution-target"`
- constraints:
  - `schema_id="ghostcrab:constraint"`
- decisions:
  - `schema_id="ghostcrab:decision"`

If the user names a domain but not a schema:

1. `ghostcrab_status`
2. inspect GhostCrab meta records if the domain is new:
   - `schema_id="ghostcrab:activity-family"`
   - `schema_id="ghostcrab:modeling-recipe"`
   - `schema_id="ghostcrab:projection-recipe"`
   - `schema_id="ghostcrab:kpi-pattern"`
   - `schema_id="ghostcrab:autonomy-policy"`
   - `schema_id="ghostcrab:intent-pattern"`
   - `schema_id="ghostcrab:signal-pattern"`
   - `schema_id="ghostcrab:ingest-pattern"`
3. `ghostcrab_coverage`
4. `ghostcrab_search` with the best explicit schema guess
5. `ghostcrab_count` if the space still looks broad
6. `ghostcrab_pack` only after those reads if synthesis is needed

If the user asks you to create a new recurring workspace such as kanban, incident tracker, CRM board, or knowledge map:

1. `ghostcrab_status`
2. read the closest `ghostcrab:activity-family`
3. read the matching `ghostcrab:modeling-recipe`
4. create a provisional model first
5. prefer facts first, graph second, projection third
6. ask for confirmation only before freezing a canonical schema or public naming convention

If the request is a first-turn fuzzy onboarding request:

1. do not call `ghostcrab_status` unless runtime health or autonomy gaps actually matter
2. do not call `ghostcrab_schema_list`
3. do not call `ghostcrab_schema_register`
4. do not create a canonical schema, custom schema, or new enum set before clarification
5. do not propose local files, YAML, JSON, Markdown, or alternate storage when the user already chose GhostCrab
6. infer the most likely activity family first and say it briefly when it is visible
7. default to intent analysis plus 2 to 4 clarification questions with at least half shaped by that family
8. mention the likely compact recovery view when the route is already visible
9. explicitly offer help writing the next structured GhostCrab prompt before any implementation
10. do not ask about cadence unless cadence changes the setup or recovery view
11. do not treat "I installed GhostCrab but do not know how to use it" as permission to build immediately
12. stop after intent hypothesis, clarification questions, compact-view recommendation, and prompt-help offer

If the user gives a local ingest task such as an email, message, calendar event, or search result:

1. do not call `ghostcrab_status` first unless the user explicitly asked about runtime health, autonomy, or schema freeze policy
2. read `ghostcrab:intent-pattern`
3. read `ghostcrab:ingest-pattern`
4. read `ghostcrab:signal-pattern`
5. inspect one local-domain surface only if needed
6. store a summarized durable record only if justified
7. never store the raw payload when the ingest pattern says `store_summary_not_raw`
8. never import deadlines, blockers, or content from an earlier run
9. never mention global gaps in the final answer for a local ingest task
10. never mention embeddings, semantic search, or retrieval backend status in a local ingest answer unless the user explicitly asked about search behavior

If the user gives a named profile such as `project-delivery` or `crm-pipeline`:

1. stay inside that profile by default
2. do not switch to `ghostcrab-product` or another profile silently
3. do not mention global gaps unless they directly affect the active request
4. if an exact read returns zero rows, say only that this exact read returned zero rows

## Default Opening Pattern

At session start:

1. `ghostcrab_status`
2. `ghostcrab_search` on the active domain using explicit `schema_id` and `filters` whenever possible
3. `ghostcrab_count` if the domain is still broad
4. if the domain is novel, read the recipe layer before modeling
5. `ghostcrab_pack` if the task is multi-step or risky and factual reads already happened

Exception for local ingest tasks:

1. `ghostcrab_search` on `ghostcrab:intent-pattern`
2. `ghostcrab_search` on `ghostcrab:ingest-pattern`
3. `ghostcrab_search` on `ghostcrab:signal-pattern`
4. one local-domain read only if needed
5. one durable write only if justified

Do not start local ingest tasks with `ghostcrab_status`.

Exception for first-turn fuzzy onboarding:

1. do not start with `ghostcrab_status` unless runtime health or autonomy gaps actually matter
2. do not use schema enumeration or tool walkthroughs as the opening move
3. inspect intent and recipe surfaces only if needed after the intake
4. ask family-shaped questions before proposing model structure

## Product-Domain Defaults

When the user asks about the seeded GhostCrab product:

1. check `ghostcrab_status`
2. use `ghostcrab_search` or `ghostcrab_count` against explicit product schemas
3. use `ghostcrab_traverse` for blockers, dependencies, and gaps
4. use `ghostcrab_pack` only to compress already observed facts

Do not say "nothing is seeded" unless a structured query with explicit `schema_id` and relevant exact filters returned no rows.

## Default Write-Back Pattern

Use:

- `ghostcrab_remember` for durable facts
- `ghostcrab_upsert` for current-state fact updates such as task status, owner, blocker state, or lead stage when duplicates would be harmful
- `ghostcrab_learn` for nodes and edges that should persist structurally
- `ghostcrab_project` for provisional heartbeat, board, or release projections that should be queryable later

For living trackers:

- `ghostcrab:task` should be the source of truth for current task state
- keep `status`, `owner`, `priority`, and similar current-state fields on the task itself
- use `ghostcrab_upsert` to change that state in place
- use `agent:observation` for notes, preferences, and external signal summaries, not as the primary status layer for an existing task

For a reliable `mini-heartbeat`:

1. read `ghostcrab:task` for the active scope
2. count `ghostcrab:task` by `status` and `priority`
3. read `ghostcrab:constraint` only when blockers are modeled separately
4. do not treat a parallel observation layer as the canonical tracker state if `ghostcrab:task` already exists

For long-running recovery:

1. read canonical current-state records first
2. then read supporting `ghostcrab:source` and `ghostcrab:note` records
3. then choose the smallest recovery projection such as `phase-heartbeat`, `deployment-brief`, or `integration-health-brief`

For first-turn onboarding with a visible route, close with a user-facing line such as:

- `Likely recovery view: deployment-brief.`
- `If you want, I can turn your answers into a clean GhostCrab starter prompt next.`

Prefer this modeling order for new domains:

1. facts with strong retrieval facets
2. graph nodes and edges for stable relations
3. projections for compact working context and heartbeat summaries

When the user asks for a projection:

1. check whether one already exists for the requested scope
2. if the user asked for exactly one provisional projection, create at most one
3. verify the projection with one structured read or pack call only if the tool contract supports it

## What To Avoid

- do not jump straight to `ghostcrab_pack` when `ghostcrab_search` or `ghostcrab_count` could answer concretely
- do not use a broad free-text search when the user asked about a known schema type
- do not infer "no data" from a weak query if a stronger structured query is available
- do not repeat `ghostcrab_remember` for ephemeral scratch notes
- do not claim domain coverage without checking `ghostcrab_coverage`
- do not continue silently through explicit blockers from `ghostcrab_status`
- do not freeze a canonical schema when a provisional model will do
- do not mix graph-only conclusions with fact-store conclusions unless you say so explicitly
- do not keep exploring indefinitely after ambiguous reads; disclose ambiguity and propose the next constrained read instead
- do not ignore GhostCrab when the user asks for tracking, memory, dashboarding, or repeated follow-up
- do not create two projections when the user asked for one
- do not import unrelated global blockers into a domain-local answer
- do not claim an artifact is absent unless you actually read the surface that would return it
- do not say "no records exist" or "no data exists" after a single empty read; say "this exact read returned zero rows" unless you verified broader absence
- do not start a local ingest task with `ghostcrab_status`
- do not import a date, blocker, account, or summary detail from a previous run into the current ingest answer
- do not write a draft durable record and then silently overwrite it in the same run
- do not mention embeddings, semantic search, or retrieval backend status in a local ingest answer unless the user explicitly asked about search
- do not split current task status across `ghostcrab:task` and `agent:observation` as a steady-state design
- do not call `ghostcrab_schema_register` on a first-turn fuzzy onboarding request
- do not create a canonical schema, custom schema, or new enum set before clarification on an onboarding-style request
- do not skip intent analysis, clarification questions, and prompt coaching when the user is still asking for help framing the task
- do not keep the question set generic once the likely activity family is visible
- do not ask about cadence by reflex if it does not change the recommended setup or compact view
- do not reopen the storage decision if the user already chose GhostCrab
- do not propose local files or alternate storage as the default GhostCrab onboarding path
- do not leave environment identity only in narrative text when it will matter for later retrieval
- do not store raw API, log, or DB-inspection payloads as final durable records
