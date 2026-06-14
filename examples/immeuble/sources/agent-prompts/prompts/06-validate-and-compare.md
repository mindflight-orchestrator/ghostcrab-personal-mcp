# Validate and compare

**Phase 6 — compare LLM workspace against reference (controlled parity).**

## Tools

- `ghostcrab_graph_diagnostics`
- `ghostcrab_graph_search`
- `ghostcrab_traverse`
- `ghostcrab_count` (if available)

## Agent prompt

```
Compare le workspace `immeuble` contre les seuils dans `examples/immeuble/success-criteria.yaml`
et la référence `examples/immeuble/bundle/immeuble.bundle.json` (workspace immeuble).

Checks :
1. Entity counts par type (buildings=2, units=13, cellars=13, lease_contracts=5, …)
2. Relation counts par edge_type (contains, owns, occupies, leases, assigned_cellar, …)
3. Quotités = 1000 par immeuble
4. graph_search : appartement (≥13), Dupont, bail, CODA, jardin
5. ghostcrab_graph_diagnostics avec `examples/immeuble/gap-rules/L2-syndic-filtered.json`
   (adapter workspace_id à `immeuble`) → missing_required_relations ≤ 0 si graphe complet

Rapport markdown :
  | Check | Expected | Actual | Status (OK/GAP/FP) |
  Drill-down traverse sur max 3 écarts.
```

## Report template

```markdown
# Immeuble MCP lab — comparison report

## Summary
- Status: pass | fail
- Workspace: immeuble
- Golden ref: immeuble

## Entity counts
| type | expected | actual | ok |

## Relation counts
| edge | expected | actual | ok |

## Diagnostics (L2)
- missing_required_relations: …

## Gaps (max 3)
1. …
```

## Automated alternative

```bash
node scripts/import-immeuble-demo-llm.mjs --mode mock --reset
# → reports/immeuble-demo-llm/<timestamp>/report.md
```

## Done

Lab complete when success-criteria thresholds pass or gaps are documented with remediation plan.
