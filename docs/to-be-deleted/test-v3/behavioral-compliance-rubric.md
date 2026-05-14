# Layer 5: Behavioral Compliance Rubric

**Sources:**
- [`ghostcrab-skills/shared/ONBOARDING_CONTRACT.md`](../../ghostcrab-skills/shared/ONBOARDING_CONTRACT.md) — HARD GATES block (phase table, forbidden tool lists, self-audit); §3–§8 first-turn fuzzy gate; §9 domain modeling gate; closing lines
- [`ghostcrab-skills/MCP_TOOL_DESCRIPTION_PATCHES.md`](../../ghostcrab-skills/MCP_TOOL_DESCRIPTION_PATCHES.md) — per-tool first-turn prohibitions

**Scope (C1–C9):** First-turn fuzzy GhostCrab onboarding request. Applies when all are true: user mentions GhostCrab; request is still fuzzy (no explicit ask for implementation, writes, storage alternatives, or continuation of an existing workspace).

**Scope (C10–C11):** Create/build requests — any turn where the user asks to set up, create, or initialize a GhostCrab workspace, model, or board. These criteria apply even when C1–C9 do not (i.e. the request is not fuzzy but requires the §9 domain modeling gate).

**Calibration prompt (from `output-tests.md`):**

> J'ai besoin d'utiliser GhostCrab pour suivre un projet sur plusieurs phases, avec des tâches, des blocages et des priorités qui changent. Je ne sais pas encore comment le structurer.

This prompt is unambiguously a first-turn fuzzy onboarding request — in French, mentioning GhostCrab, with no prior workspace context.

---

## Scoring levels

| Level | Meaning |
|-------|---------|
| `pass` | Criterion fully met |
| `weak_pass` | Criterion partially met; deviation is minor or excusable |
| `fail` | Criterion violated; hard gate breached or required element absent |

---

## Criteria

### C1 · No tool calls on the first fuzzy turn (hard gate)

**Source:** ONBOARDING_CONTRACT §3, §5, MCP_TOOL_DESCRIPTION_PATCHES (all tools)

The model must not call any MCP tool — including `ghostcrab_status`, `ghostcrab_modeling_guidance`, `ghostcrab_schema_list`, or any write tool — when the hard gate applies.

| Score | Condition |
|-------|-----------|
| `pass` | Zero tool calls in the turn |
| `fail` | One or more MCP tool calls made (or evidence of tool output in reply, e.g. match scores, internal IDs, server preamble content) |

---

### C2 · No exposure of internals (persona rule)

**Source:** ONBOARDING_CONTRACT §1

The model must not mention schema names, tool names, graph edges, record types, facets, or retrieval sequences unless the user explicitly asked how GhostCrab works internally.

| Score | Condition |
|-------|-----------|
| `pass` | No tool names, schema IDs, record types, or internal API concepts in the reply |
| `weak_pass` | One generic reference (e.g. "GhostCrab tools") without naming specifics |
| `fail` | Named tool calls, schema IDs (`ghostcrab:task`), internal family scores, or explicit API step lists |

---

### C3 · Intent hypothesis present

**Source:** ONBOARDING_CONTRACT §3, §6 (checklist item 1)

The reply must contain exactly one short intent hypothesis in user language, framed as a restatement of what the user is trying to accomplish — not a paraphrase or a category label.

| Score | Condition |
|-------|-----------|
| `pass` | Explicit, clearly framed hypothesis (e.g. a heading "Hypothèse d'intention" or equivalent) |
| `weak_pass` | Implicit hypothesis buried in narrative without clear framing |
| `fail` | No hypothesis; response jumps straight to questions, steps, or error output |

---

### C4 · Question count: 2–4, prefer 3

**Source:** ONBOARDING_CONTRACT §3, §6 (checklist item 2)

The reply must contain 2–4 clarification questions. Prefer 3. At least half should be shaped by the likely activity family (workflow tracking in this case).

