---
name: mindbrain-evidence-discovery
description: Discover which MindBrain dimensions, facets, graph edges, projections, and evidence paths can support a natural-language business answer through mindCLI. Use when a projection contract is not enough, when the user asks what data exists, what can be searched, which facets or edges matter, or how to move from a business question to evidence-backed JSON.
---

# MindBrain Evidence Discovery

## Purpose

Map a business question to evidence candidates before producing an answer. This skill is for the investigation layer between a projection contract and a final response.

Use mindCLI as the operator surface. Do not jump to direct SQL for discovery.

## Discovery Order

1. Identify business dimensions:
   - time: week, date, horizon, sprint, period
   - organization: owner, agent, team, role
   - domain: chantier, supply, HR, BIM, CRM, finance, quality
   - object: task, milestone, zone, delivery, alert, decision, invoice
   - state: status, risk, progress, readiness, confidence

2. List available projections for the workspace:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projections list --workspace <workspace_id>
   ```

3. Select candidate projections by comparing:
   - `business_question`
   - `required_schemas`
   - `required_facets`
   - `required_edges`
   - `retrieval_jobs`

4. Get the strongest candidates:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projection get --scope <scope>
   ```

5. Pack context for the user question:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma inspect --user <agent_id> --query "<question>" --limit 12
   ```

6. If mindCLI exposes graph or recall commands for the current database, inspect help before running them:
   ```bash
   go run ./cmd/mindcli graph --help
   go run ./cmd/mindcli recall --help
   go run ./cmd/mindcli pg query --help
   ```
   Use only commands that succeed against the configured MindBrain database.

## Evidence Map

Produce an evidence map with these fields:

```json
{
  "dimensions": [],
  "candidate_projections": [],
  "selected_projection": null,
  "required_schemas": [],
  "required_facets": [],
  "required_edges": [],
  "mindcli_pack_rows": [],
  "evidence_status": "unknown",
  "next_queries": []
}
```

Use `evidence_status` values:

- `projection_only`: only the Type A contract was found.
- `pack_context`: mindCLI returned related rows through inspect/project.
- `snapshot_available`: a calculated projection result is available.
- `insufficient`: the command output does not support the requested answer.
- `command_gap`: mindCLI does not currently expose the needed evidence path.

## Guardrails

- Do not treat required facets or edges as proof that rows exist.
- Do not claim a graph traversal happened unless a mindCLI graph command returned evidence.
- If `recall` or another command fails due to database shape, report the mindCLI error and route to `mindbrain-gap-auditor`.
- Preserve all successful mindCLI commands in the final answer.
