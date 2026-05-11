# OpenClaw Community Relevance Review

## 1. Purpose

This review evaluates the OpenClaw GhostCrab drafts as community-facing material for inviting OpenClaw users to try **MCP GhostCrab Personal SQLite**.

The review checks descriptive relevance and API alignment only. It does not run OpenClaw or GhostCrab live.

## 2. Documents Reviewed

- `SKILL_openclaw_ghostcrab-architect.md`
- `SKILL_openclaw_ghostcrab-runtime.md`
- `SKILL_openclaw_ghostcrab_mindbrain.md`
- `sop_openclaw_ghostcrab_mindbrain.md`

## 3. Executive Assessment

OpenClaw is one of the more mature community candidates in this repository. The drafts already understand local-first memory, privacy, ClawHub-style skill distribution, and the value of replacing fragile step memory with durable structured context.

The main gap is transport and tool accuracy. The OpenClaw drafts often assume HTTP, SSE, streamable HTTP, `$GHOSTCRAB_URL`, or tools such as `ghostcrab_get` and `ghostcrab_write`. For GhostCrab Personal SQLite, the public default should be local MCP over `stdio`, with actual `ghostcrab_*` tools.

Best community positioning:

> OpenClaw agents can use GhostCrab Personal as a local SQLite-backed MCP memory layer for durable context, task state, decisions, and linked knowledge.

## 4. Target Shape

OpenClaw should be treated as an **agent framework or skill ecosystem with external tool endpoints**.

Because the current drafts assume URL-based endpoints, the public guide must clearly distinguish:

- what works with GhostCrab Personal today
- what requires an MCP-to-HTTP bridge
- what belongs to a future OpenClaw connector

If OpenClaw can call local `stdio` MCP tools directly, the guide should show that. If not, the guide should not hide the bridge requirement.

## 5. Community Fit

The community fit is strong because OpenClaw users are likely to care about:

- tool-using agents
- skill portability
- local memory
- privacy
- task continuity
- reusable agent context

The ClawHub style could make GhostCrab easy to discover if the skill is accurate and simple.

## 6. Main Corrections Needed

### 6.1 Replace HTTP-first assumptions

The drafts refer to:

- `$GHOSTCRAB_URL`
- `/mcp`
- streamable HTTP
- SSE
- external endpoint URLs

If those are not documented for GhostCrab Personal, they should be presented as bridge or future connector options, not the default.

Use the Personal setup:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then document the actual OpenClaw connection path.

### 6.2 Replace old tool names

The drafts include names such as:

- `ghostcrab_get`
- `ghostcrab_write`
- custom memory or graph methods

Replace with:

- `ghostcrab_pack`
- `ghostcrab_search`
- `ghostcrab_remember`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_traverse`
- `ghostcrab_project`
- `ghostcrab_count`

### 6.3 Keep PostgreSQL secondary

The drafts already do a better job than many others at centering Personal SQLite. Keep that, and limit PostgreSQL to a short PRO note.

### 6.4 Simplify the public pack

Three OpenClaw skills may be too many for first publication.

Recommended public order:

1. `SKILL_openclaw_ghostcrab_mindbrain.md` as the main community skill
2. runtime skill as a practical companion
3. architect skill as advanced modeling guidance

## 7. Skill-by-Skill Review

### `SKILL_openclaw_ghostcrab_mindbrain.md`

This is the strongest public candidate.

What works:

- good local-first and privacy framing
- strong community packaging potential
- speaks naturally to an agent skill ecosystem

What needs correction:

- replace endpoint assumptions with actual connection requirements
- replace `ghostcrab_get` and `ghostcrab_write`
- make `ghostcrab_pack` and `ghostcrab_remember` central

Recommended rewrite:

> Use this skill when an OpenClaw agent needs durable local memory. Connect to GhostCrab Personal through MCP, retrieve context with `ghostcrab_pack`, and write durable facts or current state with `ghostcrab_remember` and `ghostcrab_upsert`.

### `SKILL_openclaw_ghostcrab-runtime.md`

What works:

- operationally useful
- likely covers task state, progress, and memory during agent runs

What needs correction:

- make runtime operations actual `ghostcrab_*` calls
- avoid making GhostCrab the OpenClaw scheduler
- document bridge requirements if OpenClaw expects HTTP

### `SKILL_openclaw_ghostcrab-architect.md`

What works:

- good advanced role for modeling a workspace
- useful once an OpenClaw use case stabilizes

What needs correction:

- make it secondary
- avoid hard ontology first steps
- use provisional memory and later schema inspection/export

### `sop_openclaw_ghostcrab_mindbrain.md`

The SOP is useful, but should not be the first community artifact.

Recommended use:

- keep strategic positioning
- extract one clean local demo
- remove undocumented endpoint assumptions from public content

## 8. Tool Mapping

| OpenClaw need | GhostCrab Personal tool |
| --- | --- |
| Load agent context | `ghostcrab_pack` |
| Search durable memory | `ghostcrab_search` |
| Store durable observations | `ghostcrab_remember` |
| Update task or session state | `ghostcrab_upsert` |
| Link tasks, decisions, and dependencies | `ghostcrab_learn` |
| Traverse linked memory | `ghostcrab_traverse` |
| Track active goals | `ghostcrab_project` |
| Count open items | `ghostcrab_count` |
| Inspect model contracts | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: Agent memory replacement

An OpenClaw agent retrieves prior context with `ghostcrab_pack` instead of relying only on in-run memory.

### Demo 2: Durable local note

The agent stores a durable finding with `ghostcrab_remember` and retrieves it later with `ghostcrab_search`.

### Demo 3: Task state and dependency

The agent updates task state with `ghostcrab_upsert` and links a dependency with `ghostcrab_learn`.

## 10. PRO Mention

Suggested wording:

> This guide focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO - mindBrain Pro is the PostgreSQL-based option for centralized team deployment.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: Agent framework with skill ecosystem (ClawHub distribution). Skills are discrete, composable units of agent behavior.

**JTBD**: "I am an OpenClaw agent executing a skill. At skill start, I need to load any durable context relevant to this task. During execution, I need to write findings and update state. At skill end, I need to leave a clean handoff for future skill invocations."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Load durable context relevant to this skill | `ghostcrab_pack` | Demo 1 and recommended rewrite — good |
| Read | Search prior observations or decisions | `ghostcrab_search` | Demo 2 — good |
| Write (durable) | Record an immutable finding from this skill run | `ghostcrab_remember` | Demo 2 — good |
| Write (state) | Update a mutable task or dependency record | `ghostcrab_upsert` | Demo 3 — good |
| After | Record active goals for future skill invocations | `ghostcrab_project` | Tool mapping only, no demo |
| Recovery | Resume from prior skill state | `ghostcrab_pack` | Demo 1 — good |

### Best-Aligned JTBD Structure in This Review Set

This review comes closest to correct behavioral thinking. The three demos cover the core lifecycle moments. The main gaps are:

1. Transport resolution is a PREREQUISITE — the sequence audit must happen before any tool call
2. `remember` vs `upsert` distinction is never stated as a rule
3. `ghostcrab_project` has no demo

### Critical Gap: Transport is a Sequence Prerequisite

For OpenClaw, whether the transport is stdio or HTTP is not a secondary detail — it determines whether ANY GhostCrab call works. The review correctly identifies this as the main issue but does not make it the FIRST thing the developer must resolve before looking at tool sequences.

The review should say:

> Step zero: resolve transport. If OpenClaw supports local stdio MCP natively, use `gcp brain up` and connect over stdio. If OpenClaw requires HTTP, an MCP-to-HTTP bridge must be running before any `ghostcrab_*` tool call is possible. Do not proceed to tool-level guidance until transport is confirmed.

### `remember` vs `upsert` Distinction

Not explicitly stated. For OpenClaw skills:
- `ghostcrab_remember`: "Skill run finding: detected 3 duplicate entries in dataset" — immutable
- `ghostcrab_upsert`: "Task: deduplicate-records, status: running → done" — mutable

### Failure Mode Coverage

Not addressed. Key failure modes for OpenClaw:
- Transport not configured — skill should abort with a clear error message
- `ghostcrab_pack` returns empty (new project) — skill should proceed with empty context and call `ghostcrab_workspace_create`
- `ghostcrab_status` reports GhostCrab down — skill should degrade gracefully or prompt the user

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 4/5 | Strong local-agent memory, runtime state, and modeling use cases. |
| Framework alignment | 4/5 | The skills are now ordered as main memory, runtime companion, and advanced architect companion. |
| GhostCrab Personal accuracy | 4/5 | The skills center `@mindflight/ghostcrab-personal-mcp`, `gcp brain up`, SQLite, and stdio default. |
| Tool-name accuracy | 4/5 | Public skills use actual `ghostcrab_*` tools and remove old custom tool names. |
| Agent behavioral clarity | 4/5 | Step-zero transport, lifecycle JTBD, remember/upsert, workspace creation order, and failure modes are explicit. |
| Community readiness | 4/5 | Ready for community review, with transport still dependent on OpenClaw stdio support or a bridge. |

Overall readiness: **Community-ready after transport verification in OpenClaw.**

## 12. Recommended Next Step

Rewrite the main OpenClaw skill around a tested connection claim:

1. if OpenClaw supports local `stdio` MCP, show that path
2. if it requires HTTP, state that an MCP-to-HTTP bridge is required
3. use only actual `ghostcrab_*` tools
4. keep PRO PostgreSQL as one short note

This will prevent the strongest folder from being weakened by a transport promise that may not match GhostCrab Personal.