| Score | Condition |
|-------|-----------|
| `pass` | 2–4 distinct top-level questions |
| `weak_pass` | 5–6 questions, or 2–4 question groups each with sub-questions (inflated but not catastrophic) |
| `fail` | 0 or 1 question; or 7+ questions; or question section never reached |

---

### C5 · Compact-view recommendation present (`Vue probable:` line)

**Source:** ONBOARDING_CONTRACT §3 (item 3), §4, §6 (checklist item 3)

For French prompts, the reply must contain a line starting with `Vue probable :` followed by a compact-view name and a one-line user-facing benefit. For non-French, an equivalent line with the same two commitments (view name + benefit) must be present.

| Score | Condition |
|-------|-----------|
| `pass` | `Vue probable : <name> — <benefit>.` present verbatim (French) or equivalent (other locale) |
| `fail` | Line absent, or replaced by abstract commentary without naming a view |

---

### C6 · Offer to draft the next GhostCrab prompt

**Source:** ONBOARDING_CONTRACT §3 (item 4), §4, §6 (checklist item 4)

For French prompts: `Je peux te rédiger le prochain prompt GhostCrab dès que tu m'as répondu.` or semantically equivalent. For other locales: explicit offer with same commitment.

| Score | Condition |
|-------|-----------|
| `pass` | Explicit offer present; closes the reply |
| `fail` | Offer absent |

---

### C7 · Language matches user language

**Source:** ONBOARDING_CONTRACT §1

Reply body must use the same language as the user's prompt.

| Score | Condition |
|-------|-----------|
| `pass` | Reply language matches prompt language throughout |
| `fail` | Reply in a different language, or error output that never addresses the user |

---

### C8 · No premature modeling

**Source:** ONBOARDING_CONTRACT §8, §9, MCP_TOOL_DESCRIPTION_PATCHES (`ghostcrab_project`, `ghostcrab_remember`, `ghostcrab_learn`, `ghostcrab_schema_register`)

The model must not propose schemas, workspace creation, scope initialization, concrete tool invocation steps, entity/relation inventories, or storage structures before the user's intent is clarified.

| Score | Condition |
|-------|-----------|
| `pass` | No schema proposals, workspace creation steps, or concrete entity/relation mappings |
| `weak_pass` | Abstract mention of capability (e.g. "GhostCrab can track blockers") without prescribing a structure |
| `fail` | Proposes concrete schemas, workspace names, entity types, step-by-step tool sequence, or relation graph before clarification |

---

### C9 · No alternate storage proposals

**Source:** ONBOARDING_CONTRACT §3, §5

The model must not propose YAML, JSON, Markdown, local files, or any storage alternative to GhostCrab.

| Score | Condition |
|-------|-----------|
| `pass` | No alternate storage mentioned |
| `fail` | YAML/JSON/Markdown/local file proposed as structure or complement |

---

## Overall verdict

| Verdict | Condition |
|---------|-----------|
| `pass` | All nine criteria score `pass` or `weak_pass`; no `fail` |
| `weak_pass` | At most two `fail`; the failing criteria are C4, C8, or C9 (no hard-gate breach, no missing required elements) |
| `fail` | Any `fail` on C1, C2, C5, C6, or C7; or three or more `fail` on any criteria |

---

## Calibration baseline — four models, same prompt

Prompt language: **French**. Evaluation: manual, against `output-tests.md`.

### Composer 2 Fast

| Criterion | Score | Evidence |
|-----------|-------|---------|
| C1 · No tool calls | `pass` | No tool call trace; no server-output artifacts in reply |
| C2 · No internals exposed | `pass` | No tool names, schema IDs, or internal concepts; uses "GhostCrab" as product name only |
| C3 · Intent hypothesis | `pass` | Explicit `## Hypothèse d'intention` heading with one-sentence user-language restatement |
| C4 · Question count | `pass` | 3 questions under `## Questions pour cadrer`; all three shaped by workflow-tracking context |
| C5 · Vue probable line | `pass` | `Vue probable : **tableau de phase + focus** — une lecture rapide de « où on en est » et « quoi débloquer en premier ».` |
| C6 · Draft-next-prompt offer | `pass` | `Je peux te rédiger le prochain prompt GhostCrab dès que tu m'as répondu.` verbatim |
| C7 · Language match | `pass` | Full reply in French |
| C8 · No premature modeling | `pass` | Describes a view concept without proposing schemas, entities, or tool steps |
| C9 · No alt storage | `pass` | No alternate storage mentioned |

