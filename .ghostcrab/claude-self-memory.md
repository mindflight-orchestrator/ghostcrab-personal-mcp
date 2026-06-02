## GhostCrab Self Memory

**Canonical onboarding and first-turn fuzzy rules:** [ONBOARDING_CONTRACT.md](./skills/shared/ONBOARDING_CONTRACT.md). This file adds Claude Code–specific session, ingest, and workflow detail; it must not contradict the contract.

### Persona Rule

Speak in user language first. If the user is still figuring out the project, talk about their work, blockers, follow-up, recovery view, and next step before talking about schemas, graph edges, or MCP tools.

### Session Start

At the beginning of each session:

1. call `ghostcrab_status` when runtime health, autonomy, or global blockers may matter
2. call `ghostcrab_search` for the current repo, task context, or named domain using explicit `schema_id` and exact filters whenever possible
3. call `ghostcrab_pack` before non-trivial work only after at least one factual read

For local ingest tasks such as email, message, calendar, or search result:

1. do not start with `ghostcrab_status`
2. inspect `ghostcrab:intent-pattern`
3. inspect `ghostcrab:ingest-pattern`
4. inspect `ghostcrab:signal-pattern`
5. inspect one local-domain surface only if it changes the write decision
6. write one summarized durable record only if justified
7. do not store the raw payload when the ingest pattern says `store_summary_not_raw`
8. do not mention global runtime gaps or retrieval backend status unless the user explicitly asked about them

### First-turn fuzzy GhostCrab onboarding

Apply **[ONBOARDING_CONTRACT.md](./skills/shared/ONBOARDING_CONTRACT.md)** in full (**§2** naive literacy, **§3–§8** first-turn fuzzy and scope, **§9** domain modeling gate, hard gate, pre-send checklist, French or locale closing lines). No duplicate rule list here.

### Rules (operational summary)

1. Query before asserting durable repo knowledge.
2. Prefer exact `schema_id` plus filters over vague search when the entity family is recognizable.
3. Pack before long reasoning or multi-step edits, but only after a factual read.
4. Write back before the session ends when the knowledge is likely to recur.
5. If the user names one domain or profile, stay inside it unless you explicitly announce a switch.
6. Do not claim "no data exists" after one empty exact read.
7. If the user asks for one write, do one write. Finalize the summary before writing.
8. For local ingest tasks, do not reuse dates, blockers, or content from a previous run.
9. For long-running work, keep phase, environment, and external system context on durable records that can be filtered later.
10. Do not ask about cadence on onboarding unless cadence would change the recommended setup or compact recovery view.
11. Use confidence in the likely activity family to improve the questions, not to justify starting setup before intake is done.

### Tool choice (when past intake)

Use `ghostcrab_remember` for:

- architecture decisions
- non-obvious repo conventions
- bug root causes
- stable dependency insights
- review preferences that are likely to recur

Use `ghostcrab_upsert` for:

- current-state task status changes
- owner changes on an existing durable record
- blocker or stage changes where duplicate facts would create ambiguity
- minimal in-place state refreshes for a stable `record_id`

Use `ghostcrab_learn` for:

- durable graph structure
- blocker relations
- enablement relations
- gap nodes discovered during work

Use `ghostcrab_project` for:

- provisional board views
- compact heartbeat scopes
- release or delivery snapshots
- temporary working projections that should stay queryable without freezing a schema

### Living Tracker Contract

For living trackers such as project boards or recurring delivery work:

- `ghostcrab:task` is the source of truth for current task state
- keep `status`, `owner`, `priority`, and similar current-state fields on the task itself
- use `ghostcrab_upsert` when those fields change
- use `agent:observation` for notes, preferences, external signals, and summaries, not as the primary status layer for an existing task

For a reliable `mini-heartbeat`:

1. read `ghostcrab:task` for the requested scope
2. count `ghostcrab:task` by `status` and `priority`
3. read `ghostcrab:constraint` only if blockers are modeled separately
4. build the final status view from those canonical current-state records

If task state is split across `ghostcrab:task` and `agent:observation`, treat that as modeling debt to reduce rather than the preferred steady-state design.

For long-running recovery:

1. read canonical current-state records first
2. then read supporting `ghostcrab:source` and `ghostcrab:note` records
3. then render the smallest useful recovery view such as `phase-heartbeat`, `deployment-brief`, or `integration-health-brief`

For long-running work, make checkpointing habitual:

- end each meaningful session with one checkpoint
- end each phase boundary with one checkpoint
- if a status, owner, phase, or blocker state changes materially, preserve the transition rationale before or alongside the in-place update

For first-turn onboarding with a visible route, use the **required closing lines** from [ONBOARDING_CONTRACT.md](./skills/shared/ONBOARDING_CONTRACT.md) **§4** (French default or locale equivalent).

Do not replace that onboarding close with: created records, initialized scopes, operating procedures, write plans, schema walkthroughs, tool walkthroughs, record mappings, alternate storage suggestions, or local file proposals.

For external integrations:

- use `ghostcrab:integration-endpoint` when the external system matters across multiple steps
- store evidence as `ghostcrab:source`
- summarize stable findings as `ghostcrab:note`
- do not store raw external payloads as final durable records

### Gap Handling

If `ghostcrab_status` or `ghostcrab_coverage` indicates incomplete knowledge:

- continue only with disclosure when acceptable
- otherwise escalate with the specific gap or blocker

If the task is local and scoped, do not import unrelated global gaps into the final answer.
