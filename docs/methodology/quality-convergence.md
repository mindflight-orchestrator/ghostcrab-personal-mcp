# Quality Convergence Workflow

GhostCrab exposes MindBrain's native quality convergence pipeline as MCP tools.
The intended loop is:

1. Run a convergence analysis.
2. Inspect the persisted run report.
3. List proposed remediation actions.
4. Let the assistant refine or reject proposals.
5. Approve selected actions.
6. Apply only allow-listed actions.
7. Re-run convergence and compare the next report.

## MCP Tools

- `ghostcrab_quality_convergence_run`: create a report, persisted by default.
- `ghostcrab_quality_convergence_list`: list prior runs for a workspace.
- `ghostcrab_quality_convergence_get`: retrieve one persisted report.
- `ghostcrab_quality_remediation_actions`: list proposed actions for a run.
- `ghostcrab_quality_remediation_decide`: approve or reject an action.
- `ghostcrab_quality_remediation_apply`: execute an approved action when supported.

## Validation Boundary

The MCP layer is intentionally an orchestration layer. It does not duplicate the
native ontology, coverage, diagnostics, or graph analysis logic. It delegates
analysis to MindBrain and keeps the assistant-facing workflow explicit.

## Apply Policy

The first apply implementation is conservative. It only executes approved
`diagnostic_only` actions whose proposed tool is `ghostcrab_graph_diagnostics`.
Other actions remain inspectable and decidable, but return
`unsupported_remediation_action` when applied.

This keeps the loop useful for assisted refinement while avoiding accidental
data rewrites before stricter tool-specific idempotency contracts are defined.

## IA-Assisted Refinement

Assistant refinement should operate on persisted runs and actions, not on
ephemeral chat state. A typical refinement step can merge duplicates, downgrade
low-confidence actions to manual review, reject weak evidence, approve
diagnostic-only actions, or propose a separate reprocessing plan.
