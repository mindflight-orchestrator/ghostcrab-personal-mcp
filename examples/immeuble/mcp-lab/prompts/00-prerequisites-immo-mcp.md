# Prerequisites — MCP lab immeuble (workspace `immo-mcp`)

**Phase 0 — read only, no writes.**

Variant of [`00-prerequisites.md`](00-prerequisites.md) with fixed IDs for workspace `immo-mcp`. Config: [`../workspace-immo-mcp.json`](../workspace-immo-mcp.json).

## Human pre-flight (before opening the agent)

1. **GhostCrab backend** reachable (`ghostcrab_status` must respond).
2. **MCP `ghostcrab-personal-mcp`** enabled in Cursor — same SQLite as this lab (see below).
3. **Single SQLite file** — do **not** use a separate `immo-mcp.sqlite`. Cursor MCP (`.cursor/mcp.json`) starts:

```text
gcp brain up --db /home/dlamotte/Documents/ghostcrab-personal-mcp/data/ghostcrab.sqlite
```

Lab process data lives in workspace **`immo-mcp`** inside that file. Golden reference uses workspace **`immeuble-demo`** in the **same** file.

For CLI commands outside Cursor, align explicitly:

```bash
export GHOSTCRAB_SQLITE_PATH="/home/dlamotte/Documents/ghostcrab-personal-mcp/data/ghostcrab.sqlite"
# optional: gcp brain db-who  → must show the same path
```

4. **Golden workspace** (phase 06 comparison only — never load into `immo-mcp`):

```bash
export GHOSTCRAB_SQLITE_PATH="/home/dlamotte/Documents/ghostcrab-personal-mcp/data/ghostcrab.sqlite"
node bin/gcp.mjs load examples/immeuble/reference/bundle.json \
  --workspace immeuble-demo --reindex all \
  --db "$GHOSTCRAB_SQLITE_PATH"
```

MCP and CLI must target the **same** `--db` / `GHOSTCRAB_SQLITE_PATH` for the whole lab.

## Two workspaces, one SQLite — comparison model

| Workspace | Role |
|-----------|------|
| **`immo-mcp`** | What GhostCrab MCP **built** from corpus (phases 2–5) |
| **`immeuble-demo`** | What we **expect** — golden from `bundle.json` (load in phase 6 only) |

Both live in **`ghostcrab.sqlite`**. Phase 6 compares `immo-mcp` (process) vs `immeuble-demo` (reference) vs [`success-criteria.yaml`](../success-criteria.yaml). See [`06-validate-and-compare-immo-mcp.md`](06-validate-and-compare-immo-mcp.md).

**Never** load the bundle into `immo-mcp`.

## Run identifiers

| Field | Value |
|-------|-------|
| `workspace_id` | `immo-mcp` |
| `collection_id` | `immo-mcp::docs` |
| `ontology_id` | `immeuble-demo::core` |
| `golden_workspace_id` | `immeuble-demo` |
| `golden_bundle` | `examples/immeuble/reference/bundle.json` |
| `corpus` | `examples/immeuble/mcp-lab/corpus/` (8 md files) |
| `criteria` | `examples/immeuble/mcp-lab/success-criteria.yaml` |
| `sqlite_path` | `/home/dlamotte/Documents/ghostcrab-personal-mcp/data/ghostcrab.sqlite` (Cursor MCP `--db`) |

## Tools

1. `ghostcrab_status`
2. `ghostcrab_modeling_guidance`

## Agent prompt (copy-paste)

