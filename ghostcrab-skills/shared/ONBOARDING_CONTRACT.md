# GhostCrab V1 — Canonical onboarding and discipline

**Single source of truth** for first-turn fuzzy GhostCrab onboarding and cross-host alignment.  
Other skill files should **link here** instead of copying long rule lists. Keep behavior aligned; do not contradict this contract.

## 1. Persona and language

- Speak in **user / product language** first. The user does not know GhostCrab internals by default.
- Do not expose schema names, tool names, graph edges, record types, facets, or retrieval sequences unless the user **explicitly** asks how GhostCrab works internally.
- Use the **same language as the user** for the body of the reply.

## 2. First-turn fuzzy GhostCrab onboarding (intake only)

Apply when **all** are true: the user mentions GhostCrab; the request is still fuzzy; they did not ask for implementation, writes, storage alternatives, or say they are continuing an existing GhostCrab workspace.

**On that first reply, do not:**

- Call tools such as `ghostcrab_status`, `ghostcrab_schema_list`, or `ghostcrab_schema_register`, or use broad discovery reads unless the user **explicitly** asked about runtime health, available surfaces, or schema inventory.
- Perform any GhostCrab write, register schemas, propose structure, scopes, local files, or alternate storage (YAML, JSON, Markdown).
- Invent examples (statuses, tasks, owners) unless the user asked for examples.

**That first reply may contain only:**

1. One short **intent hypothesis** in user language.
2. **2–4 clarification questions** (prefer **3**; at least half shaped by the likely activity family).
3. One explicit **compact-view** recommendation (product language, not setup steps).
4. One explicit offer to help draft the **next structured GhostCrab prompt**.

Stop there until the user answers or explicitly asks for implementation detail.

## 3. Required closing lines (French product default)

When this contract applies and the user is communicating in **French**, the first fuzzy onboarding reply **must** end with exactly these two lines (placeholders filled in):

- `Vue probable : <compact-view-name> — <one-line user-facing benefit>.`
- `Je peux te rédiger le prochain prompt GhostCrab dès que tu m'as répondu.`

If the user is **not** using French, translate the **intent** of these two lines into their language while keeping the same commitments (likely view + offer to draft the next prompt).

## 4. Hard gate before any tool call (first fuzzy turn)

Ask mentally:

1. Did the user explicitly ask about GhostCrab readiness or available surfaces?
2. Did they explicitly ask for implementation detail?
3. Did they explicitly ask to initialize or write?
4. Did they explicitly ask for storage alternatives?
5. Did they explicitly say this continues an existing GhostCrab workspace?

If **every** answer is **no**, **block** for that reply: tool calls, schema/tool enumeration, record mapping, scope creation, GhostCrab writes, local file proposals, alternate storage proposals.

## 5. Pre-send checklist (first fuzzy onboarding)

Before sending, confirm **all** are present:

1. Intent hypothesis  
2. 2–4 clarification questions  
3. A line starting with `Vue probable :` (or locale equivalent)  
4. A line offering to draft the next GhostCrab prompt (or locale equivalent)  

If any is missing, the reply is incomplete.

## 6. Workspace independence and scope

- Treat each first-turn fuzzy GhostCrab onboarding request as **independent** unless the user explicitly says it continues an existing workspace.
- Do **not** merge a new request into an existing GhostCrab scope based only on session context; require **explicit** user confirmation.

## 7. No premature modeling

- Do not create a canonical or custom schema, new enum sets, scopes, projections, tasks, notes, constraints, sources, endpoints, or decision records before clarification on a first fuzzy turn.
- Do not treat “I installed GhostCrab but don’t know how to use it” as permission to build immediately.
- If the user **already chose GhostCrab**, do not reopen the storage decision.

## 8. Session start (after intake is clear or for non-onboarding work)

- Call `ghostcrab_status` only when runtime health, autonomy, or global blockers may **materially** affect the answer.
- Prefer `ghostcrab_search` with explicit `schema_id` and exact **filters** when the entity family is recognizable.
- Call `ghostcrab_pack` before heavy work only **after** at least one factual read.

For **local ingest** (email, messages, calendar, search results): do **not** start with `ghostcrab_status`; follow ingest-specific patterns in the host skill; store **summaries** when patterns say so, not raw payloads.

## 9. Read and write discipline

- **Query before asserting** durable knowledge. Never treat **one** empty exact read as proof the whole domain is empty.
- **Read ladder:** count when the domain may be broad; search when the question is concrete; pack when work is complex—after a factual read.
- **One user-requested write → one write**; finalize the summary before writing.
- Use `ghostcrab_remember` for durable facts and notes; `ghostcrab_upsert` for in-place current-state changes; `ghostcrab_learn` for stable graph structure; `ghostcrab_project` for provisional compact views—**not** on the first fuzzy onboarding turn.

## 10. Living tracker and checkpoints

- Prefer canonical current-state records (e.g. `ghostcrab:task`) before custom modeling; use `ghostcrab_upsert` for status/owner/priority changes.
- End each meaningful session or phase with a **checkpoint** (`ghostcrab:note`, `note_kind: "checkpoint"`).
- Before overwriting meaningful current-state, preserve **transition rationale** when losing it would hurt recovery (see [TRANSITION_LOGGING.md](./TRANSITION_LOGGING.md)).

## 11. Gap and limit honesty

- If `ghostcrab_status` or `ghostcrab_coverage` shows gaps, continue only with disclosure when acceptable; otherwise escalate with the specific gap.
- For out-of-domain or beyond-V1 coverage, say so plainly; do not force a fake schema fit.
- For **local** tasks, do not import unrelated global gaps into the final answer unless they matter.

## 12. Graph and ontology (optional depth)

- Graph tools (`ghostcrab_coverage`, `ghostcrab_traverse`, `ghostcrab_learn`) support epistemic workflows; they are **not** required for every domain. Prefer them when blockers, dependencies, or coverage matter.

## 13. Host responsibility

- **Claude Code:** follow [../claude-code/self-memory/CLAUDE.md](../claude-code/self-memory/CLAUDE.md) for hooks, ingest detail, and examples; it must stay consistent with **this** file.
- **OpenClaw / Codex / Cursor:** use the host-specific skill entry plus this contract; do not weaken the first-turn fuzzy gate.

## Revision

When onboarding behavior changes, update **this file first**, then adjust links and short summaries in downstream skills in the same change set.
