# Audit facets, graphes et Roaring Bitmap

Date: 2026-05-31

Portee: `src/`, `bin/`, et lectures ciblees de `vendor/mindbrain` uniquement pour verifier le comportement reel des endpoints natifs appeles par les outils MCP/CLI.

Documents de reference:

- `docs/comprendre-memoire-mcp-facettes-ontologie-projections.md`
- `docs/comprendre-reindexation-ghostcrab.md`
- `docs/type_b_projections_expliquées_d8ce6e92.md`
- `.cursor/skills/optimizations-SKILL.md`

## Synthese

Le decoupage documente est globalement respecte: les facettes Type A (`agent_facts.facets_json`), les facettes Type B collection (`facet_tables`, `facet_definitions`, `facet_postings`) et le graphe (`graph_entity`, `graph_relation`, projections materialisees) ne sont pas melanges au hasard. `ghostcrab_search` reste un outil de memoire/facettes Type A, `ghostcrab_projection_get` lit les snapshots Type B materialises, et les reindex graph/collection deleguent bien au backend natif quand disponible.

En avocat du diable, il reste trois points a corriger ou mesurer:

1. `ensureSearchFtsCaughtUp()` contient une reference SQL invalide a `facets.doc_id`, ce qui peut empecher le rattrapage incremental FTS des nouveaux faits.
2. `ghostcrab_combined_search` a un fallback collection-facets qui n'envoie ni `table_id`, ni `namespace`, ni `dimension`; le backend ne peut donc pas utiliser `facet_postings` Roaring dans ce chemin.
3. `ghostcrab_graph_search` delegue a un endpoint natif qui scanne et trie les entites de graphe candidates en memoire. Les Roaring bitmaps d'adjacence (`graph_lj_out`/`graph_lj_in`) sont utilises par `graph_path`, mais pas par cette recherche textuelle d'entites (ni par `traverse`/`subgraph`, qui font des JOIN SQL sur `graph_relation`).

## Verdict par couche

| Couche | Etat | Commentaire |
| --- | --- | --- |
| Facettes Type A, `agent_facts` | OK avec bug FTS incremental | Le scope workspace est preserve dans `ghostcrab_search`, mais le catch-up FTS peut echouer silencieusement. |
| Facettes Type B collection | OK dans l'outil dedie, incomplet dans `combined_search` | `ghostcrab_collection_facet_search` peut atteindre Roaring; `combined_search` force le fallback brut. |
| Graphe raw/derive | OK pour reindex/traverse, risque pour graph search | Reindex natif reconstruit l'adjacence Roaring; search entites reste O(N) sur le workspace. |
| Projections Type B | Semantique OK, risque indexation | `projection_get` lit des snapshots materialises. A surveiller sur gros volumes a cause des filtres JSON. |
| CLI `gcp` | Correct mais peut induire une reindexation insuffisante | `gcp load` default `--reindex graph`; pour facettes collection/Roaring il faut explicitement `--reindex all` avec les bons IDs. |

## Findings

### P1 - Bug SQL dans le rattrapage FTS des faits

Fichier: `src/db/facets-fts-search.ts:71`

`ensureSearchFtsCaughtUp()` insere depuis `agent_facts`, mais les deux sous-requetes `NOT EXISTS` comparent avec `facets.doc_id`:

- `src/db/facets-fts-search.ts:78-85`
- `src/db/facets-fts-search.ts:91-98`

Il n'y a pas d'alias `facets` dans ces requetes. La fonction attrape ensuite toutes les erreurs sans les remonter (`catch { ... }` plus bas), ce qui rend le defaut discret. Impact probable: les faits inseres apres le bootstrap FTS peuvent ne pas etre visibles dans le chemin BM25/native hybrid jusqu'a une reconstruction complete.

Complexite actuelle: le chemin voulu est un rattrapage incremental O(delta), mais en pratique il peut tomber en erreur et degrader la fraicheur de recherche.

Correction recommandee: remplacer `facets.doc_id` par `agent_facts.doc_id` ou aliaser explicitement `agent_facts AS f` et utiliser `f.doc_id`; ajouter un test unitaire cible pour `ensureSearchFtsCaughtUp()` qui insere un fait apres bootstrap et verifie `search_documents`, `search_fts_docs`, puis `search_fts`.

Risque: faible. C'est une correction locale de reference SQL.

### P1 - `combined_search` contourne le chemin Roaring des facettes collection

Fichier: `src/tools/search/combined-search.ts:275`

Quand le graphe et les facettes Type A ne donnent rien, `ghostcrab_combined_search` appelle `runStandaloneCollectionFacetSearch()` avec seulement:

- `workspaceId`
- `collectionId`
- `value`
- `limit`

Voir `src/tools/search/combined-search.ts:281-289`.

