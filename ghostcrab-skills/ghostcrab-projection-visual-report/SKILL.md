---
name: ghostcrab-projection-visual-report
description: Transform GhostCrab/MindBrain materialized projection responses into visual, presentation-ready reports with KPI cards, timelines, deltas, heatmaps, evidence tables, provenance, and recommendations. Use when a user wants a projection report to be clearer, more narrative, more visual, or demo-ready.
---

# GhostCrab Projection Visual Report

Use this skill when the user provides or asks for a report based on a GhostCrab/MindBrain projection response such as `ghostcrab_projection_get`.

The skill's job is not to recompute the projection. It turns the projection response into a readable visual report.

## Input Contract

Preferred input is the direct output of:

```json
{
  "tool": "ghostcrab_projection_get",
  "workspace_id": "mindbrain-seo-audit",
  "projection_id": "proj_hreflang_crawl_integrity",
  "projection_results": [],
  "linked_evidence": [],
  "gsc_evidence": [],
  "deltas": [],
  "report": {}
}
```

If the response is not provided, call the configured GhostCrab Pro New MCP or CLI first. Use one GhostCrab surface only.

## Rules

- Treat `ProjectionResult`, `DeltaFinding`, and linked evidence as source of truth.
- Do not read original CSV/JSON export files to fill gaps unless the user explicitly asks.
- Preserve provenance from the projection response.
- Separate observed data from interpretation.
- Prefer compact visuals over long prose.
- Use projection-specific visual patterns when available.
- Keep terminology consistent with GhostCrab and MindBrain.

## Output Modes

Default to `markdown` unless the user asks for HTML, deck, or asset files.

- `markdown`: KPI strip, Mermaid timeline, tables, action cards.
- `html`: self-contained visual report using `assets/report-template.html`.
- `json`: normalized visual model for another renderer.

## Workflow

1. Confirm the payload came from `ghostcrab_projection_get` or retrieve it.
2. Normalize the payload into a visual model:
   - title
   - executive summary
   - timeline points
   - deltas
   - evidence rows
   - status/severity tokens
   - recommendations
   - provenance
3. Choose a visual pattern from `references/seo-projection-mapping.md`.
4. Render:
   - KPI cards for latest state and total delta.
   - Timeline for A0/A1/A2.
   - Projection-specific evidence visual.
   - Action plan.
   - Provenance block.
5. Sanity-check that labels and numbers match the source projection response.

## Fast Script

For repeatable output, use:

```bash
node ghostcrab-projection-visual-report/scripts/render_projection_report.mjs \
  --input projection-response.json \
  --format markdown
```

For HTML:

```bash
node ghostcrab-projection-visual-report/scripts/render_projection_report.mjs \
  --input projection-response.json \
  --format html \
  --output report.html
```

## Reference Files

- `references/seo-projection-mapping.md`: projection-specific visual patterns.
- `references/visual-patterns.md`: reusable report components.
- `references/report-copy-style.md`: tone and wording rules.

