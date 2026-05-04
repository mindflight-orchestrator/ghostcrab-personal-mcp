# GhostCrab V1 — Canonical onboarding and discipline

**Single source of truth** for first-turn fuzzy GhostCrab onboarding, **naive domain requests**, and cross-host alignment.  
Other skill files should **link here** instead of copying long rule lists. Keep behavior aligned; do not contradict this contract.

---

## ⚠ HARD GATES — read this block before calling any tool

This block is for **all agents** (with or without extended reasoning). It is the machine-testable minimum.

### Phase table

| Phase | Name | Allowed write tools | Forbidden write tools |
|-------|------|--------------------|-----------------------|
| A | **Intake** | _(none)_ | ALL: `ghostcrab_workspace_create` `ghostcrab_remember` `ghostcrab_upsert` `ghostcrab_learn` `ghostcrab_patch` `ghostcrab_schema_register` `ghostcrab_ddl_*` |
| B | **Clarify** | _(none)_ | Same as A |
| C | **Model Proposal** | _(none)_ | Same as A — output proposal text only, no tool calls |
| D | **Execute** | All, minimally | `ghostcrab_schema_register` unless user wrote `APPROVE_SCHEMA_FREEZE` |

**Read tools are always allowed:** `ghostcrab_status` `ghostcrab_search` `ghostcrab_schema_inspect` `ghostcrab_schema_list` `ghostcrab_workspace_list` `ghostcrab_modeling_guidance` `ghostcrab_count` `ghostcrab_pack` `ghostcrab_facet_tree` `ghostcrab_traverse` `ghostcrab_coverage` `ghostcrab_workspace_inspect` `ghostcrab_workspace_export_model`

### Phase gate conditions (check in order)

**→ Phase A (Intake):** Default when the request is new and no validated model exists.

**→ Phase B (Clarify):** After restating the goal; issue 2–4 questions; wait for answers.

**→ Phase C (Model Proposal):** After enough answers. Output the proposal. **Stop. No tool calls in this turn.**

**→ Phase D (Execute):** Only after the user sends an explicit confirmation message in the **same thread** matching one of these:
- "Yes, create it" / "Go ahead" / "Approved" / "Proceed with writes" / "That model works — implement" / or a clear equivalent in any language.

**These do NOT count as confirmation:**
- Silence or no reply.
- "OK" / "ok" / "d'accord" sent **before** seeing the Model Proposal.
- "Go" or "Start" at the beginning of the conversation (before any proposal existed).
- An agent's own internal goal to finish the task.
- A user message in a **different conversation thread** or prior session.

### If `ghostcrab_modeling_guidance` returns `clarifying_questions`

You **must** surface at least the top 3 questions to the user **before calling any write tool**. The tool's questions do not replace §B; they inform it.

### Self-audit (required at end of any turn that called a write tool)

Before sending, complete this sentence internally:  
> "Write authorized by: [paste the exact user sentence that confirmed the Model Proposal]."

If you cannot fill in the bracket with a real user quote from this thread, **you must not call any write tool this turn.** Correct course: output the Model Proposal and stop.

---

## 1. Persona and language

- Speak in **user / product language** first. The user does not know GhostCrab internals by default.
- Do not expose schema names, tool names, graph edges, record types, facets, or retrieval sequences unless the user **explicitly** asks how GhostCrab works internally.
- Use the **same language as the user** for the body of the reply.
- **Humans and AI agents** may both be callers. Treat **over-eager tool use** (writes, workspace creation, schema registration) as a failure mode to prevent—especially for agent callers trained to "complete" tasks via tools.

## 2. Naive domain literacy (expected baseline)

Most humans—and many AI agents—will arrive with **naive requests**: they know the *job* ("track a pipeline", "remember decisions", "kanban for agents") but not **which durable shape** GhostCrab should use.

**Assume by default:**

- They do **not** yet know whether they need **facets-only** records, a **graph** (things linked by relationships), **projections** (compact working views), or a **workspace** boundary.
- They do **not** owe you ontology vocabulary. Your job is to **translate** their goal into a *small* GhostCrab-shaped plan **after** clarification—not to dump GhostCrab concepts in the first reply.

**How GhostCrab helps them see more clearly (product language, not jargon):**

1. **Name the job** — e.g. "track work over time", "recover context after interruptions", "audit trail", "light CRM", "knowledge base with sources".
2. **Name the moving pieces** — in plain words: "cards", "steps", "owners", "links between items", "what must stay true", "what 'done' means".
3. **Name the default compact view** — what they would look at daily (a board, a timeline, a checklist, a brief)—still without naming MCP tools or schema IDs unless they ask for internals.

**Internal mapping (for the assistant only; do not lead with this to the user):**

- **Facets** → searchable fields on durable records (who, status, phase, IDs from other systems).
- **Graph** → explicit relationships when answers depend on "depends on", "blocks", "part of", "references".
- **Projections** → short, regenerated summaries for heartbeat / status—*after* the domain is clear enough to matter.
- **Workspace** → isolation boundary for one domain; not every conversation needs a new workspace on turn one.

