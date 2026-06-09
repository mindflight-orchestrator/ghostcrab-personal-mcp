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
------
modifications des libellés pour les projectionsIl faut le faire à trois niveaux, dans cet ordre. Sinon l’agent restera obligé de raisonner avec “Type A / Type B”.

1. Le Point D’entrée Agent : mindCLI

C’est la priorité. Aujourd’hui, l’agent passe par mindCLI mb_pragma projection get, qui retourne une “projection” sans enveloppe métier assez claire.

À modifier dans le repo runtime :

[mindbot/internal/cli/cognitive/memproj.go](/Users/francois/Documents/fevrier2026/mindbot/internal/cli/cognitive/memproj.go:83)

Zones importantes :


* lignes 83-98 : commandes projection list/get
* lignes 353-363 : structure JSON retournée
* lignes 404-415 : requête projections list
* lignes 510-521 : requête projection get
* lignes 540+ : construction de la sortie JSON

À ajouter dans la réponse JSON :


{
  "artifact_kind": "analysis_plan",
  "public_label": "[Plan] Pilotage hebdomadaire chantier",
  "lifecycle": "static",
  "is_terminal_answer": false,
  "legacy_kind": "projection_type_a"
}


Et il faudrait idéalement ajouter une commande/alias plus claire :


mindcli mb_pragma artifact get --kind analysis_plan --scope ...


ou :


mindcli mindbrain answer get --scope ... --mode plan|live|snapshot|evidence


Tant que la commande s’appelle seulement projection get, l’agent doit encore interpréter.

2. Le Modèle De Données / Contrat

Dans le repo courant BTC-full-ontologies, la source déclarative des projections est ici :

[specs/projection_catalog.yaml](/Users/francois/Documents/avril2026/BTC-full-ontologies/specs/projection_catalog.yaml:8)

Et l’import PostgreSQL écrit dans mb_pragma.projections ici :

[scripts/import_postgres_pro.py](/Users/francois/Documents/avril2026/BTC-full-ontologies/scripts/import_postgres_pro.py:308)

Il faudrait enrichir chaque projection avec :


artifact_kind: analysis_plan
public_kind: Plan d’analyse
lifecycle: static
terminal_answer: false


Puis s’assurer que projection_arguments(...) et l’import mettent ces champs dans le JSON content.

Ça permet à mindCLI de ne pas deviner : il lit artifact_kind.

3. Les Skills / Prompts Agent

Les skills actuels enseignent encore explicitement la distinction Type A / Type B. À modifier après le CLI, pas avant.

Fichiers locaux concernés :

[mindbrain-operator/SKILL.md](/Users/francois/.codex/skills/mindbrain-operator/SKILL.md:25)

[mindbrain-json-answer-builder/SKILL.md](/Users/francois/.codex/skills/mindbrain-json-answer-builder/SKILL.md:14)

Il faut remplacer la logique :


Type A = contract
Type B = snapshot


par :


Ne raisonne jamais d’abord en Type A / Type B.
Lis artifact_kind :
- analysis_plan
- live_answer_view
- answer_update_event
- answer_snapshot
- evidence_pack


Le skill peut encore mentionner Type A/B en annexe technique, mais pas comme route principale.

4. Lecture Type B / Snapshot

Les docs indiquent que ghostcrab_projection_get lit les ProjectionResult dans graph.entity :

[docs/projections/type_b_projections_expliquées.md](/Users/francois/Documents/avril2026/BTC-full-ontologies/docs/projections/type_b_projections_expliquées.md:58)

Là aussi, la sortie devrait être enveloppée comme :


{
  "artifact_kind": "answer_snapshot",
  "public_label": "[Instantané] ...",
  "lifecycle": "frozen",
  "is_terminal_answer": true,
  "legacy_kind": "projection_type_b"
}


Si on ajoute les vues dynamiques, ce ne doit pas être appelé Type B. Ce sera un nouvel objet : live_answer_view.

5. Documentation Et Démo

À nettoyer ensuite :

[docs/projections/type_b_projections_expliquées.md](/Users/francois/Documents/avril2026/BTC-full-ontologies/docs/projections/type_b_projections_expliquées.md:1)

[docs/projections/comprendre-memoire-mcp-facettes-ontologie-projections.md](/Users/francois/Documents/avril2026/BTC-full-ontologies/docs/projections/comprendre-memoire-mcp-facettes-ontologie-projections.md:130)

[docs/dashboards/chantier_weekly_kpi_dashboard.html](/Users/francois/Documents/avril2026/BTC-full-ontologies/docs/dashboards/chantier_weekly_kpi_dashboard.html:636)

Ces fichiers peuvent garder Type A/B dans une section “compatibilité technique”, mais le vocabulaire principal doit devenir : Plan, Données en direct, Mise à jour, Instantané, Preuves.

Le minimum efficace : modifier mindCLI pour retourner artifact_kind et lifecycle, puis modifier les skills pour router dessus. Le repo ontologie et la documentation viennent ensuite.
