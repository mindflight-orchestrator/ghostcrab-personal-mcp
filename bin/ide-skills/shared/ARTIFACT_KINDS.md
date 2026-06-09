# Answer artifact kinds (Personal SQLite)

Route agents by **`artifact_kind`** first. Legacy Type A/B names are wire-compat only.

| `artifact_kind` | Storage | Read tools |
| --- | --- | --- |
| `analysis_plan` | table `projections` | `ghostcrab_pack`, `ghostcrab_project` |
| `live_answer_view` | `mindbrain_answer_artifacts` | `ghostcrab_live_refresh`, `gcp brain artifact refresh` |
| `answer_snapshot` | `graph_entity` (`ProjectionResult`) | `ghostcrab_projection_get` |
| `evidence_pack` | `mindbrain_answer_artifacts` | `ghostcrab_artifact_get` |

**Legacy:** Type A → `analysis_plan` · Type B → `answer_snapshot`. `live_answer_view` is not Type B.

**`proj_type`** on `ghostcrab_project`: `FACT` | `GOAL` | `STEP` | `CONSTRAINT` — not `NOTE` (pack ranking only).

**Not answer artifacts:** `graph_data_gap`, `graph_conflict`, `coverage_gap`, `answerability_gap`, `graph_gap_rule` — see [GAP_TAXONOMY.md](GAP_TAXONOMY.md).

**Graph live queries** are not projections — use `ghostcrab_graph_search`, `ghostcrab_traverse`, `ghostcrab_combined_search`.
