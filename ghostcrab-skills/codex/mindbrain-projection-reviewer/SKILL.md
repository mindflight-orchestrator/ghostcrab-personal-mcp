---
name: mindbrain-projection-reviewer
description: Review an existing MindBrain projection returned by mindCLI and explain its purpose, readiness, required dimensions, facets, edges, schemas, and operational limits. Use when a user asks to review, validate, understand, or explain a projection, scope, business question, Type A contract, Type B snapshot, or projection readiness on a MindBrain workspace.
---

# MindBrain Projection Reviewer

## Purpose

Review projection output for humans who may not know MindBrain internals. Convert raw mindCLI JSON into a business-readable readiness review.

Use mindCLI as the source of truth. Do not use direct SQL as a fallback in this skill.

## Required Commands

List workspace projections:

```bash
cd <mindbot-repo>
DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projections list --workspace <workspace_id>
```

Get a projection:

```bash
DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projection get --scope <scope>
```

Optionally inspect context:

```bash
DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma inspect --user <agent_id> --query "<business question>" --limit 12
```

## Review Checklist

1. Identify the projection:
   - `id`
   - `agent_id`
   - `scope`
   - `label`
   - `proj_type`
   - `status`
   - `weight`
   - `created_at`

2. Explain the business question:
   - Restate what the projection is meant to answer.
   - Name the operational audience: manager, coordinator, finance, supply, quality, HR, etc.

3. Explain collection requirements:
   - `required_schemas`: entity families the answer needs.
   - `required_facets`: dimensions and fields the answer needs.
   - `required_edges`: graph relations the answer needs.
   - `retrieval_jobs`: answer mode such as summary, monitor, aggregate, graph traversal.

4. Distinguish capability from proof:
   - Declared projection present: the system knows the question and retrieval contract.
   - Context pack present: the system can retrieve related projection/fact rows.
   - Snapshot present: the system has a calculated result to report.
   - Evidence absent: do not claim live operational facts are proven.

5. State readiness:
   - `Ready`: projection found, active, complete contract, and relevant pack or evidence available.
   - `Contract ready`: projection found and active, but output is only a Type A contract.
   - `Needs evidence`: projection exists but task/facet/edge proof has not been surfaced.
   - `Gap`: no matching projection or missing required dimensions.

## Output Format

Use this concise structure:

- Projection reviewed
- What it answers
- Data it expects
- What mindCLI proved
- What mindCLI did not prove
- Recommended next command or skill

When the user asks for JSON, return the review as JSON or delegate to `mindbrain-json-answer-builder`.
