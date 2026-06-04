# Matrice termes → tranche (MECE)

Traçabilité glossaire / explication / méthodologie vers les quatre tranches LinkML `ghostcrab-docs::*`.

| Terme (glossaire / doc) | Tranche | Classe / enum LinkML |
|-------------------------|---------|----------------------|
| Ontologie LinkML / OWL2 | import-paths | `FormalOntologyPath` |
| Profil plateforme | import-paths | `PlatformProfileArtifact` |
| Tranche domaine | import-paths | `DomainSliceArtifact` |
| Compile ontologie | import-paths | `OntologyCompileOperator` |
| Schémas `ghostcrab:*` (hors OWL) | import-paths | `AgentSchemaRegistryPath` |
| Facet sens A — faits agent | memory-model | `FacetSenseAgent` |
| Facet sens B — index documentaire | memory-model | `FacetSenseDocumentIndex` |
| Facet sens C — vocabulaire ontologique | memory-model | `FacetSenseOntologyVocabulary` |
| `agent_facts` | memory-model | `AgentFactsStore` |
| `facet_tables` / postings | memory-model | `DocumentFacetIndexStore` |
| `ontology_*` | memory-model | `OntologyTablesStore` |
| Session MCP | memory-model | `SessionRoutingLayer` |
| Projection Type A | memory-model | `ProjectionTypeAStore` |
| Projection Type B | memory-model | `ProjectionTypeBStore` |
| Graphe raw / runtime | memory-model | `GraphRawStore`, `GraphRuntimeStore` |
| Raw / Runtime (reindex) | memory-model | `ReindexRawRuntimePair` |
| Couche requête facets | query-layers | `FacetsQueryLayer` |
| Couche requête graph | query-layers | `GraphQueryLayer` |
| Couche requête pragma | query-layers | `PragmaQueryLayer` |
| `ghostcrab_search`, `count` | query-layers | `FacetsReadTool` |
| `ghostcrab_graph_search`, traverse… | query-layers | `GraphReadTool` |
| `ghostcrab_project`, `projection_get` | query-layers | `PragmaReadTool` |
| `ghostcrab_pack`, `combined_search` | query-layers | `CrossLayerReadTool` |
| Phase 1–4 méthodologie | methodology-loop | `MethodologyPhase*` |
| Question de compétence | methodology-loop | `CompetencyQuestion` |
| Voie LinkML B0 | import-paths | `OntologyPathLinkML` |
| Voie MCP incrémental | import-paths | `OntologyPathMcpIncremental` |
| structured-import CLI | import-paths | `TabularPathStructuredImport` |
| Scripts SOP5 Voie A | import-paths | `TabularPathSop5ScriptsProOnly` |
| Édition personal-mcp | import-paths | `ProductEditionPersonal` |

Ponts inter-tranches : slot `bridgesToSlice` (enum `DocsSliceId`) sur `DocumentationConcept`.

---

## Questions de compétence (par tranche)

### memory-model

1. Quels trois sens distincts du mot « facets » existent dans GhostCrab Personal ?
2. Quelle table stocke les faits agent durables (`remember` / `upsert`) ?
3. Où vit l’index Roaring/BM25 documentaire (sens B) ?
4. Quelle couche stocke les projections Type A ?
5. Où sont matérialisés les snapshots `ProjectionResult` (Type B) ?
6. Quelle distinction raw vs runtime pour le graphe métier ?
7. Le champ JSON `facets` sur un fait agent est-il le même que `facet_tables` ?
8. Quels outils écrivent dans `entities_raw` sans passer par `agent_facts` ?

### query-layers

1. Quel outil interroge uniquement `agent_facts` (pas `graph_entity`) ?
2. Quel outil parcourt le graphe live multi-sauts ?
3. Comment lire un snapshot Type B sans requête SQL ad hoc ?
4. Pourquoi un hit zéro sur `ghostcrab_search` ne prouve pas un domaine vide ?
5. Quels outils sont « cross-layer » et quelles couches couvrent-ils ?
6. Quelle couche utilise `ghostcrab_projection_get` ?
7. Comment découvrir les outils graphe « extended » ?
8. Où sont stockées les `relation_properties` typées vs metadata JSON ?

### methodology-loop

1. Quelles sont les quatre phases de la boucle universelle GhostCrab ?
2. Quel prérequis ONBOARDING avant la phase 1 ?
3. Quelle phase conçoit le contrat de lecture agent (projections) ?
4. Quelle phase ingère le minimum pour exercer phases 1–2 ?
5. Comment dériver le vocabulaire via les « 5 actes » d’atelier ?
6. La boucle est-elle linéaire ou itérative ?
7. Quel artefact valide la fin de phase 4 ?
8. Où trouver la théorie ontologique amont de cette boucle ?

### import-paths

1. Quel est le choix ontologie par défaut Personal en phase B0 ?
2. Quelle commande compile LinkML sans écrire en base ?
3. Quand utiliser `--import-db` et quelle précaution SQLite ?
4. Quelle voie tabulaire par défaut en C2 Personal ?
5. Quels opérateurs sont interdits sur le track personal-mcp ?
6. Où vit le YAML source d’autorité vs N-Triples ?
7. Différence entre `ghostcrab_schema_register` et `gcp brain ontology compile` ?
8. Quel runbook pour `structured-import apply` ?
