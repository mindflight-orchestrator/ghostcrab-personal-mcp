# Projection discovery (`ghostcrab_projections_list`)

> Human guide for agents and operators. Tool catalogue: [mcp-tools.md](mcp-tools.md#ghostcrab_projections_list). Artifact routing: [ghostcrab-skills/shared/ARTIFACT_KINDS.md](../../ghostcrab-skills/shared/ARTIFACT_KINDS.md).

Use **`ghostcrab_projections_list`** when you need to know **which projections exist on a workspace** and **which MCP tool to call next**. It returns a compact catalogue only — not projection content.

Operator CLI equivalent for registry rows only: `gcp brain artifact list --workspace-id … --kind analysis_plan|live_answer_view|answer_snapshot`.

---

## When to call it

| Situation | Call `projections_list`? |
|-----------|---------------------------|
| User asks “what reports / KPIs / projections exist?” | **Yes** — first step |
| You already know `artifact_id` or `projection_id` | **No** — call `artifact_get` or `projection_get` directly |
| You need facts or graph traversal | **No** — `search`, `graph_search`, `traverse` |
| You need pack content for a known scope | **No** — `ghostcrab_pack` with `scope` |

Typical flow:

```text
ghostcrab_status
  → ghostcrab_live_create (when a new governed live view is requested)
  → ghostcrab_projections_list
  → pick one row (public_label + suggested_tools)
  → ghostcrab_artifact_get | ghostcrab_pack | ghostcrab_projection_get | ghostcrab_live_refresh
```

---

## Projection kinds (Personal SQLite)

| Business label | `artifact_kind` | `source` in list | Read with |
|----------------|-----------------|------------------|-----------|
| Working memory / analysis plan | `analysis_plan` | `registry` | `ghostcrab_artifact_get`, `ghostcrab_pack` |
| Live answer (follows current data) | `live_answer_view` | `registry` | `ghostcrab_artifact_get`, `ghostcrab_live_refresh` |
| Frozen snapshot (Type B) | `answer_snapshot` | `registry` or `graph` | `ghostcrab_projection_get`, `ghostcrab_artifact_get` |
| Graph-only materialization | `answer_snapshot` (synthetic) | `graph` | `ghostcrab_projection_get` |

**Not listed:** `evidence_pack` (supporting artefact, not a business projection). **Not projections:** live graph queries — use `ghostcrab_graph_search`, `ghostcrab_traverse`.

Legacy wire names: Type A → `analysis_plan` / `projection_type_a`; Type B → `answer_snapshot` / `projection_type_b`.

---

## Input arguments

All optional if the MCP session is pinned to a workspace.

| Argument | Default | Meaning |
|----------|---------|---------|
| `workspace_id` | session workspace | Workspace to scan |
| `kind` | all registry kinds + graph | Filter: `analysis_plan`, `live_answer_view`, `answer_snapshot`, or `graph` only |
| `agent_id` | — | Registry filter (mainly `analysis_plan`) |
| `scope` | — | Registry filter |
| `include_graph` | `true` | Append distinct `projection_id` from `ProjectionResult` entities not already in registry |
| `limit` | `100` | Max rows **per source** (registry query and graph query each capped) |

### Filter rules

- `kind: analysis_plan` or `kind: live_answer_view` → registry only; **graph scan is skipped** even when `include_graph: true`.
- `kind: graph` → graph `projection_id` values only; registry skipped.
- `include_graph: false` → registry only (all three answer-artifact kinds when `kind` omitted).

### Example requests

```json
{}
```

```json
{ "workspace_id": "serenity", "kind": "live_answer_view" }
```

```json
{ "kind": "graph", "limit": 50 }
```

```json
{ "include_graph": false, "scope": "serenity" }
```

---

## Output shape

Successful responses extend the standard MCP envelope (`ok`, `tool`, `surface_version`, …) with:

| Field | Type | Meaning |
|-------|------|---------|
| `workspace_id` | string | Workspace scanned |
| `backend` | `"native"` | Registry via MindBrain SQL API |
| `count` | number | Length of `projections` |
| `projections` | array | Catalogue entries (see below) |
| `filters` | object | Echo of effective filters |
| `notes` | string[] | Agent hints (use `public_label` for users) |

### Each `projections[]` entry

| Field | Meaning |
|-------|---------|
| `source` | `"registry"` (named artefact) or `"graph"` (discovered via `ProjectionResult`) |
| `public_label` | **User-facing title** — prefer this in chat |
| `artifact_kind` | Routing: `analysis_plan`, `live_answer_view`, `answer_snapshot` |
| `artifact_id` | Registry id when present — pass to `ghostcrab_artifact_get` / `ghostcrab_live_refresh` |
| `projection_id` | Graph id when present — pass to `ghostcrab_projection_get` |
| `slug` | Short registry or graph slug |
| `lifecycle` / `state` | Runtime status (`active`/`open` for live; `frozen` for snapshots) |
| `legacy_ref` | Optional back-link (e.g. `projection:p_legacy`) |
| `legacy_kind` | `projection_type_a` or `projection_type_b` when applicable |
| `suggested_tools` | Ordered MCP tools to read this projection |

### `suggested_tools` routing

| `artifact_kind` / context | `suggested_tools` |
|---------------------------|-------------------|
| `analysis_plan` | `ghostcrab_artifact_get`, `ghostcrab_pack` |
| `live_answer_view` | `ghostcrab_artifact_get`, `ghostcrab_live_refresh` |
| `answer_snapshot` (registry) | `ghostcrab_projection_get`, `ghostcrab_artifact_get` |
| `source: graph` | `ghostcrab_projection_get` |

### Example response (truncated)

```json
{
  "ok": true,
  "tool": "ghostcrab_projections_list",
  "workspace_id": "serenity",
  "count": 2,
  "projections": [
    {
      "source": "registry",
      "artifact_kind": "live_answer_view",
      "artifact_id": "live_answer_view__pilotage_hebdo",
      "projection_id": null,
      "slug": "pilotage_hebdo",
      "public_label": "Pilotage hebdomadaire du chantier",
      "lifecycle": "active",
      "state": "open",
      "legacy_ref": null,
      "legacy_kind": null,
      "suggested_tools": ["ghostcrab_artifact_get", "ghostcrab_live_refresh"]
    },
    {
      "source": "graph",
      "artifact_kind": "answer_snapshot",
      "artifact_id": null,
      "projection_id": "proj_keyword_opportunities",
      "slug": "proj_keyword_opportunities",
      "public_label": "Keyword opportunities",
      "lifecycle": "frozen",
      "state": null,
      "legacy_ref": null,
      "legacy_kind": "projection_type_b",
      "suggested_tools": ["ghostcrab_projection_get"]
    }
  ],
  "filters": {
    "kind": "all",
    "agent_id": null,
    "scope": null,
    "include_graph": true
  },
  "notes": [
    "Use public_label when speaking to the user; artifact_kind and legacy_kind are routing hints only."
  ]
}
```

---

## Errors

| `error.code` | Cause |
|--------------|-------|
| `missing_workspace` | No `workspace_id` in args and no active session workspace |
| `backend_unavailable` | MindBrain backend unreachable for registry listing |

Graph listing uses the same MCP SQL client as other read tools; it requires a healthy backend.

---

## Related tools

| Tool | Role |
|------|------|
| `ghostcrab_projection_get` | Read materialized Type B / graph bundle by `projection_id` |
| `ghostcrab_artifact_get` | Read one registry row including `payload` |
| `ghostcrab_pack` | Query-driven compact pack for `analysis_plan` scopes |
| `ghostcrab_live_refresh` | Recompute a `live_answer_view` |
| `ghostcrab_live_create` | Create a governed `live_answer_view` in the effective workspace |
| `ghostcrab_project` | **Write** — create/update Type A working memory |
| `gcp brain artifact list` | Operator CLI registry list (no graph scan) |

---

## See also

- [05 — Projections expliquées](../explanation/05-projections-expliquees.md)
- [renommage.md](../explanation/renommage.md) — artefact registry model
- [Concept_EAT_YOUR_OWN_DOG_FOOD.md](../Concept_EAT_YOUR_OWN_DOG_FOOD.md) — dynamic projection discovery rationale
