# 05 — Confirmer ou infirmer les explications (StarterKit × Personal)

Documents audités : [03](../03-memoire-mcp-facettes-graphe-projections.md), [04](../04-reindexation-ghostcrab.md), [05](../05-projections-expliquees.md).

Sources StarterKit : [`personal-mcp/SOP5`](../../../../starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP5_structured_import.md), [`consumer_contract.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/consumer_contract.yaml), [`personal-mcp/SOP1`](../../../../starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP1_ghostcrab_mcp.md).

---

## Matrice de réconciliation

| Affirmation (docs 03–05) | StarterKit | Code Personal | Verdict |
|--------------------------|------------|---------------|---------|
| MCP = modélisation, requête, petites écritures ; bulk hors MCP | SOP1 §1.2 « MCP ≠ hot-path » ; SOP5 batch + COPY | CLI `gcp brain`, bundle ; MCP learn/remember unitaire | **Confirmée** |
| Faits agent dans **`agent_facts`** | Gate 5 « import facets » → `ghostcrab_upsert` | `remember.ts` → `/api/mindbrain/facts/write` | **Confirmée** (vocabulaire Pro : `mfo_facets`) |
| `facet_assignments_raw` ≠ faits agent | Gates séparent facets import vs graph | tables distinctes | **Confirmée** — StarterKit ne documente pas bien la couche collection |
| Graphe runtime = `graph_entity` / `graph_relation` | Gate 6, consumer `native_graph` | idem + raw mirror | **Confirmée** |
| `FACT/GOAL/STEP/CONSTRAINT` = Type A, pas nœuds graphe | Gate 7 projections | `project.ts` enum `proj_type` | **Confirmée** |
| `ghostcrab_pack` ne valide pas le graphe | `readiness_rules` L53–54 | `pack.ts` lit projections + `agent_facts` | **Confirmée** — StarterKit l'explicite mieux que nos docs |
| `ghostcrab_projection_get` ≠ requête graphe live | Gate 7 ne mentionne pas Type B | `projection-get.ts` filtre `ProjectionResult` | **Confirmée** — StarterKit sous-spécifie Type B |
| Graphe change → projections stale | Gate 7 après Gate 6, pas de sync auto | aucun trigger | **Confirmée** |
| Raw change → reindex obligatoire | Gate 6 implique matérialisation | `graph-reindex.ts`, SOP5 options SQLite PERSO | **Confirmée** |
| Projections Type B refreshed by `graph_reindex` | non traité | reindex ignore `ProjectionResult` contenu | **Confirmée** (par absence) |
| « 24 outils ghostcrab_* » = runtime sain | QUICKSTART Phase A | ~50 registered, 12 listed | **Non applicable** à Personal — voir [04](04-ecarts-starterkit-personal.md) |
| PostgreSQL-only | QUICKSTART L39 | SQLite standalone | **Infirmée** pour ce repo (SOP5 Gate 0 contredit QUICKSTART) |

---

## Ce que le StarterKit confirme fortement

### 1. Validation par couche, pas par un seul outil

SOP5 enchaîne gates 5 → 6 → 7 → 8. Aucune gate ne remplace les autres.

Checks typiques par couche :

| Couche | Outils / scripts |
|--------|------------------|
| Faits agent | `ghostcrab_search`, `ghostcrab_count`, `ghostcrab_pack` |
| Graphe | `validate_graph_contract.mjs`, `ghostcrab_graph_search`, traverse |
| Projections Type A | `ghostcrab_pack` par scope |
| Consommateurs | `validate_consumer_contract.mjs` |

### 2. Mapping avant import

Gates 2–4 imposent `source_profile` + `mapping_external_to_canonical` + dry-run. Confirme que « MCP qualifie tout » est une simplification : ontologie → mapping → import → reindex → lecture.

### 3. Projections = contrat de lecture

Gate 7 + `consumer_contract` : projections testent la **synthèse agent**, pas la complétude structurelle du graphe.

---

## Ce que le StarterKit infirme ou ne couvre pas

### 1. Trois sens du mot « facets » (Personal)

StarterKit parle surtout de « facets » au sens **faits agent** (Gate 5). Il ne formalise pas :

- **B** — moteur `facet_tables` / BM25 ;
- **C** — `facet_assignments_raw` + `collection_reindex`.

→ Les explications [03](../03-memoire-mcp-facettes-graphe-projections.md) vont **au-delà** du StarterKit ; le kit ne suffit pas seul pour auditer un pipeline documentaire Personal.

### 2. Type B (`ProjectionResult`)

StarterKit Gate 7 = pack / scopes. Pas de gate pour `ghostcrab_projection_get`, `PROVEN_BY`, `DeltaFinding`.

→ Audit Type B : tests code ([`projection-get.test.ts`](../../../tests/tools/projection-get.test.ts)), pas SOP5 tel quel.

### 3. Noms de tables Pro vs Personal

| StarterKit / Pro | Personal |
|------------------|----------|
| `mfo_facets` | **`agent_facts`** |
| `mfo_projections` | **`projections`** |
| `graph.entity` | **`graph_entity`** |
| `graph.relation` | **`graph_relation`** |
| extensions `pg_facets`, `pg_dgraph` | moteur Zig + SQLite |

### 4. Scripts ≠ exécution automatique

`import_facets.mjs` produit un plan `ghostcrab_upsert` en dry-run. Sans relecture humaine + exécution MCP, Gate 5 ne passe pas « tout seul ».

---

## Règle de décision

> Cette explication prédit-elle **quelle table change**, **quel outil voit le changement**, et **quel consommateur** doit être revalidé ?

Si oui → opérationnelle. Si elle n'utilise qu'un mot générique (« mémoire », « facette », « projection ») → trop vague ; compléter avec SOP5 Gate + doc 04/05.

---

## Avocat du diable — pièges d'interprétation

| Piège | Réalité |
|-------|---------|
| « Le StarterKit a validé mon import » | Il a validé des **rapports JSON** de scripts — pas forcément la DB de production |
| « consumer_contract vert = domaine OK » | Un consumer `ghostcrab-agent` peut passer sans `native_graph` |
| « SOP3 COPY a marché sur Pro » | Ne transpose pas sur SQLite Personal sans adapter gates 5–6 |
| « Gate 5 a rempli le graphe » | Gate 5 = faits agent ; graphe = Gate 6 explicitement |
| « pack contient le métier » | pack = Type A + faits ; métier live = outils graphe |

Suite : [03 — Parcours import](03-parcours-import-source.md) · [04 — Écarts](04-ecarts-starterkit-personal.md)