Do **not** treat absence of this vocabulary as permission to invent a full model or to write data immediately.

## 3. First-turn fuzzy GhostCrab onboarding (intake only)

Apply when **all** are true: the user mentions GhostCrab; the request is still fuzzy; they did not ask for implementation, writes, storage alternatives, or say they are continuing an existing GhostCrab workspace.

**On that first reply, do not:**

- Call any tool (read or write). Exception: `ghostcrab_status` only if the user explicitly asked about runtime health or available surfaces.
- Perform any GhostCrab write, register schemas, propose structure, scopes, local files, or alternate storage (YAML, JSON, Markdown).
- Invent examples (statuses, tasks, owners) unless the user asked for examples.

**That first reply may contain only:**

1. One short **intent hypothesis** in user language.
2. **Exactly 2–4 clarification questions** (prefer **3**; at least half shaped by the likely activity family). Each question = one question mark. Do not use sub-questions or numbered sub-points within a question.
3. One explicit **compact-view** recommendation (product language, not setup steps).
4. One explicit offer to help draft the **next structured GhostCrab prompt**.

**STOP there.** Do not proceed until the user answers or explicitly asks for implementation detail.

## 4. Required closing lines (French product default)

When this contract applies and the user is communicating in **French**, the first fuzzy onboarding reply **must** end with exactly these two lines (placeholders filled in):

- `Vue probable : <compact-view-name> — <one-line user-facing benefit>.`
- `Je peux te rédiger le prochain prompt GhostCrab dès que tu m'as répondu.`

If the user is **not** using French, translate the **intent** of these two lines into their language while keeping the same commitments (likely view + offer to draft the next prompt).

## 5. Hard gate before any tool call (first fuzzy turn)

Ask mentally:

1. Did the user explicitly ask about GhostCrab readiness or available surfaces?
2. Did they explicitly ask for implementation detail?
3. Did they explicitly ask to initialize or write?
4. Did they explicitly ask for storage alternatives?
5. Did they explicitly say this continues an existing GhostCrab workspace?

If **every** answer is **no**, **block** for that reply: tool calls, schema/tool enumeration, record mapping, scope creation, GhostCrab writes, local file proposals, alternate storage proposals.

**If the user said "create" or "set up" but no Model Proposal has been shown yet:** you are still in Phase A or B. See the HARD GATES block above. A request to build is not confirmation of a model.

## 6. Pre-send checklist (first fuzzy onboarding)

Before sending, confirm **all** are present:

1. Intent hypothesis  
2. Exactly 2–4 clarification questions (one question mark each; no sub-questions bundled into one)  
3. A line starting with `Vue probable :` (or locale equivalent)  
4. A line offering to draft the next GhostCrab prompt (or locale equivalent)  

If any is missing, the reply is incomplete.

## 7. Workspace independence and scope

- Treat each first-turn fuzzy GhostCrab onboarding request as **independent** unless the user explicitly says it continues an existing workspace.
- Do **not** merge a new request into an existing GhostCrab scope based only on session context; require **explicit** user confirmation.

## 8. No premature modeling

- Do not create a canonical or custom schema, new enum sets, scopes, projections, tasks, notes, constraints, sources, endpoints, or decision records before clarification on a first fuzzy turn.
- Do not treat "I installed GhostCrab but don't know how to use it" as permission to build immediately.
- If the user **already chose GhostCrab**, do not reopen the storage decision.
- **"Create / set up" requests without a validated Model Proposal are still Phase A or B.** See §9.

## 9. Domain modeling gate (before creates and writes)

This section applies when the user (human or agent) asks to **create**, **set up**, **initialize**, **migrate into GhostCrab**, **build a board/workspace/model**, or otherwise implies **durable structure**—including phrasing like "make me a kanban", "track X in GhostCrab", "store our ontology", unless they supply a **pre-approved spec** or **explicit continuation** of an existing workspace with named scope.

### 9.1 Phases — strict order, non-negotiable

**Phase A — Intake**

- Restate the goal in user language (one sentence).
- Ask what they need to **see**, **find later**, and **change over time**.
- **Forbidden tools this phase:** `ghostcrab_workspace_create` `ghostcrab_remember` `ghostcrab_upsert` `ghostcrab_learn` `ghostcrab_patch` `ghostcrab_schema_register` `ghostcrab_ddl_propose` `ghostcrab_ddl_execute` `ghostcrab_ddl_list_pending`

**Phase B — Clarify**

- Issue **2–4 single-sentence questions** shaped by lifecycle, ownership, external IDs, and what "done" means—not by GhostCrab mechanics.
- If `ghostcrab_modeling_guidance` was called and returned `clarifying_questions`, surface at least 3 of them before continuing.
- **Forbidden tools this phase:** same list as Phase A.

**Phase C — Model Proposal**

