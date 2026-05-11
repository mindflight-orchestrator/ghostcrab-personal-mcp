# Skill: Advanced GhostCrab Workspace and Ontology Bootstrap

**Scope:** Advanced follow-up for OpenAI Agents SDK users who already connected GhostCrab Personal with `MCPServerStdio` and `gcp brain up`. Use this skill only after the main runtime skill has been used to store and retrieve real records.

The goal is to evolve from provisional memory into a deliberate workspace model without freezing schema too early.

---

## Prerequisites

- GhostCrab Personal installed from `@mindflight/ghostcrab-personal-mcp`.
- Local server available through `gcp brain up`.
- The main SDK skill has already verified `ghostcrab_status`.
- You have at least one real workflow or record family worth modeling.

```python
from agents import Agent
from agents.mcp import MCPServerStdio

ghostcrab = MCPServerStdio(command="gcp", args=["brain", "up"], cache_tools_list=True)
architect = Agent(name="WorkspaceArchitect", mcp_servers=[ghostcrab])
```

---

## Bootstrap Order

Start with a workspace and provisional records. Registering or freezing schema comes later.

1. `ghostcrab_status`
2. `ghostcrab_workspace_list`
3. `ghostcrab_workspace_create` only if the workspace is absent
4. `ghostcrab_project` to capture provisional goals, steps, and constraints
5. `ghostcrab_remember` for stable domain facts and examples
6. `ghostcrab_upsert` for current-state tracker records
7. `ghostcrab_schema_list` and `ghostcrab_schema_inspect` before using a schema-specific write pattern
8. `ghostcrab_workspace_export_model` when downstream tools need a model contract

This keeps early modeling reversible. The first artifact is a useful workspace, not a rigid ontology.

---

## Architect Instructions

```text
You are a GhostCrab Personal workspace architect.

Process:
1. Verify GhostCrab with ghostcrab_status.
2. Call ghostcrab_workspace_list before creating anything.
3. If the requested workspace does not exist, create it with ghostcrab_workspace_create.
4. Capture the domain as provisional goals, steps, and constraints with ghostcrab_project.
5. Store stable examples and decisions with ghostcrab_remember.
6. Use ghostcrab_upsert for current-state trackers with stable record_id facets.
7. Inspect schemas with ghostcrab_schema_list and ghostcrab_schema_inspect before relying on schema-specific structure.
8. Export with ghostcrab_workspace_export_model only when another tool needs a contract.

Do not invent define_* architect tools. Do not require a separate architect server.
Do not freeze schema on the first pass unless the user explicitly asks for a canonical model.
```

---

## Workspace First

Use the workspace as the boundary for all later records.

```text
ghostcrab_workspace_list()

if "acme-demo" is absent:
  ghostcrab_workspace_create(
    id="acme-demo",
    label="ACME Demo",
    description="Local workspace for SDK agent memory experiments."
  )
```

After creation, seed the work with provisional project entries:

```text
ghostcrab_project(
  scope="acme-demo",
  proj_type="GOAL",
  content="Track payment import reliability across SDK agent runs.",
  provisional=True
)
```

---

## Model from Evidence

Before deciding on a schema, collect examples:

| Artifact | Tool |
|---|---|
| Stable domain rule | `ghostcrab_remember` |
| Current task or run state | `ghostcrab_upsert` |
| Active goal or constraint | `ghostcrab_project` |
| Dependency or blocker | `ghostcrab_learn` |
| Existing schema inventory | `ghostcrab_schema_list` |
| Specific schema details | `ghostcrab_schema_inspect` |

Good provisional facets:

```json
{
  "workspace_id": "acme-demo",
  "record_id": "task:payment-import",
  "kind": "task_state",
  "status": "blocked"
}
```

---

## Late Schema Check

Only move toward schema-specific records when the workflow has repeated enough to justify it.

```text
1. ghostcrab_schema_list(summary_only=True)
2. ghostcrab_schema_inspect(schema_id="<candidate>")
3. compare the candidate fields with real stored examples
4. keep using provisional records if the fit is unclear
5. export the workspace model if another system needs a contract
```

Use `ghostcrab_workspace_export_model` for synthetic data generators, documentation, or integration tests that need a JSON contract.

---

## Quality Rules

- Prefer stable `record_id` facets over labels.
- Keep workspace IDs lowercase and durable.
- Put facts in `ghostcrab_remember`; put latest status in `ghostcrab_upsert`.
- Preserve transition rationale when replacing current state.
- Use `ghostcrab_learn` for dependencies only after the relationship is clear.
- Treat an empty workspace as normal on first run.

---

## Failure Modes

| Failure | Response |
|---|---|
| Workspace already exists | Reuse it. Do not create a near-duplicate. |
| Schema list is empty or irrelevant | Continue with provisional records and examples. |
| Exported model is too thin | Add more real examples with `ghostcrab_remember` and current-state records with `ghostcrab_upsert`. |
| GhostCrab is unavailable | Start `gcp brain up` separately and verify with `ghostcrab_status`. |

**PRO note:** mindBrain Pro can support centralized team modeling on PostgreSQL. This advanced Personal skill remains local-first and SQLite-backed.
