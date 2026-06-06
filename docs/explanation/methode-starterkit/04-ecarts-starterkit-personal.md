# 04 — Écarts StarterKit ↔ Personal (avocat du diable)

Document de **contestation constructive** : ce qui, dans [`starter-kit-ghostcrab-perso`](../../../../starter-kit-ghostcrab-perso/starterkit/README.md), ne doit **pas** être lu comme description du runtime `ghostcrab-personal-mcp`, et ce que nos explications architecture couvrent **sans** équivalent StarterKit.

---

## Contradictions internes au StarterKit

| Document | Affirmation | Contredit |
|----------|-------------|-----------|
| ~~QUICKSTART L39~~ | ~~PostgreSQL only~~ | **Résolu** : [`EDITIONS.md`](../../../../starter-kit-ghostcrab-perso/starterkit/EDITIONS.md) + QUICKSTART routeur |
| QUICKSTART Phase A | Docker + `make dev-bootstrap` + smoke 24 tools | Personal : binaire MindBrain + SQLite fichier, 52 outils enregistrés dont 12 listés par défaut |
| SOP1 §2 | Inventaire 24 outils (marketplace, patch, geo…) | Personal : surface différente ; certains anciens noms sont absents, d'autres fonctions sont « extended » via `ghostcrab_tool_search` |
| SOP3 | COPY PostgreSQL bulk | Personal : pas de COPY ; bundle / CLI / MCP |

**Lecture saine :** lire `EDITIONS.md` → suivre uniquement [`personal-mcp/SOP_SEQUENCE.md`](../../../../starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP_SEQUENCE.md). QUICKSTART = routeur seulement.

| Écart | Statut |
|-------|--------|
| Une seule séquence SOP mélangée (DDL/COPY/mindCLI) | **Résolu** — tracks `personal-mcp/` et `pro-mcp/` |

---

## Ce que le StarterKit sur-estime

### 1. « Smoke test vert = MCP sain »

Phase A exige 24 outils visibles. En Personal :

- le nombre listé par défaut est **12** ;
- l'étendu complet requiert `ghostcrab_tool_search` ou `gcp tools list` ;
- un backend SQLite peut être sain avec un catalogue différent du Pro.

**Test Personal recommandé :** `ghostcrab_status` + familles status / remember / learn / graph_search / pack / graph_reindex — pas un décompte magique.

### 2. « import_facets.mjs a importé »

Le script génère un plan `ghostcrab_upsert` en **dry-run** ; `--write` est refusé. Sans exécution MCP explicite, Gate 5 est une **simulation documentée**, pas une preuve DB.

### 3. « consumer_contract HTTP = graphe OK »

Le template [`consumer_contract.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/consumer_contract.yaml) appelle `/api/graph/*` (ex. port 5174). Personal headless peut ne **pas** exposer cette UI :

- les checks MCP graphe restent valides ;
- les checks HTTP peuvent échouer sans que `graph_entity` soit vide.

### 4. « Gate 7 projections = domaine modélisé »

Gate 7 teste pack/scopes — **Type A** seulement. Un pack riche avec graphe vide reste possible ([`consumer_contract`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/consumer_contract.yaml) L53).

---

## Ce que le StarterKit sous-estime (Personal va plus loin)

| Sujet | StarterKit | Explications architecture Personal |
|-------|------------|-----------------------------------|
| Trois sens « facets » | surtout faits agent | A/B/C dans [03](../03-memoire-mcp-facettes-graphe-projections.md) |
| Qualification docs | peu formalisée | `facet_assignments_raw`, `collection_reindex` [04](../04-reindexation-ghostcrab.md) |
| Type B | absent des gates | [05 § Type B](../05-projections-expliquees.md) |
| Reindex raw→runtime | Gate 6 partiel | `reindexBm25/Facets/Graph`, auto FTS agent [04](../04-reindexation-ghostcrab.md) |
| Confusion « projection » ×3 | 2 usages (pack vs graph query) | Type A, Type B, reindex interne [05](../05-projections-expliquees.md) |

Auditer Personal **uniquement** avec SOP5 laisse des angles morts documentaires et Type B.

---

## Table de traduction (ne pas copier-coller les noms Pro)

| StarterKit / Pro | Personal | Erreur si confondu |
|------------------|----------|-------------------|
| `mfo_facets` | `agent_facts` | chercher dans `facet_tables` |
| « import facets » Gate 5 | upsert → `agent_facts` | croire que `facet_postings` collection est rempli |
| `graph.entity` | `graph_entity` | requêtes SQL Pro sur Personal |
| Layer 1 workspace PG schema | workspace_id SQLite | migrations DDL Pro inapplicables |
| `ghostcrab_coverage` ≥ 80 % | seuil lab / ontologie | exiger 80 % sur un workspace vide de sémantique |

---

## Gitignore et versioning

Toute la série architecture + StarterKit vit dans [`docs/explanation/`](../) (versionnée git). Plus de dossier `mcp-explanation/` séparé.

---

## Checklist avocat du diable (avant de dire « cohérent »)

- [ ] J'ai identifié le backend réel (SQLite Personal vs PostgreSQL Pro)
- [ ] J'ai séparé Gate 5 (faits), Gate 6 (graphe), Gate 7 (Type A), pipeline Type B
- [ ] Je n'ai pas utilisé `pack` comme preuve graphe
- [ ] Après qualify docs, j'ai prévu `collection_reindex`
- [ ] Après raw SQL, j'ai prévu `graph_reindex`
- [ ] Je n'attends pas que Type B suive un learn
- [ ] Les scripts StarterKit sont en dry-run jusqu'à exécution MCP explicite
- [ ] Les checks HTTP consumer sont optionnels si pas de graph viewer

---

## Verdict

Le StarterKit et les explications Personal sont **compatibles en méthode** (gates, mapping, consumers séparés) mais **non interchangeables en runtime** (tables, ingest, outillage).

Utiliser le StarterKit comme **protocole d'audit** et Personal/docs 03–05 comme **modèle de données et de fraîcheur** — pas l'inverse.

Retour : [README](README.md)