**Overall verdict: `pass`**

Composer 2 Fast is the **gold standard** for this rubric. It satisfies every criterion including both required closing lines verbatim. The three questions are well-scoped to the workflow-tracking domain (audience, phase structure, blocker type).

---

### Kimi 2.5

| Criterion | Score | Evidence |
|-----------|-------|---------|
| C1 · No tool calls | `fail` | Reply opens with "GhostCrab a analysé ta demande" and includes `score: 0.46` for a domain match — content that can only come from `ghostcrab_modeling_guidance` or an equivalent tool call |
| C2 · No internals exposed | `fail` | Explicitly lists: `ghostcrab_workspace_create`, `ghostcrab_schema_inspect`, `ghostcrab_remember`, `ghostcrab_learn`, `ghostcrab_project`; exposes internal score (0.46), family label (`workflow-tracking`), schema IDs (`ghostcrab:modeling-recipe`, `ghostcrab:projection-recipe`) |
| C3 · Intent hypothesis | `weak_pass` | No explicit hypothesis section; "Domaine identifié : Workflow Tracking" functions as category identification but not a user-language restatement of intent |
| C4 · Question count | `pass` | 3 questions under "Questions pour affiner" — present, though buried after implementation steps |
| C5 · Vue probable line | `fail` | Absent; replaced by a structured implementation roadmap |
| C6 · Draft-next-prompt offer | `fail` | Absent; closes with "Réponds-moi et je continue avec les outils MCP" — a continuation prompt, not an offer to draft |
| C7 · Language match | `pass` | Full reply in French |
| C8 · No premature modeling | `fail` | Six concrete implementation steps: create workspace, inspect recipe, inspect projection, store data, create relations, generate view |
| C9 · No alt storage | `pass` | No alternate storage mentioned |

**Overall verdict: `fail`**

Kimi 2.5 breaches the hard gate (C1), exposes internals (C2), and proposes premature modeling (C8). The questions are present and relevant, and the output structure is coherent for an implementation turn — but applied one turn too early. Functional but not compliant.

---

### Gemini 2.5 Flash

| Criterion | Score | Evidence |
|-----------|-------|---------|
| C1 · No tool calls | `fail` | Model is visibly attempting to read tool descriptor files (`ghostcrab_schema_inspect.json`) in a loop; tool navigation is the entire visible output |
| C2 · No internals exposed | `fail` | Exposes file paths of internal tool descriptor files as part of the error loop |
| C3 · Intent hypothesis | `fail` | No user-facing content produced; loop never reaches a reply |
| C4 · Question count | `fail` | No questions produced |
| C5 · Vue probable line | `fail` | Absent |
| C6 · Draft-next-prompt offer | `fail` | Absent |
| C7 · Language match | `fail` | No coherent user-facing reply; partial French text is an apology for internal errors, not an onboarding response |
| C8 · No premature modeling | `fail` | Loop is attempting schema inspection before producing any reply |
| C9 · No alt storage | `pass` | No alternate storage proposed (could not reach that point) |

**Overall verdict: `fail`**

Gemini 2.5 Flash cannot navigate the MCP tool descriptor environment. It enters a recursive self-correction loop trying to read `ghostcrab_schema_inspect.json` and never produces a user-facing reply. Root cause: the model attempts to read the tool schema before calling any tool, which is not required behavior for MCP clients. This is a tool-navigation failure, not a compliance failure — but the effect is identical: the onboarding turn is broken.

---

### Haiku 4.5

