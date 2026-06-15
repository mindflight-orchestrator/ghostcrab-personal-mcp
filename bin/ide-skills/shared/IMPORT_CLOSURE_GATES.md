# Import closure gates (Personal)

Summary of starter-kit SOP5 gates relevant to projection and consumer audit. Full runbook: `{starterkit}/personal-mcp/SOP5_structured_import.md` — resolve `{starterkit}` via [STARTERKIT_PATHS.md](./STARTERKIT_PATHS.md).

| Gate | Purpose | Agent / operator check |
| --- | --- | --- |
| 0 | Workspace ready | `ghostcrab_status`, active workspace |
| 1–6 | Model + mapping + apply | `gcp brain structured-import validate/apply/reindex` |
| **7** | Projection smoke | `ghostcrab_projections_list`, `ghostcrab_pack`, `ghostcrab_projection_get` on declared scopes |
| **8** | Consumer contract | `consumer_contract.yaml` — required projections / tools |
| **9** | Pipeline audit | import manifest + `audit_import_pipeline` dry-run |

## Gate 7 (projection smoke)

After bulk import, list projections with `ghostcrab_projections_list`, then verify declared `analysis_plan` scopes return pack rows and optional `answer_snapshot` bundles load via `ghostcrab_projection_get`.

Use **`ghostcrab-projection-reviewer`** for human-readable readiness narrative.

## Gate 8–9 (closure)

- Consumers must pass with `requires.projections: true` where configured.
- Post-import: run projection audit script (starter-kit) then **`ghostcrab-gap-auditor`** for remediation JSON.

## Phase B1 before import

Prepare projection catalogue (candidates → human validation → `ghostcrab_project`) before gate 7 expectations make sense. See [ARTIFACT_KINDS.md](ARTIFACT_KINDS.md).
