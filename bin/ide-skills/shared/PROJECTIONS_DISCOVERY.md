# Projection discovery (`ghostcrab_projections_list`)

Use **`ghostcrab_projections_list`** when you need to know **which projections exist on a workspace** and **which MCP tool to call next**. It returns a compact catalogue only — not projection content.

Artifact routing: [ARTIFACT_KINDS.md](./ARTIFACT_KINDS.md).

Operator CLI equivalent (registry rows only): `gcp brain artifact list --workspace-id … --kind analysis_plan|live_answer_view|answer_snapshot`.

## When to call it

| Situation | Call `projections_list`? |
| --- | --- |
| User asks what reports / KPIs / projections exist | **Yes** — first step |
| You already know `artifact_id` or `projection_id` | **No** — `artifact_get` or `projection_get` directly |
| You need facts or graph traversal | **No** — `search`, `graph_search`, `traverse` |
| You need pack content for a known scope | **No** — `ghostcrab_pack` with `scope` |

Typical flow:

```text
ghostcrab_status
  → ghostcrab_projections_list
  → pick one row (public_label + suggested_tools)
  → ghostcrab_artifact_get | ghostcrab_pack | ghostcrab_projection_get | ghostcrab_live_refresh
```

## Projection kinds (Personal SQLite)

| Business label | `artifact_kind` | `source` in list | Read with |
| --- | --- | --- | --- |
| Working memory / analysis plan | `analysis_plan` | `registry` | `ghostcrab_artifact_get`, `ghostcrab_pack` |
| Live answer (follows current data) | `live_answer_view` | `registry` | `ghostcrab_artifact_get`, `ghostcrab_live_refresh` |
| Frozen snapshot (Type B) | `answer_snapshot` | `registry` or `graph` | `ghostcrab_projection_get`, `ghostcrab_artifact_get` |
| Graph-only materialization | `answer_snapshot` (synthetic) | `graph` | `ghostcrab_projection_get` |

**Not listed:** `evidence_pack`. **Not projections:** live graph queries — use `ghostcrab_graph_search`, `ghostcrab_traverse`.

Legacy wire names: Type A → `analysis_plan`; Type B → `answer_snapshot`.

## Input arguments

All optional if the MCP session is pinned to a workspace.

| Argument | Default | Meaning |
| --- | --- | --- |
| `workspace_id` | session workspace | Workspace to scan |
| `kind` | all registry kinds + graph | Filter: `analysis_plan`, `live_answer_view`, `answer_snapshot`, or `graph` |
| `agent_id` | — | Registry filter (mainly `analysis_plan`) |
| `scope` | — | Registry filter |
| `include_graph` | `true` | Append graph `projection_id` values not already in registry |
| `limit` | `100` | Max rows per source |

Filter rules:

- `kind: analysis_plan` or `live_answer_view` → registry only; graph scan skipped
- `kind: graph` → graph only; registry skipped
- `include_graph: false` → registry only

## Output essentials

| Field | Meaning |
| --- | --- |
| `public_label` | **User-facing title** — prefer in chat |
| `artifact_kind` | Routing: `analysis_plan`, `live_answer_view`, `answer_snapshot` |
| `artifact_id` | Registry id — `ghostcrab_artifact_get`, `ghostcrab_live_refresh` |
| `projection_id` | Graph id — `ghostcrab_projection_get` |
| `suggested_tools` | Ordered MCP tools to read this projection |

## `suggested_tools` routing

| Context | `suggested_tools` |
| --- | --- |
| `analysis_plan` | `ghostcrab_artifact_get`, `ghostcrab_pack` |
| `live_answer_view` | `ghostcrab_artifact_get`, `ghostcrab_live_refresh` |
| `answer_snapshot` (registry) | `ghostcrab_projection_get`, `ghostcrab_artifact_get` |
| `source: graph` | `ghostcrab_projection_get` |

## Errors

| `error.code` | Cause |
| --- | --- |
| `missing_workspace` | No `workspace_id` in args and no active session workspace |
| `backend_unavailable` | MindBrain backend unreachable for registry listing |

## Related tools

| Tool | Role |
| --- | --- |
| `ghostcrab_projection_get` | Read Type B / graph bundle by `projection_id` |
| `ghostcrab_artifact_get` | Read one registry row including `payload` |
| `ghostcrab_pack` | Compact pack for `analysis_plan` scopes |
| `ghostcrab_live_refresh` | Recompute a `live_answer_view` |
| `ghostcrab_project` | **Write** — create/update Type A working memory |
