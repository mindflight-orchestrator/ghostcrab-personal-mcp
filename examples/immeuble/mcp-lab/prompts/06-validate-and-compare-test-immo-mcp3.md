# Validate and compare — workspace `test-immo-mcp3`

**Phase 6 — compare MCP lab retry vs golden reference (same SQLite, two workspaces).**

Config: [`../workspace-test-immo-mcp3.json`](../workspace-test-immo-mcp3.json). Baseline report: [`../reports/06-compare-test-immo-mcp2.md`](../reports/06-compare-test-immo-mcp2.md).

## Workspaces

| Workspace | Role |
|-----------|------|
| **`test-immo-mcp3`** | Process — 9 corpus docs, live extract, no bundle |
| **`immeuble-demo`** | Reference — golden `bundle.json` |

## Agent prompt (copy-paste)

```
Phase 6 — compare test-immo-mcp3 vs immeuble-demo vs success-criteria.yaml.

SQLite: /home/dlamotte/Documents/ghostcrab-personal-mcp/data/ghostcrab.sqlite
Process: test-immo-mcp3 (9 docs including groupes-facturation.md)
Reference: immeuble-demo

Checks:
- Entity counts vs success-criteria.yaml core + golden_stretch (billing_group, shared_space)
- ghostcrab_graph_search "appartement" ≥ 13
- ghostcrab_graph_diagnostics ontology test-immo-mcp3::core → missing_required_relations ≤ 0
- Document gaps: billing_group, shared_space, edge vocabulary

Deliverable: reports/06-compare-test-immo-mcp3.md
```