Or l'outil dedie `ghostcrab_collection_facet_search` expose bien `table_id`, `namespace` et `dimension` et les transmet au backend (`src/tools/facets/collection-search.ts:69-79`). Cote backend natif, le chemin Roaring `facet_postings` n'est pris que si des postings existent et si `namespace` et `dimension` sont fournis (`vendor/mindbrain/src/standalone/reindex_http.zig:346-360`). Sans ces parametres, le backend retombe sur `facet_assignments_raw`.

Complexite actuelle du fallback `combined_search`: recherche brute dans les assignations, dependante du volume de `facet_assignments_raw` dans la collection.

Complexite attendue apres correction: intersection/iteration par bitmap Roaring sur la dimension facetee ciblee, beaucoup plus stable quand la collection grandit.

Correction recommandee:

- soit ajouter `collection_facet_table_id`, `collection_facet_namespace`, `collection_facet_dimension` aux inputs de `ghostcrab_combined_search`;
- soit resoudre automatiquement le `table_id`/facet cible depuis la collection et l'ontologie quand l'intention est claire;
- soit retirer ce fallback de `combined_search` et diriger l'appelant vers `ghostcrab_collection_facet_search` quand la recherche demande une facette collection precise.

Test recommande: etendre `tests/tools/combined-search.test.ts` pour verifier que le fallback collection transmet les parametres permettant `source: "facet_postings"` quand ils sont fournis.

Risque: moyen. Il faut eviter de casser le contrat simple de `combined_search`; une approche additive est preferable.

### P2 - `ghostcrab_graph_search` scanne et trie les entites candidates en memoire

Fichier natif verifie: `vendor/mindbrain/src/standalone/http_app.zig:3412`

L'outil MCP `src/tools/dgraph/graph-search.ts` delegue au backend natif. Dans le backend, `loadGhostcrabGraphSearchEntities()` selectionne les entites du workspace, applique `collection_id` et `metadata_filters`, puis filtre `entity_types` et calcule le score texte en Zig. La requete SQL n'a pas de `LIMIT` avant le calcul de score et le tri final se fait sur tous les candidats conserves (`vendor/mindbrain/src/standalone/http_app.zig:3422-3498`).

Les Roaring bitmaps sont bien utilises ailleurs pour l'adjacence graphe: `getOutgoingEdges()` et `getIncomingEdges()` lisent `graph_lj_out`/`graph_lj_in`, et `rebuildAdjacency()` reconstruit ces tables (`vendor/mindbrain/src/standalone/graph_sqlite.zig:327-343`, `vendor/mindbrain/src/standalone/graph_sqlite.zig:2024-2070`). Donc le probleme n'est pas "Roaring absent partout"; c'est specifiquement la recherche textuelle d'entites.

Complexite actuelle: environ O(N * T * M + N log N) sur les entites du workspace candidates, ou N est le nombre d'entites, T le nombre de termes, M la taille moyenne des champs testes.

Correction recommandee:

- ajouter une table FTS5 ou un index de recherche pour `graph_entity` (`name`, `entity_type`, eventuellement champs metadata materialises);
- pousser `entity_types` dans la clause SQL quand la liste est fournie;
- ajouter des indexes/expression indexes pour les filtres JSON frequents (`collection_id`, `projection_id`, `metric`) ou materialiser ces colonnes;
- utiliser un top-K borne si le ranking reste applicatif.

Roaring n'est pas forcement la bonne primitive pour cette recherche texte. Il devient pertinent si on maintient des postings par type d'entite, collection, tags/proprietes frequentes, ou par termes normalises.

Risque: moyen a eleve selon la migration choisie. Commencer par index SQL/FTS et benchmarker avant d'ajouter une nouvelle couche bitmap.

### P2 - Projections Type B correctes mais dependantes de filtres JSON

Fichier: `src/tools/pragma/projection-get.ts:85`

`ghostcrab_projection_get` lit bien une projection materialisee par `projection_id`, et ne pretend pas faire une requete graphe live. Le contrat correspond aux docs: les `ProjectionResult` et `DeltaFinding` sont des snapshots.

Point a surveiller: le backend filtre les projections via `graph_entity.metadata_json` (`projection_id`, `metric`, collection). Sur gros volumes, ces filtres JSON doivent etre indexes ou materialises. Sinon le cout ressemble a une recherche partielle sur `graph_entity`.

Correction recommandee: ajouter ou verifier des indexes d'expression SQLite pour les cles projection les plus frequentes, ou materialiser `projection_id`/`projection_metric` si les projections deviennent un chemin chaud.

Risque: faible tant que les volumes de projections restent limites; moyen pour des collections massives.

### P2 - `gcp load` default reindex graph, pas collection-all

Fichier: `bin/commands/load.mjs:101`

