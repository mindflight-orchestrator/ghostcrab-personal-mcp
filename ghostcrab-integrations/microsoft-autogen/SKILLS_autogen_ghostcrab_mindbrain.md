# SKILL: Microsoft AutoGen + GhostCrab Personal

Purpose: connect Microsoft AutoGen teams to GhostCrab Personal as a local MCP state store for shared operational memory.

This skill is Personal-first:

- Package: `@mindflight/ghostcrab-personal-mcp`
- Start command: `gcp brain up`
- Storage: local SQLite
- Transport: stdio by default
- AutoGen MCP class: `autogen_ext.tools.mcp.McpWorkbench`
- Server params: `autogen_ext.tools.mcp.StdioServerParams`

PRO note: MCP GhostCrab PRO / mindBrain Pro is the centralized team path for later. Keep this guide focused on Personal SQLite.

## Boundary

AutoGen orchestrates agents. GhostCrab stores shared state. GhostCrab does not dispatch agents, set priorities, decide who speaks, or replace `RoundRobinGroupChat`, `SelectorGroupChat`, or other AutoGen team logic.

Use GhostCrab when AutoGen agents need shared memory across turns, agents, and runs:

- planner decisions
- executor task state
- reviewer findings
- blockers and dependencies
- evidence links
- recovery context for agents joining a run

## Install and Start

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
pip install -U "autogen-agentchat" "autogen-ext[mcp]" "autogen-core"
```

## AutoGen MCP Workbench

Use `McpWorkbench` with `StdioServerParams` for the local Personal path.

```python
from autogen_ext.tools.mcp import McpWorkbench, StdioServerParams


def ghostcrab_stdio_params() -> StdioServerParams:
    return StdioServerParams(command="gcp", args=["brain", "up"])
```

```python
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

GHOSTCRAB_TOOLS = {
    "ghostcrab_status",
    "ghostcrab_workspace_list",
    "ghostcrab_workspace_create",
    "ghostcrab_pack",
    "ghostcrab_remember",
    "ghostcrab_search",
    "ghostcrab_upsert",
    "ghostcrab_count",
    "ghostcrab_learn",
    "ghostcrab_traverse",
    "ghostcrab_project",
}


async def verify_ghostcrab_tools(workbench: McpWorkbench) -> None:
    tool_names = {tool["name"] for tool in await workbench.list_tools()}
    missing = GHOSTCRAB_TOOLS - tool_names
    if missing:
        raise RuntimeError(f"GhostCrab Personal tools missing: {sorted(missing)}")


def build_agent(
    name: str,
    system_message: str,
    model: OpenAIChatCompletionClient,
    workbench: McpWorkbench,
) -> AssistantAgent:
    return AssistantAgent(
        name=name,
        model_client=model,
        workbench=workbench,
        system_message=system_message,
        reflect_on_tool_use=True,
    )
```

Keep the workbench alive for the lifetime of the team run. If the workbench context closes before agents run, tool calls will fail.

## Workspace Rule

Always call `ghostcrab_workspace_list` before `ghostcrab_workspace_create`.

```python
async def ensure_workspace(workbench, workspace_id: str) -> None:
    existing = await workbench.call_tool("ghostcrab_workspace_list", {})
    if workspace_id not in str(existing):
        await workbench.call_tool(
            "ghostcrab_workspace_create",
            {
                "id": workspace_id,
                "label": workspace_id.replace("-", " ").title(),
                "description": "AutoGen shared operational memory.",
            },
        )
