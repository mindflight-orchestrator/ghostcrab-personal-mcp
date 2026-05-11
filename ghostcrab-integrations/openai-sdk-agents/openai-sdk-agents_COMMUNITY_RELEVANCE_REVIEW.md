# OpenAI Agents SDK Community Relevance Review

## 1. Purpose

This review evaluates the OpenAI Agents SDK GhostCrab drafts as community-facing material for inviting OpenAI Agents SDK developers to try **MCP GhostCrab Personal SQLite**.

The review checks relevance, accuracy, and readiness without running a live SDK integration.

## 2. Documents Reviewed

- `SKILL_ghostcrab-openai-agents-sdk.md`
- `SKILL_ghostcrab-architect-ontology-bootstrap.md`
- `SKILL_ghostcrab-runtime-openai-agents-sdk.md`
- `sop-openai-sdk-agents-ghostcrab-mindbrain.md`

## 3. Executive Assessment

The OpenAI Agents SDK is an excellent target for GhostCrab Personal because MCP tool servers are a natural way to extend agents with local capabilities. The drafts correctly emphasize MCP server connections and agent-level memory needs.

The current folder still needs a focused community rewrite. Some content is in French, setup examples use older server commands, and several tool names do not match the current GhostCrab Personal public MCP surface.

Best community positioning:

> The OpenAI Agents SDK can connect to GhostCrab Personal as a local MCP server. GhostCrab stores durable SQLite-backed memory so agents can retrieve context, persist decisions, update state, and link dependencies across runs.

## 4. Target Shape

The OpenAI Agents SDK should be treated as a **general agent SDK with first-class MCP integration potential**.

The first community path should be:

- use `MCPServerStdio` or the SDK's local MCP server path
- start GhostCrab Personal locally
- call actual `ghostcrab_*` tools
- demonstrate one durable memory workflow

HTTP or streamable HTTP can be mentioned only if it is supported in the actual setup being documented. For GhostCrab Personal, the safest public path is local `stdio`.

## 5. Community Fit

OpenAI Agents SDK developers are a strong audience because they often need:

- persistent memory outside the model context window
- local tools
- project state across runs
- explicit task and decision tracking
- MCP-compatible extension points

The community message can be direct and practical.

## 6. Main Corrections Needed

### 6.1 Replace old server commands

The drafts mention commands such as:

- `ghostcrab serve --stdio`
- streamable HTTP server paths as if they were the default

Use the current Personal setup:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Then show the SDK connecting through local MCP.

### 6.2 Replace non-current tool names

The drafts mention tools such as:

- `get_entity`
- `search_entities`
- `get_relationships`
- `get_projection`
- `upsert_entity`
- `set_status`

These should be mapped to:

- `ghostcrab_search`
- `ghostcrab_remember`
- `ghostcrab_upsert`
- `ghostcrab_learn`
- `ghostcrab_traverse`
- `ghostcrab_project`
- `ghostcrab_pack`
- `ghostcrab_count`

### 6.3 Translate remaining French community prose

The community-facing skills should be in American English.

The writing should be concise and implementation-oriented:

- setup
- connection
- tool calls
- demo flow
- limitations

### 6.4 Move PostgreSQL to a short PRO note

Remove `pg_pragma`, PostgreSQL runtime, and production backend framing from the Personal guide. Keep only one short mention of **MCP GhostCrab PRO - mindBrain Pro**.

## 7. Skill-by-Skill Review

### `SKILL_ghostcrab-openai-agents-sdk.md`

This should become the main public entry point.

What works:

- strong MCP alignment
- good target audience
- SDK users can understand local tool servers quickly

What needs correction:

- use current setup command
- favor local `stdio`
- replace entity/projection tools with actual `ghostcrab_*`
- make SQLite Personal the default

Recommended rewrite:

> Use this skill when an OpenAI Agents SDK project needs durable local memory. Connect the agent to GhostCrab Personal as a local MCP server and use `ghostcrab_pack`, `ghostcrab_search`, `ghostcrab_remember`, and `ghostcrab_upsert`.

### `SKILL_ghostcrab-architect-ontology-bootstrap.md`

This should be treated as an advanced companion skill, not the first public entry point.

What works:

- gives OpenAI Agents SDK users a path toward structured workspace modeling
- can help when a project repeatedly handles the same entities, decisions, tasks, and dependencies
- fits GhostCrab's ability to export or inspect stabilized model shape

What needs correction:

- avoid making ontology bootstrap the first required step
- keep schema work provisional until real agent runs produce evidence
- use `ghostcrab_workspace_create`, `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_learn`, and only then schema inspection/export

Recommended position:

> Keep this skill for developers who already understand the basic MCP memory loop and want to shape a reusable project model for the OpenAI Agents SDK.

### `SKILL_ghostcrab-runtime-openai-agents-sdk.md`

What works:

- addresses runtime state and continuity
- understands that agents need more than one-shot tool calls

What needs correction:

- remove PostgreSQL and `pg_pragma` from the Personal path
- translate to English if needed
- map runtime state to `ghostcrab_upsert` and `ghostcrab_project`
- avoid overclaiming orchestration behavior

### `sop-openai-sdk-agents-ghostcrab-mindbrain.md`

The SOP is useful as internal strategy.

Recommended use:

