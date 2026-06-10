# Answer artifact kinds (Personal SQLite)

Route agents by **`artifact_kind`** first. Legacy Type A/B names are wire-compat only.

**Discovery:** call **`ghostcrab_projections_list`** before choosing a read tool when the user asks what projections exist or you do not yet know `artifact_id` / `projection_id`. Guide: [docs/reference/projections-discovery.md](../../docs/reference/projections-discovery.md).

| `artifact_kind` | Storage | Discovery | Read tools |
| --- | --- | --- | --- |
| `analysis_plan` | table `projections` | `ghostcrab_projections_list` | `ghostcrab_pack`, `ghostcrab_project`, `ghostcrab_artifact_get` |
| `live_answer_view` | `mindbrain_answer_artifacts` | `ghostcrab_projections_list` | `ghostcrab_live_refresh`, `ghostcrab_artifact_get`, `gcp brain artifact refresh` |
| `answer_snapshot` | `graph_entity` (`ProjectionResult`) | `ghostcrab_projections_list` | `ghostcrab_projection_get`, `ghostcrab_artifact_get` |
| `evidence_pack` | `mindbrain_answer_artifacts` | `gcp brain artifact list --kind evidence_pack` | `ghostcrab_artifact_get` |

**Legacy:** Type A → `analysis_plan` · Type B → `answer_snapshot`. `live_answer_view` is not Type B.

**`proj_type`** on `ghostcrab_project`: `FACT` | `GOAL` | `STEP` | `CONSTRAINT` — not `NOTE` (pack ranking only).

**Not answer artifacts:** `graph_data_gap`, `graph_conflict`, `coverage_gap`, `answerability_gap`, `graph_gap_rule` — see [GAP_TAXONOMY.md](GAP_TAXONOMY.md).

**Graph live queries** are not projections — use `ghostcrab_graph_search`, `ghostcrab_traverse`, `ghostcrab_combined_search`.
