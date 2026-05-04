# OpenClaw Scenario: Incident Response

## Guided

1. `Use ghostcrab_status, then inspect the incident-response modeling and projection recipes.`
2. `Use ghostcrab_search with schema_id="demo:incident-response:event" and filters={"status":"active"}.`
3. `Use ghostcrab_traverse from start="service:incident-response:cache-cluster" with outbound BLOCKS edges.`
4. `Use ghostcrab_pack for runbook-cache and summarize only what the incident data supports.`

## Semi-Autonomous

`Je veux utiliser GhostCrab pour suivre des incidents recurrents sans perdre le fil entre deux sessions. Je veux garder les symptomes observes, les impacts, les blocages et la prochaine action utile, sans partir tout de suite dans un schema fige.`
