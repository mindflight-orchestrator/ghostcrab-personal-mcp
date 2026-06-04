# Méthode StarterKit pour vérifier les explications MCP

Ce dossier audite les explications architecture ([03](../03-memoire-mcp-facettes-graphe-projections.md) → [04](../04-reindexation-ghostcrab.md) → [05](../05-projections-expliquees.md)) en les confrontant au **StarterKit externe** et au **code de ce repo**.

**StarterKit de référence :** [`starter-kit-ghostcrab-perso`](../../../../starter-kit-ghostcrab-perso/starterkit/README.md).

**Séquence Personal (canon) :** [`personal-mcp/SOP_SEQUENCE.md`](../../../../starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP_SEQUENCE.md) — Pro : [`pro-mcp/SOP_SEQUENCE.md`](../../../../starter-kit-ghostcrab-perso/starterkit/pro-mcp/SOP_SEQUENCE.md).

## Deux optiques

| Optique | But | Document |
|---------|-----|----------|
| **Précision** | Traduire SOP5, scripts et templates du StarterKit vers le runtime Personal SQLite | [02 — Méthode StarterKit](02-methode-starterkit.md), [04 — Parcours import](04-parcours-import-source.md) |
| **Avocat du diable** | Lister ce que le StarterKit affirme à tort, ou ce que Personal ne couvre pas | [05 — Écarts StarterKit ↔ Personal](05-ecarts-starterkit-personal.md) |

## Rôle du StarterKit (précis)

D'après [`starterkit/README.md`](../../../../starter-kit-ghostcrab-perso/starterkit/README.md) :

- **Companion repo** — pas un fork GhostCrab, pas un outil de déploiement
- Fournit **SOP0 → SOP4 → SOP1 → SOP2 → SOP3/SOP5**, templates YAML, scripts Node `starterkit/scripts/*.mjs`
- Workflow : **Phase A** (env) → **B0** (choix ontologie) → **Phase B** (modèle LinkML ou MCP) → **Phase C** (vault) / **C2.0** (choix tabulaire) / **Phase C2** (structured-import CLI ou scripts SOP5)

Le StarterKit est une **méthode de cadrage et de validation par gates**, pas la source de vérité du runtime `ghostcrab-personal-mcp`.

## Runtime Personal vs cible Pro du StarterKit

| Aspect | StarterKit (SOP1 / QUICKSTART) | `ghostcrab-personal-mcp` (ce repo) |
|--------|--------------------------------|-------------------------------------|
| Stockage | PostgreSQL 17, extensions `pg_*` | SQLite MindBrain standalone |
| Faits agent | `mfo_facets` | **`agent_facts`** + `facets_json` |
| Projections | `mfo_projections` | **`projections`** (Type A) |
| Graphe | `graph.entity` / `graph.relation` | **`graph_entity`** / **`graph_relation`** + raw |
| Outils MCP | inventaire ~24 (SOP1 §2) | **~50 enregistrés**, 12 listés par défaut |
| Bulk ingest | COPY PostgreSQL, SQL direct | CLI `gcp brain`, bundle load, pas COPY |
| Qualification docs | peu documentée | **`facet_assignments_raw`** → `collection_reindex` |

Série architecture : [03](../03-memoire-mcp-facettes-graphe-projections.md) · [04](../04-reindexation-ghostcrab.md) · [05](../05-projections-expliquees.md)

## Lecture recommandée

| Question | Document |
|----------|----------|
| Les explications 03/04/05 sont-elles défendables ? | [01 — Audit](01-audit-explications-actuelles.md) |
| Quelle méthode apporte le StarterKit (SOP, gates, scripts) ? | [02 — Méthode StarterKit](02-methode-starterkit.md) |
| LinkML vs MCP et structured-import vs scripts ? | [06 — Voies import](06-voies-import-ontologie-et-tabulaire.md) |
| Qu'est-ce que le StarterKit confirme ou infirme ? | [03 — Confirmer / infirmer](03-confirmer-infirmer-les-explications.md) |
| Parcours import source → tables → consommateurs | [04 — Parcours import](04-parcours-import-source.md) |
| Où le StarterKit trompe ou ne s'applique pas tel quel ? | [05 — Écarts](05-ecarts-starterkit-personal.md) |

## Verdict court

Les explications architecture séparent correctement faits agent, qualification documentaire, graphe raw/runtime, projections Type A et snapshots Type B.

Le StarterKit ajoute un protocole d'audit **par consommateur** :

1. vérifier le runtime (`ghostcrab_status`) ;
2. profiler la source (`source_profile.yaml`) ;
3. mapper avant d'écrire (`mapping_external_to_canonical.yaml`) ;
4. dry-run → `pending_review` / `pending_ddl` ;
5. importer puis **tester chaque couche séparément** (faits, graphe, projections) ;
6. rejouer `consumer_contract.yaml` — un check vert ne couvre pas les autres couches.

**Nuance clé** ([`consumer_contract.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/consumer_contract.yaml) L52–54) : un `ghostcrab_pack` OK **ne prouve pas** qu'un graph viewer ou un graphe métier complet est prêt.
