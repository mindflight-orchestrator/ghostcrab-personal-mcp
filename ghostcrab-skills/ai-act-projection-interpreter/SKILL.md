---
name: ai-act-projection-interpreter
description: Interpret AI Act MindCLI projection JSON into precise human-facing compliance answers. Use when rendering ai-act obligation_cascade, penalty_path, exemption_surface, or sector_risk_profile results, especially for demos where every answer must be cited, scoped, and faithful to the returned rows.
metadata:
  short-description: Render AI Act projection results
---

# AI Act Projection Interpreter

Use this skill when a user asks to explain, summarize, render, or validate JSON returned by MindCLI templates for the `ai-act` workspace.

## Core Rule

MindCLI output is the source of truth. Do not invent obligations, penalties, exemptions, dates, or legal basis not present in the returned rows.

If a row lacks `source_ref`, `source_article`, or `legal_basis`, say the projection result is incomplete and flag it as a quality issue.

## Rendering Workflow

1. Identify the template from the request, file name, or row shape:
   - `ai_act_obligation_cascade`
   - `ai_act_penalty_path`
   - `ai_act_exemption_surface`
   - `ai_act_sector_risk_profile`
2. Load only the needed reference:
   - Output contract: `references/projection-output-contract.md`
3. Produce a human answer with four parts:
   - short answer
   - grouped/actionable findings
   - cited legal basis
   - quality checks
4. Keep `facet_path` hidden unless the user asks for debug or trace details.

## Required Human Output

For every answer:

- State the row count.
- State whether all rows have usable citations.
- Group rows by the most helpful human dimension.
- Cite each source as `Article N - Title` or the exact returned `source_ref`.
- Preserve the returned wording in `answer_item` for obligations and exemptions.

## Template-Specific Guidance

### Obligation Cascade

Use for: "Quelles obligations pour un provider high-risk ?"

Render as a compliance checklist grouped by `obligation_type`, then by article.

Always include:

- total obligations
- `legal_effect` distribution
- top obligation families
- deadline summary
- sample or full checklist depending on user request

Quality checks:

- all rows should have `legal_effect=obligation`
- all rows should have `operator_compliance_scope` in `operator`, `mixed`, or `general`
- all rows should have `source_ref`

### Penalty Path

Use for: "Quelle sanction pour une pratique interdite ?"

Render as a penalty answer with:

- maximum EUR amount
- turnover percentage
- penalty tier
- source article

Do not generalize beyond the returned tier.

### Exemption Surface

Use for: "Quelles exemptions a l'Article 6 ?"

Render only explicit exceptions/derogations returned by the projection.

Always show:

- exception text
- `legal_effect`
- `conditionality_type`
- article source

If no rows are returned, say no explicit exemption was returned by this projection for the selector.

### Sector Risk Profile

Use for: "Mon CRM de recrutement est-il high-risk ?"

Render by category/use case:

- category label
- sector
- risk level
- source

If a sector includes both `high_risk` and `prohibited`, call out the prohibited branch separately.

## Deterministic Renderer

For repeatable demos, prefer:

```bash
python3 skills/ai-act-projection-interpreter/scripts/render_projection.py \
  --template ai_act_obligation_cascade \
  --json out/reports/demo_obligation_cascade_provider_high_risk.json
```

The script emits Markdown and performs basic quality checks.