```

## Lifecycle JTBD

| AutoGen role | Job | GhostCrab calls |
| --- | --- | --- |
| Planner | Load context, set active goals, store plan decision. | `ghostcrab_pack`, `ghostcrab_project`, `ghostcrab_remember` |
| Executor | Load relevant state, update task state, store findings. | `ghostcrab_pack`, `ghostcrab_upsert`, `ghostcrab_remember` |
| Reviewer | Search prior decisions, record approval or critique. | `ghostcrab_search`, `ghostcrab_remember` |

## Agent Performance Contract

1. AutoGen decides who speaks and acts. GhostCrab stores shared state. Do not move scheduling decisions into GhostCrab.
2. The first tool turn for each agent should be `ghostcrab_pack`; use `ghostcrab_search` only for targeted follow-up.
3. Planner decisions and reviewer rationale go to `ghostcrab_remember`; executable task state goes to `ghostcrab_upsert`.
4. Use stable `record_id` values and include `team_id`, `agent_name`, and `task_id` facets to avoid duplicate state.
5. Close every agent handoff with `ghostcrab_project` so a newly joined agent can recover the team goal and constraints.

## remember vs upsert

Use `ghostcrab_remember` for immutable findings and decisions:

```python
await workbench.call_tool(
    "ghostcrab_remember",
    {
        "content": "Reviewer finding: auth refactor lacks coverage for expired-token retry.",
        "facets": {
            "workspace": "autogen-demo",
            "role": "reviewer",
            "kind": "finding",
            "task_id": "auth-refactor",
        },
    },
)
```

Use `ghostcrab_upsert` for mutable task state:

```python
await workbench.call_tool(
    "ghostcrab_upsert",
    {
        "schema_id": "autogen_task_state",
        "match": {"facets": {"record_id": "task:auth-refactor"}},
        "set_content": "Task auth-refactor is in progress. Assignee: executor.",
        "set_facets": {
            "record_id": "task:auth-refactor",
            "workspace": "autogen-demo",
            "assignee": "executor",
            "status": "in_progress",
        },
        "create_if_missing": True,
    },
)
```

Do not overwrite decisions with `upsert` when the review history matters. Do not create a new `remember` fact for every status tick.

## Shared Team Pattern

Each agent can use the same workbench. The team still controls turn order.

```python
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import MaxMessageTermination
from autogen_agentchat.ui import Console
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench


async def run_team(task: str) -> None:
    model = OpenAIChatCompletionClient(model="gpt-5-mini")

    async with McpWorkbench(ghostcrab_stdio_params()) as workbench:
        await ensure_workspace(workbench, "autogen-demo")

        planner = AssistantAgent(
            "planner",
            model_client=model,
            workbench=workbench,
            system_message=(
                "You plan the work. Start with ghostcrab_pack. Use "
                "ghostcrab_remember for plan decisions and ghostcrab_project "
                "for active goals. Do not decide AutoGen turn order."
            ),
        )
        executor = AssistantAgent(
            "executor",
            model_client=model,
            workbench=workbench,
            system_message=(
                "You execute tasks. Use ghostcrab_upsert for mutable task state "
                "and ghostcrab_remember for stable findings."
            ),
        )
        reviewer = AssistantAgent(
            "reviewer",
            model_client=model,
            workbench=workbench,
            system_message=(
                "You review outputs. Use ghostcrab_search for prior operational "
                "decisions and ghostcrab_remember for approval decisions."
            ),
        )

        team = RoundRobinGroupChat(
            [planner, executor, reviewer],
            termination_condition=MaxMessageTermination(9),
        )
        await Console(team.run_stream(task=task))
```

## Recommended Next Step

Keep the first demo to four calls:

1. Planner: `ghostcrab_pack`
2. Planner: `ghostcrab_remember`
3. Executor: `ghostcrab_pack`
4. Executor: `ghostcrab_upsert`

Add `ghostcrab_search` only as recovery fallback when the pack is unexpectedly empty.

## Failure Modes

Empty pack for a joining agent: call `ghostcrab_search` with workspace and task facets before assuming there is no state.

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in GhostCrab. AutoGen planners and reviewers can use `mode="hybrid"` to improve cross-agent decision retrieval when embeddings are available.

Group chat ends before writes commit: make writes explicit in the agent prompt and verify final state with `ghostcrab_search` or `ghostcrab_count`.

Concurrent task updates: use stable `record_id` facets and include the AutoGen run id when parallel teams should not overwrite each other.

Tool mismatch: if `workbench.list_tools()` does not show the expected `ghostcrab_*` tools, stop and check that `gcp brain up` is the Personal MCP server on stdio.
