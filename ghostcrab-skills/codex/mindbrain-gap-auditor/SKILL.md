---
name: mindbrain-gap-auditor
description: Audit gaps between a natural-language MindBrain question and the evidence currently available through mindCLI. Use when a projection is missing, a Type A contract exists without evidence, required facets or graph edges are not verified, a Type B snapshot is absent, a mindCLI command fails, or the user asks what needs to be added or adjusted to make an operational answer reliable.
---

# MindBrain Gap Auditor

## Purpose

Explain why a MindBrain question is not fully answerable yet and propose concrete adjustments. Keep the distinction between declared capability and observed evidence sharp.

Use mindCLI output as evidence. Do not switch to direct SQL as a hidden fallback.

## Gap Categories

Classify gaps with these labels:

- `no_projection`: no matching projection exists for the business question.
- `projection_contract_only`: a Type A projection exists, but no evidence rows or calculated snapshot were surfaced.
- `missing_dimensions`: expected business dimensions are absent or unclear.
- `missing_facets`: required facets are absent, unpopulated, or not exposed through mindCLI output.
- `missing_edges`: required graph edges are absent, unverified, or not traversed.
- `missing_snapshot`: no Type B calculated result is available.
- `command_surface_gap`: mindCLI lacks or fails the command needed to inspect the evidence path.
- `ambiguous_intent`: several projections match and the user intent needs narrowing.

## Audit Workflow

1. Capture the user question and workspace.
2. Run or reuse:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projections list --workspace <workspace_id>
   ```
3. If a candidate exists, run:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma projection get --scope <scope>
   ```
4. If an agent is available, run:
   ```bash
   DATABASE_URL="$GHOSTCRAB_DSN" go run ./cmd/mindcli --json mb_pragma inspect --user <agent_id> --query "<question>" --limit 12
   ```
5. Compare the requested answer to:
   - available projection contract
   - required schemas
   - required facets
   - required edges
   - returned pack rows or snapshots
   - command failures

## Output Format

Return:

```json
{
  "workspace_id": "",
  "question": "",
  "gap_status": "",
  "matched_projection": null,
  "gaps": [],
  "adjustments": [],
  "mindcli_commands_used": [],
  "recommended_next_test": ""
}
```

Each `gaps` entry should include:

```json
{
  "category": "",
  "severity": "low|medium|high",
  "evidence": "",
  "impact": ""
}
```

Each `adjustments` entry should be specific:

- Add or update a projection contract.
- Add required facets to a projection.
- Add graph edge requirements.
- Create a calculated snapshot pipeline.
- Expose a mindCLI command or template for the missing evidence path.
- Add a test prompt to validate future behavior.

## Guardrails

- Do not label a projection ready if only the contract exists and the user asked for live operational facts.
- Do not require Type B snapshots for every use case. Some demos only need Type A contracts, but say that explicitly.
- Prefer "next test" over vague recommendations.
