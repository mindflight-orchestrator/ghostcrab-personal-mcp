# Glossaire GhostCrab Personal (SQLite)

> Version française — English: [en/glossary.md](en/glossary.md)

Vocabulaire canonique pour [explications](README.md), [méthodologie](../methodology/fr/universal_methodology.md), [skills](../../ghostcrab-skills/) et StarterKit Personal. Voir aussi [ontologie LinkML/OWL2](ontology/README.md) et [catalogue opérateur](../reference/operator-catalog.md).

---

## Ontologie (LinkML / OWL2) — sens formel

| Terme | Définition Personal | Équivalent Pro (si différent) |
|-------|---------------------|-------------------------------|
| **Ontologie** | Schéma formel **LinkML** sous `ontologies/`, compilé en slice JSON / **N-Triples OWL2**, importé dans `ontology_*` | Même principe ; extensions `pg_*` possibles |
| **Profil plateforme** | `ontologies/ghostcrab/profile.yaml` — patterns PROV, temps, preuve | idem |
| **Tranche domaine** | `ontologies/<workspace>/core.yaml`, id `\<workspace\>::core` | idem |
| **Compile ontologie** | `gcp brain ontology compile` (dry-run puis `--import-db`) | idem ou outillage Pro |

**Ce n'est pas une ontologie OWL :** les schémas `ghostcrab:task`, `ghostcrab:note`, etc. enregistrés via `ghostcrab_schema_register` (registre MCP pour `agent_facts`).

---

## Trois sens de « facets »

| Sens | Terme préféré | Table / API | Outils |
|------|---------------|-------------|--------|
| **A — Faits agent** | faits agent, mémoire MCP | `agent_facts` | `ghostcrab_remember`, `ghostcrab_upsert`, `ghostcrab_search` |
| **B — Index documentaire** | moteur de faceting | `facet_tables`, `facet_postings` | dérivé de reindex / documents |
| **C — Vocabulaire ontologique** | taxonomies LinkML | `ontology_*`, `facet_assignments_raw` | `gcp brain ontology`, `document-qualify` |

Le champ JSON `facets` sur un fait agent = **filtre**, pas l'index Roaring (sens B).

Détail : [03 — Mémoire MCP](03-memoire-mcp-facettes-graphe-projections.md).

---

## Couches mémoire MCP

| Couche | Stockage | Outils principaux |
|--------|----------|-------------------|
| **Session** | mémoire process MCP | `ghostcrab_workspace_use` |
| **Faits durables** | `agent_facts` | `remember`, `upsert`, `search`, `count` |
| **Mémoire de travail** | `projections` (Type A) | `project`, `pack` |
| **Graphe métier** | raw + `graph_entity` | `learn`, `graph_search`, `traverse`, `graph_reindex` |
| **Snapshot rapport** | `ProjectionResult` (Type B) | `projection_get` |

---

## Projections

| Terme | Type | Stockage | Read / write |
|-------|------|----------|--------------|
| **Projection Type A** | mémoire de travail agent | table `projections` | `ghostcrab_project` / `ghostcrab_pack` |
| **Projection Type B** | snapshot matérialisé | `graph_entity` (`ProjectionResult`) | `ghostcrab_projection_get` |
| **Requête graphe** | *pas* une projection | `graph_entity` domaine | `graph_search`, `traverse`, … |

Détail : [05 — Projections expliquées](05-projections-expliquees.md).

---

## Réindexation

| Terme | Définition |
|-------|------------|
| **Raw** | `entities_raw`, `relations_raw`, `documents_raw`, `chunks_raw` |
| **Runtime** | `graph_entity`, `graph_relation`, index FTS/BM25 |
| **Reindex graphe** | `ghostcrab_graph_reindex` ou `gcp brain structured-import reindex --scope graph` |
| **Reindex collection** | `ghostcrab_collection_reindex` — documents → search |

Détail : [04 — Réindexation](04-reindexation-ghostcrab.md).

---

## Termes autorisés (Personal)

- `agent_facts`, `projections`, `ProjectionResult`
- `ghostcrab_*` (outils MCP)
- `gcp brain …` (CLI opérateur)
- `ontology_*`, `GHOSTCRAB_SQLITE_PATH`
- LinkML, OWL2, N-Triples

---

## Termes Pro-only ou dépréciés (Personal)

| Terme | Remplacement Personal |
|-------|------------------------|
| `mindCLI`, `mindbot` | outils MCP + `gcp brain` |
| `DATABASE_URL`, `GHOSTCRAB_DSN` | `GHOSTCRAB_SQLITE_PATH`, `--db` |
| `mb_pragma.agent_facts` | table `agent_facts` |
| `mb_pragma.projections` | table `projections` |
| `mfo_*`, `pg_*` (extensions) | voir [EDITIONS](../../starter-kit-ghostcrab-perso/starterkit/EDITIONS.md) |

---

## Éditions produit

| | Personal | Pro |
|-|----------|-----|
| Repo | `ghostcrab-personal-mcp` | `ghostcrab-mcp` |
| Stockage | SQLite | PostgreSQL |
| Matrice complète | [StarterKit EDITIONS.md](../../starter-kit-ghostcrab-perso/starterkit/EDITIONS.md) | idem |
