# Hermes-Agent Community Relevance Review

## 1. Purpose

This review evaluates the Hermes-Agent GhostCrab drafts as community-facing material for inviting Hermes-Agent or MCP-compatible agent users to try **MCP GhostCrab Personal SQLite**.

The review focuses on relevance, API accuracy, and messaging. It does not require running Hermes-Agent or GhostCrab live.

## 2. Documents Reviewed

- `SKILL_hermes-agent-ghostcrab-architect-skill.md`
- `SKILL_ghostcrab-mcp.md`

## 3. Executive Assessment

The Hermes-Agent folder is close to the right community positioning because it already treats GhostCrab as an MCP-accessible local memory layer. The `SKILL_ghostcrab-mcp.md` document especially has strong local-first language and explains why an agent should use GhostCrab as durable context instead of relying only on transient chat history.

The main issue is accuracy drift. The drafts use older commands, mixed backend language, and some terminology that should be brought in line with GhostCrab Personal SQLite.

Best community positioning:

> Hermes-Agent can connect to GhostCrab Personal as a local MCP memory server. GhostCrab stores durable facts, workspace state, and graph links in SQLite so an agent can recover context across sessions.

## 4. Target Shape

Hermes-Agent should be treated as an **MCP-compatible agent environment**, not necessarily a full multi-agent orchestration framework.

The best public skill should be broad enough to help:

- Hermes-Agent users
- Claude Code users
- Codex users
- other MCP clients that can call local `stdio` servers

That makes this folder useful as a general MCP onboarding bridge.

## 5. Community Fit

The community fit is strong if the message stays practical:

- local memory
- MCP tools
- SQLite persistence
- no hosted dependency required
- useful for coding sessions, project notes, blockers, and reusable context

Hermes-Agent users are likely to understand the MCP value quickly. The skill should avoid overbuilding an ontology architecture before showing the basic loop.

## 6. Main Corrections Needed

### 6.1 Replace old server command examples

The drafts mention commands such as:

- `ghostcrab-mcp start --transport stdio`
- custom MCP config names such as `ghostcrab-memory`

Use the current Personal setup:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then show how an MCP client points to the local GhostCrab server.

### 6.2 Make SQLite Personal the default

The architect skill mentions SQLite paths and PostgreSQL as alternatives. For community outreach, SQLite must be the default and PostgreSQL should only appear as a short PRO reference.

### 6.3 Normalize terminology

Some explanations mix French-influenced wording, older internal labels, and product names. Community-facing language should be consistent:

- GhostCrab Personal
- MindBrain Personal
- SQLite
- local MCP server
- `ghostcrab_*` tools

### 6.4 Use actual public tools

The skills should explicitly teach these core tools:

