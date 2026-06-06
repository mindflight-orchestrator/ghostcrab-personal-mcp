# Renommage des artefacts de réponse

Cette note fixe la taxonomie publique et agent pour remplacer les anciens
libellés de projections Type A / Type B sans casser les surfaces existantes.

## Principe

Un même nom ne doit pas servir à la fois aux humains, aux agents et au
filesystem. GhostCrab sépare donc trois couches:

| Couche | Exemple | Règle |
|--------|---------|-------|
| Libellé humain | Données en direct - Pilotage hebdomadaire | court, lisible, sans jargon |
| Type agent/API | `live_answer_view` | stable, machine-lisible |
| Identifiant technique | `live_answer_view__pilotage_hebdomadaire` | préfixe = type, sans version |

La version vit dans `current_version`, pas dans l'id stable. Les exports fichier
peuvent ajouter un suffixe de version ou de date si nécessaire.

## Taxonomie canonique

Le champ `artifact_kind` répond à la question : **quel objet de réponse est-ce ?**
Le champ `event_kind` répond à la question : **qu'est-ce qui vient d'arriver à
cet objet ?** Les agents doivent lire ces deux axes séparément. Les gaps,
règles, diagnostics, rapports de couverture, écarts MECE et conflits de graphe
ne répondent à aucune de ces deux questions: ils restent des surfaces qualité,
pas des artefacts ou événements de réponse.

### Artefacts de réponse (`artifact_kind`)

| Libellé public | `artifact_kind` | Ancien équivalent | Sens |
|----------------|-----------------|-------------------|------|
| Plan d'analyse | `analysis_plan` | Projection Type A / `projections` | contrat stable: quoi chercher |
| Données en direct | `live_answer_view` | nouveau | réponse dynamique, explicitement actualisable |
| Instantané | `answer_snapshot` | Projection Type B / `ProjectionResult` | état figé à un moment donné |
| Preuves utilisées | `evidence_pack` | evidence links | faits, entités et arêtes qui justifient une réponse |

### Evénements de réponse (`event_kind`)

| Libellé public | `event_kind` | Stockage | Sens |
|----------------|--------------|----------|------|
| Mise à jour | `answer_update_event` | `mindbrain_answer_events` | changement de version ou signal de refresh d'un artefact |

`answer_update_event` n'est jamais un `artifact_kind`.

## Contrat backend autoritaire

Le contrat de stockage et de wire backend est défini dans
[`vendor/mindbrain/docs/artifacts/artifact-model.md`](../../vendor/mindbrain/docs/artifacts/artifact-model.md).
Cette note décrit le vocabulaire produit et agent côté GhostCrab; elle n'est pas
la source normative du stockage, des contraintes SQL, ni des sérialisations
backend.

Points à reprendre sans les redéfinir autrement:

- `artifact_id` suit `kind__slug` et reste sans version.
- `current_version` porte la version mutable courante.
- `state` est le champ d'état autoritaire.
- `lifecycle` indique la mutabilité large: `draft`, `active`, `frozen`,
  `stale`, `archived`, ou `deleted`.
- Les booléens terminaux / frozen sont dérivés à la sérialisation, pas le
  contrat de persistance principal.

## Migration

### 1. Renommer sans casser

Les projections Type A restent dans `projections`, mais les réponses exposent des
champs de compatibilité:

```json
{
  "artifact_kind": "analysis_plan",
  "legacy_kind": "projection_type_a",
  "public_label": "Pilotage hebdomadaire du chantier",
  "state": "active",
  "lifecycle": "active"
}
```

Les ProjectionResult Type B deviennent des instantanés:

```json
{
  "artifact_kind": "answer_snapshot",
  "legacy_kind": "projection_type_b",
  "state": "closed",
  "lifecycle": "frozen",
  "is_terminal_answer": true
}
```

`is_terminal_answer` est un champ de sortie dérivé utile aux agents. Il ne
remplace pas `state` et `lifecycle` dans le contrat backend.

### 2. Ajouter le registre

Le registre `mindbrain_answer_artifacts` devient le point d'entrée agent pour les
artefacts de réponse:

```text
mindbrain_answer_artifacts
- artifact_id
- slug
- workspace_id
- agent_id
- scope
- artifact_kind
- public_label
- lifecycle
- state
- current_version
- payload_json
- legacy_ref
```

### 3. Distinguer live et snapshot

Une question métier peut mener à un `analysis_plan`, puis à une
`live_answer_view` si la réponse doit suivre les données actuelles. Un rapport
partageable ou terminal devient un `answer_snapshot`.

Sur Personal/SQLite, les vues live sont rafraîchies explicitement. Les
changements créent des lignes `mindbrain_answer_events` avec
`event_kind = answer_update_event`. Cet événement référence un artefact et une
transition de version; il n'est pas listé dans `artifact_kind`.

## Frontière avec gaps et diagnostics

`artifact_kind` est réservé aux artefacts de réponse. Les gaps, règles et
diagnostics ne doivent pas être stockés comme des artefacts:

| Sens | Terme |
|------|-------|
| Donnée graphe manquante | `graph_data_gap` |
| Règle de validation graphe | `graph_gap_rule` |
| Gap de couverture ontologique | `coverage_gap` |
| Gap de réponse métier | `answerability_gap` |
| Ecart MECE documentaire | `mece_gap` |

La règle finale est simple: une réponse sérieuse expose son type
(`artifact_kind`), son cycle de vie, sa version courante, et ses preuves.
