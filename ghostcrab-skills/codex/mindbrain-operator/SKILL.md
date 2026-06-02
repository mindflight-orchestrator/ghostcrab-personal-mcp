---
name: mindbrain-operator
description: Convert natural-language business or operations questions into deterministic mindCLI workflows on MindBrain workspaces. Use when a user asks for a status, review, risk analysis, operational answer, workspace investigation, or "what exists / what can answer this" in MindBrain Pro, especially when the user does not know projection, facet, graph, edge, Type A, or Type B terminology.
---

# MindBrain Operator

## Purpose

Translate a user's business question into a mindCLI investigation. Treat the user request as a business intent first, then discover the MindBrain surfaces that can answer it.

Use mindCLI as the operator surface. Do not switch to direct SQL for this workflow unless the user explicitly requests SQL or asks to debug the database outside mindCLI.

## Workflow

1. Resolve runtime context:
   - Identify `workspace_id`, business question, requested output format, and any named projection/scope.
   - If `GHOSTCRAB_DSN` is available, run mindCLI with `DATABASE_URL="$GHOSTCRAB_DSN"`.
   - If the mindCLI repo path is unknown, locate `cmd/mindcli/main.go` with `rg --files` or ask only if it cannot be found.

2. Start with projection discovery, even when the user did not say "projection":
   ```bash
   cd <mindbot-repo>
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projections list --workspace <workspace_id>
   ```

3. Match the question to candidates:
   - Prefer exact `scope`, `label`, or `business_question` matches.
   - Otherwise compare user terms to `required_schemas`, `required_facets`, `required_edges`, and `retrieval_jobs`.
   - If multiple candidates match, explain the top choices and choose the one with the closest business question.

4. Get the selected projection contract:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projection get --scope <scope>
   ```

5. Pack context when useful:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma inspect --user <agent_id> --query "<question>" --limit 12
   ```

6. Decide the next skill:
   - Use `mindbrain-projection-reviewer` to explain projection readiness.
   - Use `mindbrain-evidence-discovery` when a projection contract is not enough and evidence must be mapped.
   - Use `mindbrain-json-answer-builder` when the user needs a stable JSON response.
   - Use `mindbrain-gap-auditor` when the answer is not yet supported or appears incomplete.

## Interpretation Rules

- Explain Type A and Type B in plain language only when needed:
  - Type A: declared question contract in `mb_pragma.projections`.
  - Type B: calculated snapshot or report, usually a `ProjectionResult`.
- If mindCLI returns only a projection contract, say that clearly. Do not pretend it proves live task, milestone, or evidence rows.
- Treat `status: active` as runtime projection status. Treat "materialized" from external docs as model/audit language unless mindCLI returns that field.
- Preserve the commands used in the final answer so the user can replay the investigation.

## Output

Return a short human explanation plus a compact command transcript. If JSON is requested, delegate shape construction to `mindbrain-json-answer-builder`.
