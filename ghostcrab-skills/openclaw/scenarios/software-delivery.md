# OpenClaw Scenario: Software Delivery

## Guided

1. `Use ghostcrab_status, then inspect the software-delivery activity family and its projection recipe.`
2. `Use ghostcrab_search with schema_id="demo:software-delivery:pull-request" and filters={"status":"blocked"}.`
3. `Use ghostcrab_traverse from start="pull-request:software-delivery:pr-204" with outbound BLOCKS edges.`
4. `Use ghostcrab_pack for release-2026-04 and summarize the next safe release action.`

## Semi-Autonomous

`Je veux suivre un petit flux de livraison logicielle dans GhostCrab, avec ce qui avance, ce qui bloque, et ce qu'il faut verifier avant la prochaine mise en ligne, sans en faire une usine a gaz.`
