# Alignement starterkit / skills avec la procedure CRM mindBrain

Date: 2026-05-28

## Conclusion

La proposition precedente ne doit pas devenir une procedure parallele. Le corpus existant contient deja la charpente correcte:

- `SOP2_obsidian_ontologie.md`: JTBD, contrat MVP, mapping externe, JSONB intermediaire, validation, injection facets/graph/projections.
- `SOP3_parsing_pipeline.md`: pipeline de parsing, validation JSONB, fichiers de migration, `pending_review.json`, `pending_ddl.json`, `syncstate.json`.
- templates starterkit: `jtbd.yaml`, `mvp_core_contract.yaml`, `ontology_core_provisioning.yaml`, `initial_referential.yaml`, `mapping_external_to_canonical.yaml`, `disambiguation.yaml`.
- skills GhostCrab: gates d'onboarding, discipline de schema design, query patterns, app/demo patterns, transition logging.

Ce qu'il faut proposer maintenant, c'est une consolidation:

1. generaliser le starterkit au-dela d'Obsidian pour les sources CSV/API/JSON/export applicatif;
2. ajouter un contrat consommateur explicite pour Sigma/Graphology, agents, projections, rapports;
3. rendre obligatoire la materialisation graphe quand le consommateur attend des tables natives;
4. aligner les exceptions avec `pending_review.json` et `pending_ddl.json`, plutot que creer un concept de quarantine separe.

## Mapping entre l'ancienne proposition et les artefacts existants

| Proposition precedente | Artefact existant a utiliser | Ajustement recommande |
|---|---|---|
| `source profile` | pas encore couvert generiquement | Ajouter `source_profile.yaml` pour CSV/API/JSON/export applicatif. |
| `target model contract` | `mvp_core_contract.yaml`, `ontology_core_provisioning.yaml`, `ghostcrab_workspace_export_model` | Faire de l'export MCP la source preferee, avec fallback vers le contrat local. |
| `mapping contract` | `mapping_external_to_canonical.yaml` | Etendre le template: colonnes CSV, chemins JSON, formules `record_id`, enums, edges, defaults. |
| `normalized staging records` | JSONB intermediaire SOP2 section 4.3 | Ne pas inventer un autre format; specialiser le JSONB pour les sources non Obsidian. |
| `quarantine ledger` | `pending_review.json`, `pending_ddl.json`, `unmatched.log` | Reprendre ces fichiers et ajouter des `reason_code` standards. |
| `graph materialization gate` | SOP2 section 7.6 + SOP3 graph CSV | Ajouter variante PERSO/SQLite: `ghostcrab_learn` si disponible, sinon SQL de materialisation locale. |
| `projection tests` | `ghostcrab_pack`, `ghostcrab_project`, query patterns | Garder comme gate separee: une projection qui marche ne prouve pas que le graphe natif existe. |
| `consumer tests` | `APP_PATTERNS.md` demo profile | Ajouter un contrat consommateur explicite: endpoints, tables attendues, counts minimums. |

## Ce que les docs changent dans la proposition

### 1. L'ordre canonique doit venir du starterkit

Ordre recommande:

1. `jtbd.yaml`
2. `mvp_core_contract.yaml`
3. `ontology_core_provisioning.yaml`
4. `initial_referential.yaml`
5. `mapping_external_to_canonical.yaml`
6. `disambiguation.yaml`
7. JSONB intermediaire valide
8. import facets
9. import graphe
10. projections
11. tests consommateurs

La proposition precedente commencait trop vite par "source -> target -> mapping". C'est juste pour l'import, mais il faut le replacer apres JTBD + schema design.

### 2. Les gates GhostCrab doivent etre explicites

Les skills imposent une discipline:

- intake et clarification avant toute ecriture quand le modele n'est pas valide;
- proposition de modele avant execution;
- `ghostcrab_schema_register` seulement apres confirmation explicite de freeze;
- lectures autorisees pour verifier le modele, notamment `ghostcrab_workspace_export_model` quand disponible;
- les graphes ne sont utiles que si la decision, le parcours ou le consommateur en depend.

Pour le CRM en cours, l'utilisateur avait deja donne l'objectif d'execution. Pour une procedure reutilisable, ces gates doivent etre inscrites dans le harnais.

### 3. Le probleme Sigma revele un manque de "consumer contract"

Le starterkit dit qu'un demo profile portable doit inclure:

- une couche factuelle minimale;
- une couche graphe minimale;
- une couche projection/pack minimale.

Le bug rencontre venait precisement du fait que la couche factuelle et la projection existaient, mais pas la couche graphe native attendue par Sigma/Graphology.

Donc chaque import doit declarer ses consommateurs:

```yaml
consumer_contract:
  - name: ghostcrab-pack
    requires:
      facets: true
      projections: true
      native_graph: false
  - name: sigma-graphology
    requires:
      native_graph: true
      tables:
        - graph_entity
        - graph_relation
      smoke_tests:
        - /api/graph/ontologies
        - /api/graph/count
        - /api/graph
```

### 4. `pending_review` remplace "quarantine"

La notion de quarantine reste utile, mais elle doit etre implementee avec les artefacts deja prevus:

- `pending_review.json` pour les objets sources non importables;
- `pending_ddl.json` pour les vrais gaps de modele;
- `unmatched.log` pour les fichiers/objets que le mapping ne couvre pas;
- `syncstate.json` pour l'incrementalite.

