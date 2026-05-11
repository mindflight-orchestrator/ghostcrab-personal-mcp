# n8n Community Relevance Review

## 1. Purpose

This review evaluates the n8n GhostCrab draft as community-facing material for inviting n8n users to explore **MCP GhostCrab Personal SQLite**.

The review is intentionally not a live test. It checks whether the document describes a relevant, accurate, and honest integration path.

## 2. Documents Reviewed

- `sop_integration_n8n_ghostcrab_mindbrain.md`
- `N8N_GHOSTCRAB_PERSONAL_RECIPE.md`

## 3. Executive Assessment

n8n is different from most other folders in this repository. It is not primarily an agent framework. It is a workflow automation platform. That means the integration should not be presented as an agent memory skill pack. It should be presented as a workflow memory and context persistence pattern.

GhostCrab Personal can be relevant to n8n, but the public message must be careful because GhostCrab Personal is primarily a local MCP server using `stdio`, while n8n workflows more naturally interact with HTTP APIs, webhook endpoints, databases, and nodes.

Best community positioning:

> n8n automates workflows. GhostCrab Personal can act as a local SQLite memory sidecar for workflow context, decisions, enrichment results, and cross-run state when connected through an MCP-capable bridge or a future n8n node.

## 4. Target Shape

n8n should be treated as a **workflow automation environment**, not a multi-agent runtime.

The first public artifact should not be a skill for an agent. It should be a concise integration note or recipe explaining:

- what GhostCrab Personal stores
- where it fits in an n8n workflow
- what connection layer is required
- what should not be promised yet

The most honest current framing is:

- GhostCrab Personal is local and SQLite-backed.
- n8n can benefit from the memory model.
- Direct n8n integration may require an HTTP bridge, custom node, or external MCP-capable runner.
- A future n8n node could make this first-class.

## 5. Community Fit

n8n users care about:

- workflow state
- deduplication
- enrichment memory
- CRM/event context
- human-in-the-loop automation
- retry and audit trails
- cross-workflow coordination

GhostCrab Personal can be compelling if framed as a structured memory store that gives workflows more continuity.

The pitch should avoid agent-framework language such as “multi-agent orchestration” unless the workflow actually invokes agents.

## 6. Main Corrections Needed

### 6.1 Do not imply direct MCP support if not present

If n8n cannot directly call a local `stdio` MCP server in the documented flow, the guide should say so plainly.

Acceptable wording:

> GhostCrab Personal exposes MCP tools locally. n8n workflows may need an MCP-to-HTTP bridge, a custom node, or an external runner to call those tools.

### 6.2 Make the artifact a recipe, not a skill pack

Because n8n does not naturally consume Codex-style skills, the folder should probably contain:

- `N8N_GHOSTCRAB_PERSONAL_RECIPE.md`
- or `n8n_COMMUNITY_RELEVANCE_REVIEW.md` plus a future implementation note

The current SOP can remain internal strategy.

### 6.3 Replace backend-heavy language

PostgreSQL, server deployment, and enterprise backend details should be reduced. The first community message should be local SQLite.

Use:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then explain that a bridge may be required for n8n.

### 6.4 Map workflow actions to actual tools

Potential n8n actions should map to:

- `ghostcrab_remember`
- `ghostcrab_search`
- `ghostcrab_upsert`
- `ghostcrab_count`
- `ghostcrab_learn`
- `ghostcrab_pack`

Do not invent HTTP endpoints unless the repository actually implements them.

## 7. Document Review

### `sop_integration_n8n_ghostcrab_mindbrain.md`

What works:

- identifies workflow automation as a plausible GhostCrab use case
- likely contains useful thinking around persistence, enrichment, and memory
- can become a practical recipe for CRM, inbox, webhook, or task automation scenarios

What needs correction:

- distinguish n8n workflow state from agent memory
- avoid implying direct local MCP `stdio` support inside n8n
- reduce PostgreSQL and server architecture language
- use actual GhostCrab Personal tools
- add a connection requirement section

Recommended rewrite direction:

> Use GhostCrab Personal as a local memory layer for n8n workflows when a workflow needs durable context across runs. Because GhostCrab Personal exposes MCP tools, n8n needs an MCP-capable bridge, custom node, or external runner to call those tools.

## 8. Tool Mapping

| n8n workflow need | GhostCrab Personal tool |
| --- | --- |
| Store enrichment result | `ghostcrab_remember` |
| Search prior workflow context | `ghostcrab_search` |
| Maintain current record state | `ghostcrab_upsert` |
| Count items by status or category | `ghostcrab_count` |
| Link records, events, or dependencies | `ghostcrab_learn` |
| Load compact workflow context | `ghostcrab_pack` |
| Inspect available schemas | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: Lead enrichment memory