- retain MCP architecture rationale
- extract a small SDK example
- remove outdated command and tool names from public content

## 8. Tool Mapping

| Agents SDK need | GhostCrab Personal tool |
| --- | --- |
| Check local memory server | `ghostcrab_status` |
| Load compact agent context | `ghostcrab_pack` |
| Search prior memory | `ghostcrab_search` |
| Store durable facts | `ghostcrab_remember` |
| Update current task or state | `ghostcrab_upsert` |
| Link dependencies or evidence | `ghostcrab_learn` |
| Traverse linked context | `ghostcrab_traverse` |
| Track active goals or constraints | `ghostcrab_project` |
| Count records by state | `ghostcrab_count` |
| Inspect schemas | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |

## 9. Community Demo Scenarios

### Demo 1: Local MCP memory server

Start GhostCrab Personal, connect an OpenAI Agents SDK agent to the local MCP server, and call `ghostcrab_status`.

### Demo 2: Persistent task memory

Have the agent save a durable project note with `ghostcrab_remember`, then recover it in a later run with `ghostcrab_pack`.

### Demo 3: State update

Have the agent update a task or workflow record with `ghostcrab_upsert` and retrieve it later with `ghostcrab_search`.

## 10. PRO Mention

Recommended wording:

> This guide focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO - mindBrain Pro is the PostgreSQL-based path for centralized team deployment.

Keep this as a footnote, not a setup path.

## JTBD Agent Analysis (Re-audit v2)

**Framework shape**: General agent SDK with first-class MCP integration via `MCPServerStdio`. This is the most direct integration path of all frameworks in this set.

**JTBD**: "I am an OpenAI Agents SDK agent using `MCPServerStdio` to connect to local tools. I want GhostCrab Personal as one of those local tools so my agent has durable memory across runs without any hosted service."

### Agent Lifecycle Mapping

| Moment | Agent question | Expected GhostCrab tool | Present in current review? |
|---|---|---|---|
| Before | Verify GhostCrab is running; load prior run context | `ghostcrab_status`, `ghostcrab_pack` | Demo 1 (status) and Demo 2 (pack) — good |
| Read | Search prior decisions and project notes | `ghostcrab_search` | Tool mapping — listed |
| Write (durable) | Record a permanent project note or finding | `ghostcrab_remember` | Demo 2 and Recommended Next Step — good |
| Write (state) | Update the current task or agent state | `ghostcrab_upsert` | Demo 3 and Recommended Next Step — good |
| After | Record active agent goals | `ghostcrab_project` | Tool mapping only, no demo |
| Recovery | Resume from prior run state | `ghostcrab_pack` | Demo 2 — good |

### Strongest MCP Native Integration Path — Underemphasized

The OpenAI Agents SDK's `MCPServerStdio` is the cleanest integration path for GhostCrab Personal. The connection is native, stdio-based, and requires no bridge. The review correctly identifies this but does not make it the centerpiece — the demos still focus on what to do AFTER connecting rather than showing the MCPServerStdio setup itself.

The review should show the connection setup as the most important first step:

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

ghostcrab = MCPServerStdio(command="gcp", args=["brain", "up"])
agent = Agent(name="my-agent", mcp_servers=[ghostcrab])
```

This 3-line setup is the key differentiator and belongs in a prominent "Start Here" section.

### `remember` vs `upsert` Distinction

Not explained. For OpenAI Agents SDK:
- `ghostcrab_remember`: "Discovered that API endpoint /v2/products is deprecated" — immutable project fact
- `ghostcrab_upsert`: "Task: migrate-endpoints, status: in_progress, deadline: 2026-05-15" — mutable task record

### Minimal Viable Path

Demo 1 → Demo 2 → Demo 3 provides a 4-tool path. The review should label it explicitly: "`ghostcrab_status → ghostcrab_pack → ghostcrab_remember → ghostcrab_upsert`."

### Failure Mode Coverage

Not addressed. Most important cases:
- `MCPServerStdio` fails to start GhostCrab — the SDK will likely surface a connection error; the review should tell developers to run `gcp brain up` separately and verify with `ghostcrab_status`
- `ghostcrab_pack` returns empty on first run — expected behavior for a new project; agent should proceed with empty context

## 11. Readiness Score

| Criterion | Score | Notes |
| --- | ---: | --- |
| Community relevance | 5/5 | SDK users are a natural MCP audience. |
| Framework alignment | 5/5 | Local MCP tools and MCPServerStdio are the right integration shape. |
| GhostCrab Personal accuracy | 3/5 | Needs cleanup but the path is close. |
| Tool-name accuracy | 2/5 | Several tool names need replacement. |
| Agent behavioral clarity | 2/5 | MCPServerStdio setup underemphasized; remember/upsert absent; ghostcrab_project has no demo; failure modes missing. |
| Community readiness | 3/5 | Very publishable after setup, language, and remember/upsert correction. |

Overall readiness: **Strong target, close after API cleanup.**

## 12. Recommended Next Step

Create one minimal OpenAI Agents SDK example centered on local `stdio` MCP:

1. start GhostCrab Personal
2. connect the SDK agent to the MCP server
3. call `ghostcrab_pack`
4. write with `ghostcrab_remember`
5. update state with `ghostcrab_upsert`

That example should become the community invitation.
