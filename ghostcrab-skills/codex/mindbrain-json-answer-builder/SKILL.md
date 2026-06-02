---
name: mindbrain-json-answer-builder
description: Build stable, explicit JSON answers from mindCLI outputs for MindBrain workspaces. Use when the user asks for JSON, a machine-readable response, API-ready output, demo payloads, projection review JSON, evidence maps, or a structured answer that separates observed data, inferred interpretation, missing evidence, and mindCLI commands used.
---

# MindBrain JSON Answer Builder

## Purpose

Convert mindCLI command outputs into a stable JSON object that is honest about what was observed, inferred, missing, or unsupported.

Use this after `mindbrain-operator`, `mindbrain-projection-reviewer`, or `mindbrain-evidence-discovery`.

## JSON Contract

Use this top-level shape unless the user provides a stricter schema:

```json
{
  "workspace_id": "",
  "question": "",
  "answer_status": "",
  "matched_projection": null,
  "required_dimensions": [],
  "required_schemas": [],
  "required_facets": [],
  "required_edges": [],
  "mindcli_commands_used": [],
  "observed_data": [],
  "inferences": [],
  "missing_evidence": [],
  "answer_summary": "",
  "next_actions": []
}
```

## Field Rules

- `answer_status` must be one of:
  - `projection_contract_found`
  - `evidence_found`
  - `snapshot_found`
  - `partial`
  - `not_answerable_yet`
  - `command_failed`
- `matched_projection` should include `id`, `agent_id`, `scope`, `label`, `proj_type`, `status`, `weight`, and `created_at` when available.
- `observed_data` must contain only values directly returned by mindCLI.
- `inferences` must contain derived interpretations, each with a short basis.
- `missing_evidence` must name what would be needed to strengthen the answer.
- `mindcli_commands_used` must include command strings or command descriptors, not hidden shell history.

## Projection Contract Handling

When `projection get` returns a Type A contract, encode it as:

```json
{
  "kind": "declared_projection",
  "business_question": "",
  "retrieval_jobs": [],
  "timelapse_weeks": []
}
```

Do not convert `required_facets` or `required_edges` into proof rows. They belong in requirements unless another mindCLI command returned evidence.

## Output Rules

- Return valid JSON when the user asks for JSON only.
- If the user asks for explanation too, put JSON first, then a short human explanation.
- Avoid null-heavy output. Omit optional nested fields when empty, but keep the top-level contract stable.
- If a command failed, include the error in `observed_data` or `missing_evidence` and set `answer_status` to `command_failed` or `partial`.
