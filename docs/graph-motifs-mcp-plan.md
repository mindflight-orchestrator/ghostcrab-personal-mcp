# Graph motif rules — planned MCP surface (MindBrain §11)

Unary gap rules (`ghostcrab_graph_gap_rules_*`) express **single-hop cardinality**
checks per entity type. **Motif rules** express **multi-hop path constraints**
(e.g. building → all units → cellar, lease → unit → tenant).

MindBrain roadmap §11 defines backend storage, import, and diagnostics for motifs.
GhostCrab MCP tools will mirror the gap-rules pattern once §11 lands.

## Planned tools (not yet implemented)

| Tool | Access | Backend (planned) | Role |
|------|--------|-------------------|------|
| `ghostcrab_graph_motif_rules_import` | Write | `POST /api/mindbrain/graph/motif-rules/import` | Import motif path contracts (`replace` semantics like gap rules) |
| `ghostcrab_graph_motif_rules` | Read | `GET /api/mindbrain/graph/motif-rules` | List active motifs for ontology/workspace |
| `ghostcrab_graph_motif_rules_delete` | Write | `POST /api/mindbrain/graph/motif-rules/delete` | Delete motifs by `motif_id` |
| `ghostcrab_graph_motif_diagnostics` | Read | `GET /api/mindbrain/graph/motif-diagnostics` | Report motif path violations |

## Reference fixtures

- Training motifs: [`examples/immeuble/training/gap-rules/motifs.json`](../examples/immeuble/training/gap-rules/motifs.json)
- Curriculum module B3: [`examples/immeuble/training/README.md`](../examples/immeuble/training/README.md)
- MindBrain roadmap: [`vendor/mindbrain/Roadmap.md`](../vendor/mindbrain/Roadmap.md) §11

## Agent workflow (future)

1. Import unary gap rules (`ghostcrab_graph_gap_rules_import`) for L0–L3 cardinality.
2. Import motifs when §11 is available.
3. Run `ghostcrab_graph_diagnostics` for unary violations; `ghostcrab_graph_motif_diagnostics` for path violations.
4. Use `ghostcrab_coverage` only for ontology instantiation gaps (unchanged).

Until §11 ships, agents should not assume motif JSON in training fixtures is evaluable via MCP.