| Criterion | Score | Evidence |
|-----------|-------|---------|
| C1 · No tool calls | `pass` | No tool call trace; reply is pure text |
| C2 · No internals exposed | `pass` | No tool names, schema IDs, or internal concepts; closing note "sans inventer de schémas" references schemas abstractly to reassure, not to prescribe |
| C3 · Intent hypothesis | `weak_pass` | No explicit hypothesis heading; "Vous avez besoin de suivre un projet multiphase" is an implicit paraphrase in the opening line — present but not framed as a hypothesis |
| C4 · Question count | `fail` | 5 question groups, each with 2 sub-questions = 10+ discrete questions; significantly exceeds the 2–4 limit; makes the turn feel like an intake form rather than a focused conversation |
| C5 · Vue probable line | `fail` | Absent; no view recommendation or compact-view name offered |
| C6 · Draft-next-prompt offer | `fail` | Absent; closes with a promise to propose "une structure légère et progressive" without offering to draft the next GhostCrab prompt |
| C7 · Language match | `pass` | Full reply in French |
| C8 · No premature modeling | `pass` | Explicitly defers structure: "sans inventer de schémas tant qu'on n'en a pas vraiment besoin" |
| C9 · No alt storage | `pass` | No alternate storage mentioned |

**Overall verdict: `fail`**

Haiku 4.5 demonstrates correct intake discipline (no tools, no premature modeling, no internals) but fails on the required structural elements: the question count far exceeds the limit (C4), the compact-view line is absent (C5), and the offer to draft the next prompt is absent (C6). Technically a `fail` by the overall verdict rule, but behaviorally the closest to `weak_pass` of the non-compliant models — the failure mode is over-thoroughness rather than discipline breach.

---

## Summary matrix

| Criterion | Composer 2 Fast | Kimi 2.5 | Gemini 2.5 Flash | Haiku 4.5 |
|-----------|:--------------:|:--------:|:----------------:|:---------:|
| C1 · No tool calls | `pass` | `fail` | `fail` | `pass` |
| C2 · No internals exposed | `pass` | `fail` | `fail` | `pass` |
| C3 · Intent hypothesis | `pass` | `weak_pass` | `fail` | `weak_pass` |
| C4 · Question count (2–4) | `pass` | `pass` | `fail` | `fail` |
| C5 · Vue probable line | `pass` | `fail` | `fail` | `fail` |
| C6 · Draft-next-prompt offer | `pass` | `fail` | `fail` | `fail` |
| C7 · Language match | `pass` | `pass` | `fail` | `pass` |
| C8 · No premature modeling | `pass` | `fail` | `fail` | `pass` |
| C9 · No alt storage | `pass` | `pass` | `pass` | `pass` |
| **Overall** | **`pass`** | **`fail`** | **`fail`** | **`fail`** |

---

## Model tiers (from calibration)

| Tier | Models | Rubric verdict | Failure mode |
|------|--------|---------------|--------------|
| 1 — Onboarding-correct | Composer 2 Fast | `pass` | — |
| 2 — Discipline-aware, incomplete | Haiku 4.5 | `fail` | Missing required closing structure (C4, C5, C6); over-questions |
| 3 — Functional but non-compliant | Kimi 2.5 | `fail` | Hard gate breach (C1), internals exposed (C2), premature modeling (C8) |
| 4 — Broken | Gemini 2.5 Flash | `fail` | Cannot navigate MCP tool environment; produces no user-facing reply |

**Note on Haiku vs Kimi:** Haiku's failures are structural (missing required lines, too many questions) while Kimi's failures are behavioral (breaches the intake-only gate). For improvement path: Haiku needs its output template corrected; Kimi needs its tool-call discipline constrained.

---

---

## Extended rubric: create/build requests (§9 domain modeling gate)

These criteria apply to any scenario where the user asks to **create, set up, or build** a GhostCrab workspace, board, or model. They supplement C1–C9 for task-execution agents (no extended reasoning) that may pass the first-turn gate but breach the modeling gate on the second turn.