```
Tu es un agent GhostCrab MCP en session vierge. Ta mission : reconstruire le domaine
syndic belge (Résidence Les Tilleuls + Les Érables) depuis le corpus brut, en suivant
strictement le MCP lab documenté.

## Documentation de référence (lire en premier)

1. docs/explanation/mcp-lab-context.md — contexte, phases 00→06, critères
2. examples/immeuble/mcp-lab/README.md — point d'entrée opérationnel
3. examples/immeuble/mcp-lab/prompts/00-prerequisites-immo-mcp.md — démarrage (ce fichier)

## Identifiants de cette run

| Champ | Valeur |
|-------|--------|
| workspace_id | immo-mcp |
| collection_id | immo-mcp::docs |
| ontology_id | immeuble-demo::core |
| golden_workspace_id | immeuble-demo |
| golden_bundle | examples/immeuble/reference/bundle.json |
| corpus | examples/immeuble/mcp-lab/corpus/ (8 fichiers md) |
| critères | examples/immeuble/mcp-lab/success-criteria.yaml |
| sqlite_path | /home/dlamotte/Documents/ghostcrab-personal-mcp/data/ghostcrab.sqlite |

## Règles absolues

- Appeler ghostcrab_status en PREMIER.
- Lire avant d'écrire : count → search → pack (ou graph_search pour le graphe).
- NE PAS charger le bundle golden dans immo-mcp — le golden (immeuble-demo) sert
  uniquement à comparer en phase 06.
- Phases 00–01 : lecture seule — aucune écriture.
- Avant toute écriture (phases 02–05) : produire un Model Proposal (entités, arêtes,
  facettes, questions de compétence) et ATTENDRE ma confirmation explicite
  (ONBOARDING_CONTRACT §9).
- Ingestion documentaire : CLI gcp brain document (pas streaming MCP unitaire).
- Outils graph/gap extended : découvrir via ghostcrab_tool_search si absents du défaut.

## Workflow — exécuter dans l'ordre

Phase 0 — examples/immeuble/mcp-lab/prompts/00-prerequisites-immo-mcp.md
  → ghostcrab_status, ghostcrab_modeling_guidance
  → lire corpus/manifest.json, success-criteria.yaml, reference/scenarios.yaml

Phase 1 — prompts/01-discovery-and-model-proposal.md
  → affiner le Model Proposal depuis le corpus (toujours sans écriture)

GATE : stop et présente le Model Proposal. N'écris rien tant que je n'ai pas confirmé.

Phase 2 — prompts/02-ontology-register.md (après confirmation)
  → ghostcrab_workspace_create + ghostcrab_workspace_use (immo-mcp)
  → gcp brain ontology compile sur ontologies/immeuble-demo/core.yaml

Phase 3 — prompts/03-gap-rules-design.md
  → ghostcrab_graph_gap_rules_import (réf. training/reference gap-rules)

Phase 4 — prompts/04-document-ingest.md
  → gcp brain document : collection-create, ingest 8 corpus, profile, qualify

Phase 5 — prompts/05-graph-extraction.md
  → ghostcrab_learn (incrémental) OU document-business-extract (batch)

Phase 6 — prompts/06-validate-and-compare-immo-mcp.md
  → ghostcrab_graph_search, ghostcrab_graph_diagnostics vs success-criteria.yaml
  → comparer immo-mcp (process) vs immeuble-demo (bundle golden), même SQLite

## Livrables attendus par phase

- Phase 0–1 : Model Proposal textuel
- Phase 2–5 : rapport court (ce qui a été écrit, outils utilisés, counts)
- Phase 6 : tableau écart vs success-criteria.yaml + recommandations

## Commence maintenant

1. ghostcrab_status
2. Résume mcp-lab-context.md en 5 lignes
3. Lis corpus/manifest.json et success-criteria.yaml
4. Propose un premier Model Proposal (sans écrire)
```

## Required reading

- `corpus/manifest.json`
- `success-criteria.yaml`
- `../../reference/scenarios.yaml`
- `../workspace-immo-mcp.json`

## Deliverable

Model Proposal textuel (entités, arêtes, facettes, competency questions couvertes).

## Gate

**Confirmation humaine requise** — reply **« je confirme »** (or corrections) before `01-discovery-and-model-proposal.md` refinement and before any write phases (ONBOARDING_CONTRACT §9).

**Do not load** `examples/immeuble/reference/bundle.json` into workspace `immo-mcp`.

## Docs if blocked

| Topic | File |
|-------|------|
| MCP vs CLI per phase | [`docs/explanation/how-ghostcrab-mcp-achieves-it.md`](../../../docs/explanation/how-ghostcrab-mcp-achieves-it.md) |
| Ontology + gap-rules | [`docs/explanation/02-mcp-ontologie-gap-rules.md`](../../../docs/explanation/02-mcp-ontologie-gap-rules.md) |
| Projections vs graph | [`docs/explanation/05-projections-expliquees.md`](../../../docs/explanation/05-projections-expliquees.md) |

## Next

→ [`01-discovery-and-model-proposal.md`](01-discovery-and-model-proposal.md)