An n8n workflow enriches a lead, stores the result in GhostCrab with `ghostcrab_remember`, and avoids repeating the enrichment on later runs by searching with `ghostcrab_search`.

Connection note: this requires an MCP-capable bridge or external runner.

### Demo 2: Cross-workflow state

One workflow updates a customer or task state with `ghostcrab_upsert`. Another workflow retrieves that state before deciding what to do.

### Demo 3: Audit context

A workflow stores a durable note when it makes a routing decision, then later retrieves the history for human review.

## 10. PRO Mention

Suggested wording:

> This recipe focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO - mindBrain Pro is the PostgreSQL-based option for teams that later need centralized deployment.

Keep this note short.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Workflow automation environment — fundamentally NOT an agent framework. The standard JTBD lifecycle (Before/Read/Write/After/Recovery for an AI agent) does not apply cleanly to n8n.

**Adapted JTBD**: "I am an n8n workflow node executing inside a trigger-fire-action cycle. I need to read durable cross-run context before making a routing decision, and write structured context after completing a workflow action — so that future workflow runs do not repeat work unnecessarily."

### n8n-Specific Lifecycle Mapping

| Moment | n8n equivalent | GhostCrab tool | Present in current review? |
|---|---|---|---|
| Trigger fires | Workflow starts | ghostcrab_search (deduplication check) or ghostcrab_pack (load prior workflow context) | ghostcrab_search mentioned — good; ghostcrab_pack not mapped to n8n trigger |
| Node executes | Processing step | ghostcrab_upsert (update record state) or ghostcrab_remember (store enrichment result) | Tool mapping covers this — good |
| Workflow completes | End of run | ghostcrab_remember (durable audit note) | Tool mapping — good |
| Retry / re-run | Next trigger | ghostcrab_search (has this record been processed?) | Demo 1 covers deduplication — good |
| Bridge failure | HTTP call fails | — | NOT addressed |

### Critical Gap: The Standard Agent Lifecycle Does Not Apply

The review correctly identifies n8n as a workflow automation environment, but the JTBD analysis must go further: **n8n workflows do not have a "Before" session concept**. Each workflow run is stateless by default. GhostCrab adds cross-run state, but the mechanism is:

1. Workflow fires → node calls GhostCrab via HTTP bridge → reads or writes → workflow continues

There is no "agent loads context at session start" because there is no session. The review should explicitly frame this difference so developers do not apply agent-framework patterns to n8n.

### Critical Gap: Bridge Mechanism Not Specified

The review says "a bridge may be required" but never says what the bridge is. A developer cannot proceed without knowing whether to use:

- an n8n HTTP Request node pointing to a local GhostCrab HTTP endpoint (requires GhostCrab to serve HTTP, which Personal does not do by default)
- a custom n8n node wrapping MCP calls
- an external runner (e.g. a Node.js script that calls GhostCrab over stdio and exposes an HTTP interface)

Until the bridge is documented, this review should explicitly state: **"Direct n8n → GhostCrab Personal integration is not currently documented. The connection path must be solved before any tool-level guidance applies."**

### `remember` vs `upsert` for n8n

For n8n the distinction maps to:
- `ghostcrab_remember`: enrichment result, routing decision, processed event ID — immutable anchors for deduplication
- `ghostcrab_upsert`: current state of a tracked entity (lead, ticket, order) — mutable record

### Failure Mode Coverage

The most critical failure mode — bridge unavailability — is not addressed. n8n workflows should be designed to fail gracefully when GhostCrab is unreachable.

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 4/5 | Workflow memory, deduplication, enrichment, and cross-run state are now framed directly for n8n. |
| Framework alignment | 4/5 | The public artifact is a recipe, not an agent skill, and uses trigger-fire-action lifecycle language. |
| GhostCrab Personal accuracy | 4/5 | The recipe centers `@mindflight/ghostcrab-personal-mcp`, `gcp brain up`, SQLite, and stdio default. |
| Tool-name accuracy | 4/5 | The recipe maps actual `ghostcrab_*` tools and avoids invented endpoints. |
| Agent behavioral clarity | 4/5 | The adapted n8n lifecycle, bridge requirement, remember/upsert rule, and failure modes are explicit. |
| Community readiness | 4/5 | Ready as an honest recipe, with direct integration still dependent on bridge/custom node choice. |

Overall readiness: **Community-ready recipe with explicit bridge caveat.**

## 12. Recommended Next Step

Do not publish this as an agent skill. Rewrite it as an n8n recipe with an explicit connection caveat:

1. GhostCrab Personal runs locally with SQLite.
2. n8n needs a bridge, custom node, or external MCP runner.
3. The first workflow stores and retrieves enrichment memory.
4. PRO PostgreSQL is mentioned only as a later team deployment path.
