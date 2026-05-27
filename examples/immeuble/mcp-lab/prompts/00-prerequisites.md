# Prerequisites — MCP lab immeuble

**Phase 0 — read only, no writes.**

## Tools

1. `ghostcrab_status`
2. `ghostcrab_modeling_guidance`

## Agent prompt (copy-paste)

```
Je veux reconstruire le domaine syndic belge "Résidence Les Tilleuls + Les Érables"
depuis le corpus brut dans examples/immeuble/mcp-lab/corpus/.
Workspace cible : immeuble-demo-llm.
Référence de validation : examples/immeuble/reference/ (bundle golden immeuble-demo).

Ne charge pas le bundle golden dans le workspace LLM — compare seulement à la fin.
Propose un Model Proposal (entités, relations, facettes documentaires) avant toute écriture.
```

## Required reading

- `corpus/manifest.json`
- `success-criteria.yaml`
- `../reference/scenarios.yaml`
- `workspace.json`

## Deliverable

Model Proposal textuel (entités, arêtes, facettes, competency questions couvertes).

## Gate

**Confirmation humaine requise** avant de passer à `01-discovery-and-model-proposal.md` puis aux phases d'écriture (ONBOARDING_CONTRACT §9).

## Next

→ [`01-discovery-and-model-proposal.md`](01-discovery-and-model-proposal.md)
