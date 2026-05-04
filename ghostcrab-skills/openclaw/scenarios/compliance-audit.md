# OpenClaw Scenario: Compliance Audit

## Guided

1. `Use ghostcrab_status, then inspect the compliance-audit activity family and KPI patterns.`
2. `Use ghostcrab_search with schema_id="demo:compliance-audit:obligation" and filters={"status":"gap"}.`
3. `Use ghostcrab_traverse from start="task:compliance-audit:delete-workflow" with outbound HAS_GAP edges.`
4. `Use ghostcrab_pack for compliance-audit and summarize the blocker without guessing.`

## Semi-Autonomous

`Je veux utiliser GhostCrab pour suivre un audit de conformite sur plusieurs sessions. Je veux garder les obligations importantes, les preuves utiles, les points de blocage et ce qu'il faut verifier ensuite, sans figer le modele trop tot.`
