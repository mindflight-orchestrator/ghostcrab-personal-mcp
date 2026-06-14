# Plan d'intégration — Router business_query (adaptation ici)

## Contexte

- Repo cible : `ghostcrab-personal-mcp`
- Branche dédiée : `codex-business-query-router-integration-plan`
- Source de référence : `../ghostcrab-mcp`, commits récents
  - `503f6a8` (implémentation métier `business-query-learning` + `business-query-router`)
  - `249d5a0` (plan implémentation associé dans `docs/plan`)
- État initial : aucun module `business-query-learning/*` ni `business-query-router/*` n'existe actuellement dans ce repo.

## Objectif

Mettre en place dans ce repo les modules business-query learning/router selon le plan déjà défini, en les adaptant au runtime SQLite/Node de ce dépôt, sans casser l’API existante.

## Contraintes du repo

- Aucun path `src/tools/business-query-*` aujourd’hui.
- Vérifier les conventions d’enregistrement d’outils (`registerTool`) et la source de persistence/fact store.
- Conserver l’évolution non-cassante (API optionnelle).
- Utiliser une insertion progressive, avec points de pivot explicites.

## Plan de travail (prévu)

### Phase 0 — Préparation (prérequis)

1. Créer l’arborescence minimale
   - `src/tools/business-query-learning/`
   - `src/tools/business-query-router/`
2. Vérifier point d’entrée de chargement des outils
   - Ajouter exports si nécessaire (ex: `src/tools/index.ts` ou équivalent dans ce repo).
   - Vérifier si le registre d’outils charge via wildcard ou index statique.
3. Vérifier disponibilité dépendances
   - `zod`, helpers DB/embeddings/registry/fact store dans ce repo.
   - Contrôler les fonctions disponibles pour `FACT_STORE_QUALIFIED_NAME`, `createToolSuccessResult`, etc.

### Phase 1 — Contrat métier (types + normalisateur)

- Implémenter les types de base dans
  - `src/tools/business-query-router/types.ts`

Contenu attendu:
- `BusinessIntent` avec `structured_facets?`, `canonical_phrase?`.
- `BusinessCapability` avec `proposal_fingerprint?`.
- `BusinessQueryResult` avec champs optionnels de routing enrichi.
- Types de route: `RouteMode`, `RouteDecision`, `RankedCapabilityScore`, `AlternativeRoute`.
- `LearningProposal` avec `intent_signature`, `proposed_facets`, `evidence_count`, `confidence_tier`.

- Implémenter `src/tools/business-query-router/normalizer.ts`
  - Garder les champs legacy (`id`, `slots`, `confidence`).
  - Ajouter extraction robustes de facettes:
    - `demo_week` / `week_number`
    - `status`
    - `project`, `team`, `owner`
    - `limit`, `order`
  - Retourner `structured_facets` et `canonical_phrase`.

### Phase 2 — Matching / scoring

- Implémenter `src/tools/business-query-router/matcher.ts`
  - Scoring existant + bonus basé sur `structured_facets`.
  - Ne pas dégrader la compatibilité des scores précédents.

### Phase 3 — Planning / routing

- Implémenter `src/tools/business-query-router/planner.ts`
  - Centraliser seuils dans une constante.
  - Retourner de façon stable:
    - `route`
    - `route_reason`
    - `route_scores`
    - `alternative_routes`
    - `coverage` (si exposable)
  - Règle de tie-break stable (score puis état/catégorie).

### Phase 4 — Exécution live_query + réponse d’API

- Implémenter `src/tools/business-query-router/index.ts`
  - Builder de facettes générique à partir de `structured_facets`.
  - Whitelist des facettes applicables.
  - Signaler `applied_live_facets` / `skipped_live_facets`.
  - Retour API enrichi avec champs optionnels sans cassure.

### Phase 5 — Learning + enregistrement

- Implémenter `src/tools/business-query-learning/index.ts`
  - Proposition conditionnée (duplication + confiance + ambiguïté).
  - Ajout méta: signature, facettes, niveau de confiance.

- Implémenter `src/tools/business-query-learning/register-proposal.ts`
  - `proposal_fingerprint` pour dédup.
  - `activation_status`.
  - Update/insert idempotent possible par signature ou capability_id.

### Phase 6 — Intégration et exposition outils

- Brancher les deux outils `ghostcrab_business_query_answer` et `ghostcrab_business_query_register_proposal` dans le registre global.
- Vérifier que le loader auto-inscrit tous les modules dans ce repo ou créer l’import explicite.

## Critères de validation

### Unitaires

- `normalize`: semaine + status + ambiguïté + composite.
- `matcher`: bonus facettes + stabilité des anciens cas.
- `planner`: priorité des routes et stabilité tie-break.
- Live builder: mapping whitelist + facettes ignorées.

### Scénarios métier

- “liste des items terminés semaine S07”
- “tâches in_progress projet X”
- phrase courte ambiguë
- intent riche + facette non supportée.

### Non régression

- `creation_request` / `composite_request` restent en `gap_report` quand il faut.
- `analysis_plan` demeure fallback si aucune route robuste.
- Aucun champ obligatoire retiré.

## Sorties attendues

- Commit de plan (document seul) sur la branche dédiée.
- Puis commits techniques successifs dans le même branch:
  1) types+normalizer
  2) matcher+planner
  3) router index
  4) learning modules
  5) enregistrement outillage
  6) tests ciblés

## Risques / points de vérification

- Adapter les requêtes SQL aux conventions SQLite/driver de ce repo.
- Vérifier noms de schéma/facettes persistées.
- Vérifier que `register-tool` n’impose pas de schéma différent.