- `ghostcrab_status`
- `ghostcrab_remember`
- `ghostcrab_search`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_project`
- `ghostcrab_pack`
- `ghostcrab_count`
- `ghostcrab_traverse`

## 7. Skill-by-Skill Review

### `SKILL_ghostcrab-mcp.md`

This is the strongest public candidate in the folder.

What works:

- clear local-first positioning
- good explanation of why agent memory needs to persist
- broad applicability to MCP clients
- good distinction between Personal and advanced deployments

What needs correction:

- update install and server command examples
- replace older tool or capability names with `ghostcrab_*`
- keep PostgreSQL as a short PRO mention
- tighten the first demo to a small local workflow

Recommended rewrite:

> Use this skill when an MCP-capable agent needs durable local memory. Start GhostCrab Personal, connect the agent to the local MCP server, retrieve context with `ghostcrab_pack`, and save useful facts or state with `ghostcrab_remember` and `ghostcrab_upsert`.

### `SKILL_hermes-agent-ghostcrab-architect-skill.md`

What works:

- gives an architect role for structured memory design
- fits project setup and domain modeling
- can help advanced users build a stable workspace model

What needs correction:

- make it secondary to the basic MCP skill
- reduce backend configuration complexity
- avoid PostgreSQL-first architecture language
- replace custom startup commands

Recommended position:

> Keep this as an advanced skill for users who already understand the basic MCP memory loop and want to model a project domain more carefully.

## 8. Tool Mapping

| Hermes-Agent need | GhostCrab Personal tool |
| --- | --- |
| Check local memory availability | `ghostcrab_status` |
| Create a durable memory entry | `ghostcrab_remember` |
| Search remembered context | `ghostcrab_search` |
| Maintain current task or project state | `ghostcrab_upsert` |
| Link related items | `ghostcrab_learn` |
| Follow linked context | `ghostcrab_traverse` |
| Build active working context | `ghostcrab_project` |
| Load compact session context | `ghostcrab_pack` |
| Count records by facet | `ghostcrab_count` |
| Inspect schema contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: Resume a coding session

Store a project note with `ghostcrab_remember`. Start a new agent session and retrieve the note with `ghostcrab_pack`.

### Demo 2: Track a blocker

Use `ghostcrab_upsert` to create an active blocker, then use `ghostcrab_learn` to link it to the affected task.

### Demo 3: Search local project memory

Ask Hermes-Agent to search prior decisions with `ghostcrab_search` before making a code change.

## 10. PRO Mention

Suggested wording:

> This guide focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO - mindBrain Pro is the PostgreSQL-based path for teams that later need centralized deployment.

Keep this note brief.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: MCP-native agent / general MCP client — includes Hermes-Agent, Claude Code, Codex, and any MCP-compatible client.

**JTBD**: "I am an MCP-capable agent working on a project. I want my findings and current task state to persist between sessions without storing them in a hosted service, and I want to be able to resume where I left off."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Verify GhostCrab is running; load prior session context | `ghostcrab_status`, `ghostcrab_pack` | `ghostcrab_status` in tool mapping; `ghostcrab_pack` in Demo 1 — good |
| Read | Search prior notes, decisions, and task context | `ghostcrab_search` | Yes, Demo 3 |
| Write (durable) | Record a project note or decision permanently | `ghostcrab_remember` | Demo 1 — good |
| Write (state) | Update the current work item or blocker state | `ghostcrab_upsert` | Demo 2 — good |
| After | Record active project goals | `ghostcrab_project` | Tool mapping only, no demo |
| Recovery | Resume a coding session from prior state | `ghostcrab_pack` | Demo 1 covers this — good |

### Partial Credit: Best Behavioral Coverage in This Review Set

This folder's review comes closest to correct behavioral mapping — the Demo Scenarios implicitly cover 4 of the 5 lifecycle moments. However:

- `ghostcrab_status` as the mandatory first call is implied but not made explicit in a sequence
- `ghostcrab_project` appears only in the tool mapping table, with no demo or usage guidance
- the `remember` vs `upsert` distinction is never stated explicitly, even though Demo 1 uses `remember` and Demo 2 uses `upsert` correctly

### `remember` vs `upsert` Distinction

Demo 1 uses `ghostcrab_remember` for a project note (correct — durable fact).
Demo 2 uses `ghostcrab_upsert` for a blocker (correct — mutable state).
But the review never states the rule that governs the choice. A developer reading only the tool mapping table will not know which to use when.

### Minimal Viable Path

The Demo Scenarios provide a clear 4-tool path implicitly. The review should add an explicit label: "Minimum first contact: `ghostcrab_status → ghostcrab_pack → ghostcrab_remember → ghostcrab_search`."

### Tool Sequence Gaps

Missing: workspace existence check before first write. An MCP client starting a new project should call `ghostcrab_workspace_create` before its first `ghostcrab_remember`.

### Failure Mode Coverage

Not addressed. Critical cases:
- `ghostcrab_status` returns unhealthy — agent should stop and prompt the user to run `gcp brain up`
- `ghostcrab_pack` returns empty (new project) — agent should proceed, not error; note that first-time use requires a workspace

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 5/5 | MCP-native users are a strong audience, and the public entry skill is now concise. |
| Framework alignment | 5/5 | The basic MCP memory story is direct and client-neutral. |
| GhostCrab Personal accuracy | 5/5 | Commands now use `@mindflight/ghostcrab-personal-mcp` and `gcp brain up`. |
| Tool-name accuracy | 5/5 | Skills use the public `ghostcrab_*` tool surface. |
| Agent behavioral clarity | 5/5 | Start Here, remember/upsert, `ghostcrab_project`, and failure modes are explicit. |
| Community readiness | 5/5 | Ready as a local-first community trial path. |

Overall readiness: **Publishable after normal editorial review.**

## 12. Recommended Next Step

Use `SKILL_ghostcrab-mcp.md` as the public entry point and revise it around a minimal local flow:

1. install GhostCrab Personal
2. start the local MCP server
3. connect Hermes-Agent or another MCP client
4. retrieve context with `ghostcrab_pack`
5. write durable memory with `ghostcrab_remember` and `ghostcrab_upsert`

Move architect-level modeling guidance into a second, advanced skill.