Pour les backup bundles, `gcp load` parse `--reindex none|graph|all` avec `graph` par defaut (`bin/commands/load.mjs:101-147`) et transmet les options natives (`bin/commands/load.mjs:205-230`). C'est coherent pour restaurer le graphe rapidement, mais insuffisant si l'utilisateur s'attend a ce que les `facet_postings` collection soient rebuildes automatiquement.

Impact: apres un load par defaut, le graphe peut etre a jour alors que les recherches facettes collection peuvent rester sur donnees brutes ou postings absents. Le help mentionne le default graph, mais n'explique pas assez le lien avec Roaring/facet_postings.

Correction recommandee:

- documenter dans le help que `--reindex graph` ne reconstruit pas les postings collection;
- recommander `--reindex all --collection-id ... --table-id ...` pour restaurer un bundle qui doit servir les facettes collection via Roaring;
- eventuellement detecter dans le bundle la presence de facettes collection et afficher un warning si `--reindex graph` est conserve.

Risque: faible. Changement CLI/documentation ou warning non bloquant.

### P3 - `gcp brain document` ne rend pas le besoin de reindex assez visible

Fichier: `bin/commands/brain-document.mjs:30`

La commande document forwarde correctement vers le moteur natif et injecte `--db` pour les sous-commandes qui utilisent la base (`bin/commands/brain-document.mjs:62-69`, `bin/commands/brain-document.mjs:118-129`). Mais le help/UX ne rend pas assez explicite le cycle "qualification/import -> reindex collection/all -> recherche Roaring".

Impact: un utilisateur peut qualifier des documents et interroger ensuite les facettes sans comprendre pourquoi le chemin rapide `facet_postings` n'est pas utilise.

Correction recommandee: ajouter au help de `gcp brain document` une note courte sur la commande de reindex a lancer apres `document-qualify` ou les imports qui alimentent `facet_assignments_raw`.

Risque: faible.

## Points positifs verifies

- `ghostcrab_search` garde bien la separation Type A: il retourne `searched_layers: ["facets"]` et exclut explicitement `graph_entity`, `graph_relation`, `projection_result`.
- `ghostcrab_search` transmet `FACETS_SEARCH_TABLE_ID` au backend natif et refiltre les resultats par `workspace_id`.
- `ghostcrab_collection_facet_search` est le bon outil quand on connait `collection_id`, `table_id`, `namespace`, `dimension`; il peut atteindre `source: "facet_postings"`.
- `ghostcrab_graph_reindex` prefere `/reindex/graph` et expose `adjacency_rebuilt`; son fallback SQL avertit que `graph_lj_out`/`graph_lj_in` ne sont pas reconstruits.
- Seul `graph_path` utilise les tables d'adjacence Roaring (`graph_lj_out`/`graph_lj_in`) cote natif ; `traverse` et `subgraph` parcourent `graph_relation` via des JOIN SQL.
- `ghostcrab_projection_get` correspond au modele documente des projections materialisees.

## Priorites de correction

1. Corriger `ensureSearchFtsCaughtUp()` et ajouter le test unitaire. C'est le bug le plus local et le plus susceptible de creer des faux negatifs de recherche.
2. Decider le contrat `combined_search` pour les facettes collection: soit ajouter les parametres qui activent Roaring, soit ne pas masquer l'outil dedie.
3. Ajouter un warning/help CLI autour de `gcp load --reindex graph` vs `--reindex all`.
4. Mesurer `ghostcrab_graph_search` sur une base volumineuse, puis choisir FTS/index SQL/top-K avant d'introduire des bitmaps supplementaires.
5. Verifier les indexes JSON/expression pour les projections Type B si elles deviennent un chemin interactif frequent.

## Tests et benchmarks recommandes

- `npm run test -- tests/unit/facets-fts-sync.test.ts` apres ajout du test `ensureSearchFtsCaughtUp`.
- `npm run test -- tests/tools/combined-search.test.ts` apres evolution du fallback collection.
- Test d'integration natif avec une collection reindexee: appeler `ghostcrab_collection_facet_search` avec `table_id`, `namespace`, `dimension` et verifier `source: "facet_postings"`.
- Benchmark simple sur `ghostcrab_graph_search`: 10k, 100k, 1M entites synthetiques, mesure p50/p95 et memoire, avec et sans `entity_types`.

## Conclusion

L'architecture est saine dans ses frontieres principales: les facettes, le graphe et les projections ne sont pas confondus. Le probleme n'est pas un mauvais modele global, mais des chemins secondaires qui contournent les optimisations documentees ou masquent une erreur. Le plus urgent est de reparer le rattrapage FTS et d'eviter que `combined_search` donne l'illusion d'utiliser les facettes collection optimises alors qu'il ne fournit pas les parametres necessaires au chemin Roaring.
