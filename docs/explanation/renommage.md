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

| Libellé public | `artifact_kind` / `event_kind` | Ancien équivalent | Sens |
|----------------|--------------------------------|-------------------|------|
| Plan d'analyse | `analysis_plan` | Projection Type A / `projections` | contrat stable: quoi chercher |
| Données en direct | `live_answer_view` | nouveau | réponse dynamique, explicitement actualisable |
| Instantané | `answer_snapshot` | Projection Type B / `ProjectionResult` | état figé à un moment donné |
| Preuves utilisées | `evidence_pack` | evidence links | faits, entités et arêtes qui justifient une réponse |
| Mise à jour | `answer_update_event` | nouveau | événement de changement de version |

`answer_update_event` est un `event_kind`, pas un `artifact_kind`.

## Migration

### 1. Renommer sans casser

Les projections Type A restent dans `projections`, mais les réponses exposent des
champs de compatibilité:

```json
{
  "artifact_kind": "analysis_plan",
  "legacy_kind": "projection_type_a",
  "public_label": "Pilotage hebdomadaire du chantier"
}
```

Les ProjectionResult Type B deviennent des instantanés:

```json
{
  "artifact_kind": "answer_snapshot",
  "legacy_kind": "projection_type_b",
  "lifecycle": "frozen",
  "is_terminal_answer": true
}
```

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
`event_kind = answer_update_event`.

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