Ajouter des codes de raison suffit:

- `unknown_entity_type`
- `missing_required_facet`
- `invalid_enum_value`
- `unresolved_reference`
- `ambiguous_reference`
- `duplicate_record_id`
- `invalid_edge_label`
- `edge_type_mismatch`
- `unsafe_inference`
- `needs_model_extension`
- `consumer_gap`

## Procedure deterministe consolidee

### Gate 0 - Onboarding et autorisation

- verifier que le modele est deja valide ou obtenir une proposition approuvee;
- ne pas freezer de schema sans confirmation explicite;
- identifier `workspace_id`, runtime MCP, backend et DB active.

### Gate 1 - JTBD et questions schema design

- confirmer le job principal, les sous-jobs, les objets durables;
- repondre aux cinq questions de `SCHEMA_DESIGN.md`;
- verifier les decisions attendues, filtres de retrieval, et etats de cycle de vie.

### Gate 2 - Modele cible

- preferer `ghostcrab_workspace_export_model(workspace_id, depth=full)`;
- fallback: contrat local versionne;
- verifier schemas, facets requises, valeurs fermees, edge labels, projections.

### Gate 3 - Profil de source

- produire `source_profile.yaml` ou `source_profile_report.json`;
- lister colonnes/champs, IDs candidats, enums, null rate, relations candidates;
- classer chaque champ: mapped, derived, ignored, review.

### Gate 4 - Mapping et desambiguisation

- etendre `mapping_external_to_canonical.yaml`;
- definir `record_id` stable, schema cible, facets, enums, defaults, edges;
- appliquer `disambiguation.yaml` avant la generation d'edges.

### Gate 5 - Dry run JSONB

- produire le JSONB intermediaire SOP2 section 4.3;
- valider `source_ref`, `schema_id`, `content`, facets requises, `node_type`, edge labels;
- sortir `pending_review.json` et `pending_ddl.json`.

### Gate 6 - Import facets

- importer via MCP ou batch direct selon le volume;
- verifier counts, `workspace_id`, `record_id`, idempotence;
- pour les changements d'etat CRM, enregistrer le rationale avant `upsert`.

### Gate 7 - Graphe

- creer les noeuds/edges via `ghostcrab_learn` quand c'est le chemin runtime;
- ou materialiser localement en `graph_entity` / `graph_relation` pour PERSO SQLite et Sigma;
- verifier endpoint resolution, edge labels, source/target type constraints.

### Gate 8 - Projections

- tester `ghostcrab_pack` et les scopes de projection;
- verifier les vues attendues: opportunites chaudes, bloquees, next action, handoff vers projet.

### Gate 9 - Consommateurs

- tester chaque consommateur declare;
- pour Sigma: `/api/graph/ontologies`, `/api/graph/count`, `/api/graph`;
- ne jamais utiliser une projection reussie comme preuve que la visualisation graphe est prete.

### Gate 10 - Manifest et checkpoint

- produire un manifest avec source, target, counts, exceptions, scripts executes;
- ecrire un checkpoint de fin de phase si le travail continue.

## Ce qu'il faut proposer pour le CRM maintenant

### Artefacts a ajouter

Dans le repo CRM, les prochains fichiers utiles seraient:

- `models/crm_mindbrain_source_profile.yaml`
- `models/crm_mindbrain_mapping_external_to_canonical.yaml`
- `models/crm_mindbrain_consumer_contract.yaml`
- `output/pending_review.json`
- `output/pending_ddl.json`
- `output/syncstate.json`
- `data/import_manifest_crm_mindbrain.json`

### Scripts a generaliser

Le script actuel `scripts/audit_crm_graph_pipeline.mjs` est un bon premier slice. Il devrait etre decoupe en harnais reusable:

- `scripts/profile_source.mjs`
- `scripts/validate_mapping_contract.mjs`
- `scripts/transform_source_to_jsonb.mjs`
- `scripts/import_facets.mjs`
- `scripts/materialize_graph_from_edges.mjs`
- `scripts/audit_import_pipeline.mjs`

### Skill a ajouter ou etendre

Deux options raisonnables:

1. etendre `ghostcrab-data-architect` avec une section "source import compiler";
2. creer une skill dediee `ghostcrab-source-import-compiler`.

La deuxieme option est plus propre si le volume CSV/API augmente, car elle se concentre sur:

- profiler une source;
- compiler vers JSONB intermediaire;
- generer `pending_review` / `pending_ddl`;
- importer facets + graphe;
- tester consommateurs.

## Ce qu'il ne faut plus proposer

- une procedure separee qui ignore SOP2/SOP3;
- une nouvelle notion de quarantine qui double `pending_review`;
- une validation uniquement par `ghostcrab_pack`;
- une generation directe de graphe sans verifier le modele cible;
- une creation automatique de schema pour chaque objet source qui echappe aux regles;
- une logique Sigma specifique cachee dans le script d'import, sans `consumer_contract`.

## Recommandation finale

Le bon cap est:

```text
starterkit existant
  + source_profile generique
  + mapping_external_to_canonical v2
  + consumer_contract
  + materialisation graphe PERSO/SQLite
  + audit_import_pipeline
```

Autrement dit: garder le starterkit comme norme, et industrialiser seulement les zones qui ont manque pendant le test CRM.