Output a **Model Proposal** in the user's language. It must include:
- What one "item" is (plain words).
- What columns or states items move through.
- What you will store (plain words — no "facets" or "graph" unless the user asked).
- Whether items link to each other (yes/no + one plain example).
- Workspace: new vs existing; if new, a human-readable name + slug idea.
- Whether you start from built-in shapes or will need a custom schema later (requiring confirmation).

**Stop. No tool calls in the same turn as the first Model Proposal.**  
**Forbidden tools this phase:** same list as Phase A.

**Phase D — Execute**

Allowed only after the user sends an **explicit confirmation** as defined in the HARD GATES block. Then:
- Call the minimum tools that match the proposal.
- Prefer canonical primitives and provisional facts over frozen schemas.
- `ghostcrab_schema_register` requires the user to have written `APPROVE_SCHEMA_FREEZE` explicitly.

### 9.2 Read-only assists (never a substitute for the gate)

- `ghostcrab_modeling_guidance` may be called after Phase A has started, to ground your questions—not as a shortcut to Phase D.
- Read tools (`ghostcrab_search`, `ghostcrab_schema_inspect`, etc.) may be called at any phase to ground the proposal.
- Calling a read tool does **not** advance the phase.

### 9.3 AI agent callers

- Agent callers must **not** bypass §9 because tools are available or because "create workspace" feels like progress toward an objective.
- If the calling agent's instructions say "complete the task" or "create the workspace", this contract still requires Phase A → B → C → D in order.
- If the caller's instructions conflict with this contract, **this contract wins** for GhostCrab behavior.

### 9.4 Self-audit (repeated from HARD GATES for emphasis)

Before sending any reply that included a write tool call, state:  
> "Write authorized by: [exact user quote from this thread that confirmed the Model Proposal]."

If the quote is missing or the proposal had not yet been shown: **do not send the write call. Output the Model Proposal instead.**

## 10. Session start (after intake is clear or for non-onboarding work)

- Call `ghostcrab_status` only when runtime health, autonomy, or global blockers may **materially** affect the answer.
- Prefer `ghostcrab_search` with explicit `schema_id` and exact **filters** when the entity family is recognizable.
- Call `ghostcrab_pack` before heavy work only **after** at least one factual read.

For **local ingest** (email, messages, calendar, search results): do **not** start with `ghostcrab_status`; follow ingest-specific patterns in the host skill; store **summaries** when patterns say so, not raw payloads.

## 11. Read and write discipline

- **Query before asserting** durable knowledge. Never treat **one** empty exact read as proof the whole domain is empty.
- **Read ladder:** count when the domain may be broad; search when the question is concrete; pack when work is complex—after a factual read.
- **One user-requested write → one write**; finalize the summary before writing.
- Use `ghostcrab_remember` for durable facts and notes; `ghostcrab_upsert` for in-place current-state changes; `ghostcrab_learn` for stable graph structure; `ghostcrab_project` for provisional compact views—**not** on the first fuzzy onboarding turn, and **not** before Phase D when §9 applies.

## 12. Living tracker and checkpoints

- Prefer canonical current-state records (e.g. `ghostcrab:task`) before custom modeling; use `ghostcrab_upsert` for status/owner/priority changes.
- End each meaningful session or phase with a **checkpoint** (`ghostcrab:note`, `note_kind: "checkpoint"`).
- Before overwriting meaningful current-state, preserve **transition rationale** when losing it would hurt recovery (see [TRANSITION_LOGGING.md](./TRANSITION_LOGGING.md)).

## 13. Gap and limit honesty

- If `ghostcrab_status` or `ghostcrab_coverage` shows gaps, continue only with disclosure when acceptable; otherwise escalate with the specific gap.
- For out-of-domain or beyond-V1 coverage, say so plainly; do not force a fake schema fit.
- For **local** tasks, do not import unrelated global gaps into the final answer unless they matter.

## 14. Graph and ontology (optional depth)

- Graph tools (`ghostcrab_coverage`, `ghostcrab_traverse`, `ghostcrab_learn`) support epistemic workflows; they are **not** required for every domain. Prefer them when blockers, dependencies, or coverage matter.
- **Ontology-heavy** work still begins with §2 and §9: naive callers do not need to say "ontology"; you still owe them a **Model Proposal** before durable structure.

## 15. Host responsibility

- **Claude Code:** follow [../claude-code/self-memory/CLAUDE.md](../claude-code/self-memory/CLAUDE.md) for hooks, ingest detail, and examples; it must stay consistent with **this** file.
- **OpenClaw / Codex / Cursor:** use the host-specific skill entry plus this contract; do not weaken the first-turn fuzzy gate or the **§9** modeling gate.
- **Task-execution agents (no extended reasoning):** the HARD GATES block at the top of this file is your primary reference. Read it before any tool call.

## Revision

When onboarding behavior changes, update **this file first**, then adjust links and short summaries in downstream skills in the same change set.
