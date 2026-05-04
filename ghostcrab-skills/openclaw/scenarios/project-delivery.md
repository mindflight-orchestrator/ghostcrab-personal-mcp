# OpenClaw Scenario: Project Delivery

## Guided

1. `Use ghostcrab_status, then inspect the closest activity family and modeling recipe for workflow tracking.`
2. `Use ghostcrab_search with schema_id="demo:project-delivery:task" and filters={"status":"in_progress"}. Return only the active task facts.`
3. `Use ghostcrab_traverse from start="task:project-delivery:seed-scenarios" with outbound ENABLES edges.`
4. `Use ghostcrab_pack for the project-delivery scope and summarize the next execution step without guessing.`

## Semi-Autonomous

`J'ai besoin d'utiliser GhostCrab pour suivre un chantier qui va s'etaler sur plusieurs etapes, avec des sujets qui se bloquent, des passages de relais, et des priorites qui vont surement bouger. Je ne sais pas encore comment le structurer. Je veux surtout pouvoir reprendre proprement apres quelques jours sans y toucher.`
