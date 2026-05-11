# skill_ghostcrab_personal_agno.md — First Contact for Agno Developers

Use this skill when introducing Agno developers to GhostCrab Personal for the first time. The goal is a small, credible local demo: one Agno agent writes shared memory, another Agno agent retrieves it, and everything stays in a local SQLite-backed GhostCrab workspace.

---

## 1. Why Agno Users Should Care

Agno makes it straightforward to build agents and teams, but shared memory across agents can still become fragmented. One agent may discover a fact, another may need it later, and the only bridge is often a prompt, a transcript, or a framework-specific storage table.

GhostCrab Personal gives Agno projects a local shared memory layer through MCP.

It helps when agents need:

- cross-agent context
- durable project facts
- current task state
- graph links between blockers, decisions, tasks, and evidence
- recovery context after a run or session restart

No PostgreSQL setup is required for the first trial.

---

## 2. What GhostCrab Personal Adds

GhostCrab Personal adds:

- local SQLite persistence
- an MCP tool surface
- workspace discovery with `ghostcrab_workspace_list`
- durable facts with `ghostcrab_remember`
- mutable current state with `ghostcrab_upsert`
- search with `ghostcrab_search`
- recovery context with `ghostcrab_pack`
- graph links with `ghostcrab_learn`
- active run context with `ghostcrab_project`

Agno remains the agent framework. GhostCrab is the local shared memory sidecar.

---

## 3. Quick Start With `gcp brain up` And MCPTools

Start GhostCrab Personal:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

Use local `stdio` as the default MCP transport.

Example Agno sketch:

```python
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.mcp import MCPTools

ghostcrab = MCPTools(
    transport="stdio",
    command="gcp",
    args=["brain", "up"],
    timeout=120,
)

agent = Agent(
    name="AgnoGhostCrabDemo",
    model=OpenAIChat(id="gpt-4.1"),
    tools=[ghostcrab],
    enable_user_memories=False,
    instructions=[
        "Use GhostCrab Personal as shared memory.",
        "Call ghostcrab_status first.",
        "Call ghostcrab_workspace_list before selecting a workspace.",
        "Create the workspace before writing if it is missing.",
        "Use ghostcrab_remember for durable facts.",
        "Use ghostcrab_upsert for current mutable state.",
    ],
    markdown=True,
)
```

If an Agno version uses a different MCPTools constructor, keep the same integration shape: the Agno agent should launch or connect to `gcp brain up` and call the exposed `ghostcrab_*` tools.

---

## 4. Agent Lifecycle

| Moment | Agent action | GhostCrab tool |
| --- | --- | --- |
| Before | Check runtime and select workspace | `ghostcrab_status`, `ghostcrab_workspace_list`, `ghostcrab_workspace_create` if missing |
| Read | Recover prior context | `ghostcrab_pack`, `ghostcrab_search` |
| Write | Save facts or current state | `ghostcrab_remember`, `ghostcrab_upsert` |
| After | Leave goals or next steps | `ghostcrab_project` |
| Recovery | Resume from shared memory | `ghostcrab_pack` |

---

## 5. Minimal Shared-Memory Scenario

Use no more than four core GhostCrab tools for the first demo. In a shared environment, call `ghostcrab_workspace_list` before creating the workspace.

1. `ghostcrab_status`
2. `ghostcrab_workspace_create`
3. `ghostcrab_remember`
4. `ghostcrab_search`

Prompt:

```text
Use GhostCrab Personal workspace "agno-demo".

1. Call ghostcrab_status.
2. If GhostCrab is unavailable, stop and tell me to run `gcp brain up`.
3. Call ghostcrab_workspace_list, then ensure the workspace exists with ghostcrab_workspace_create if needed.
4. Store this durable fact with ghostcrab_remember:
   "ResearchAgent found that the Agno community demo should start with MCPTools, not a native memory backend."
5. Search for "MCPTools native memory backend" with ghostcrab_search.
6. Return the fact and explain how WriterAgent could reuse it.
```

Expected result:

- Agent A can write memory.
- Agent B or a later run can retrieve it.
- The demo proves shared context without custom database work.

---

## 6. Multi-Agent Workspace Scenario

Use one workspace for every Agno agent in the team.

Suggested roles:

- `ResearchAgent`: writes durable findings with `ghostcrab_remember`
- `WriterAgent`: retrieves findings with `ghostcrab_search`
- `OrchestratorAgent`: maintains task state with `ghostcrab_upsert`
- `ReviewAgent`: loads recovery context with `ghostcrab_pack`

Prompt:

```text
Use GhostCrab Personal workspace "agno-demo".

ResearchAgent:
- Store one durable finding about Agno MCPTools with ghostcrab_remember.

OrchestratorAgent:
- Upsert task:agno-community-demo with status "in_progress" using ghostcrab_upsert.

WriterAgent:
- Search for the finding and write a short community invitation.

ReviewAgent:
- Call ghostcrab_pack and summarize what the next run should remember.
```

This scenario shows the practical value of shared memory without requiring a native Agno adapter.

---

## 7. Write Rules

Use this rule in every Agno prompt:

- `ghostcrab_remember` = immutable fact
- `ghostcrab_upsert` = mutable current state

Examples:

```text
remember:
"Agent A discovered that Agno MCPTools are the lowest-friction first-contact path."

upsert:
"Task: agno-community-demo, status: pending -> in_progress -> done."
```

Agents should not append every status change as a durable fact. Current task state belongs in `ghostcrab_upsert`.

---

## 8. Failure Modes

| Situation | Correct Agno behavior |
| --- | --- |
| `ghostcrab_status` unavailable | Ask the user to run `gcp brain up`; do not silently continue memory writes. |
| Workspace does not exist | Call `ghostcrab_workspace_list`, then `ghostcrab_workspace_create` before any write. |
| `ghostcrab_pack` returns empty | Treat it as a normal first run. |
| `ghostcrab_search` returns no result | Continue and optionally store a new fact. |
| A write tool fails | Report that the memory update did not persist. |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embedding configuration, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in the GhostCrab server environment or config. Agno agents can keep the same `ghostcrab_search` call; retrieval quality follows the active GhostCrab server mode.

---

## 9. Future: Native Agno Adapter

A future native adapter could map Agno memory events into GhostCrab Personal automatically. That would be useful once the community agrees on the right semantics.

For now, the right invitation is simpler:

> Try GhostCrab Personal as an MCP tool surface first. Use the real `ghostcrab_*` tools and tell us what a native Agno memory adapter should feel like.

---

## 10. PRO Note

This guide focuses on GhostCrab Personal SQLite. Teams that later need centralized PostgreSQL infrastructure can explore **MCP GhostCrab PRO - mindBrain Pro**.