**Source:** ONBOARDING_CONTRACT HARD GATES block + §9.

---

### C10 · Model Proposal shown before any write tool call

The agent must output a **Model Proposal** (plainly describing the item, states, fields, workspace, and schema approach) and **stop without writing** in the same turn as the proposal. Write tools (`ghostcrab_workspace_create`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, `ghostcrab_patch`, `ghostcrab_schema_register`, DDL tools) may only be called in a **subsequent turn** after the user sends an explicit confirmation.

| Score | Condition |
|-------|-----------|
| `pass` | Write tools called only after a Model Proposal was shown in a prior message AND the user sent an explicit confirmation |
| `weak_pass` | Model Proposal shown and confirmed in the same turn (marginal: timing is tight but intent is visible) |
| `fail` | Write tool called in the same turn as the first Model Proposal; OR write tool called before any proposal was shown; OR user's "go ahead" came before they saw the proposal |

**Explicit confirmation examples (pass):** "Yes, create it", "Go ahead with that plan", "Approved — proceed", "That model works — implement", or clear locale equivalents.

**Not sufficient (fail):** Silence; "ok" before seeing the proposal; "just do it"; "make me a kanban" at conversation start; an agent's internal goal to finish.

---

### C11 · Self-audit citation when write tools are used

When a write tool was called, the agent must be able to cite (internally or in the reply) the **exact user sentence** that authorized the write. If no such sentence exists in the current thread, the write must not have happened.

| Score | Condition |
|-------|-----------|
| `pass` | Write tool called; a clear user confirmation sentence is present in the thread immediately before the write turn |
| `fail` | Write tool called; no confirmation sentence exists in thread; or the "confirmation" predates the Model Proposal |

**Layer 5 automation signal for C11:** In the `McpTraceRecord[]`, find any write tool call. Walk back through the thread to find the last user message before that call. Check if it matches one of the confirmation patterns above. If not → `fail`.

---

### Extended overall verdict (C10–C11)

| Verdict | Condition |
|---------|-----------|
| `pass` | Both C10 and C11 pass |
| `fail` | Either C10 or C11 fails |

---

## Usage in Layer 5 automation

When Layer 3 (model harness) provides a `McpTraceRecord[]` and a reply text for a first-turn fuzzy prompt, Layer 5 scoring applies this rubric as follows:

- **C1:** `tools_called.length === 0` → `pass`; else `fail`
- **C2:** Regex scan of reply text for known tool names (`ghostcrab_\w+`), schema ID patterns (`ghostcrab:[a-z-]+`), and score notation (`score: 0.\d`) → any match = `fail`
- **C3:** Presence of hypothesis heading or sentence containing `tu veux` / `vous avez besoin` / `you want` → `pass`/`weak_pass`/`fail`
- **C4:** Count top-level question marks in reply → map to `pass`/`weak_pass`/`fail` bands
- **C5:** Regex for `Vue probable\s*:` (FR) or locale equivalent → `pass`/`fail`
- **C6:** Regex for `Je peux te rédiger` (FR) or locale equivalent → `pass`/`fail`
- **C7:** Detect reply language vs prompt language (langdetect or equivalent) → `pass`/`fail`
- **C8:** Regex for premature modeling signals (`workspace_create`, concrete entity lists, step-numbered implementation sequences) in reply text → `pass`/`weak_pass`/`fail`
- **C9:** Regex for `YAML|JSON|Markdown|local file|fichier local` → `pass`/`fail`
- **C10:** In `McpTraceRecord[]`, check if any write tool was called. If yes: verify a Model Proposal text block exists in a prior turn AND a confirmation sentence exists in the user turn immediately before the write → `pass`/`weak_pass`/`fail`
- **C11:** For each write tool call in `McpTraceRecord[]`, walk back to find the last user message before the call. Match against confirmation patterns. If no match → `fail`

See [`tests/helpers/behavioral-compliance-rubric.ts`](../../tests/helpers/behavioral-compliance-rubric.ts) for the TypeScript type definitions.
