# 2026-06-17 - Graph rule events et transitions pragma

## Objectif

Ajouter une premiere boucle explicite d'evaluation persistante des `graph_gap_rules`.
Les regles restent declaratives; MindBrain calcule et conserve l'etat courant par
sujet, emet des evenements seulement quand l'etat change, puis peut proposer des
actions de remediation si la regle l'autorise via `metadata_json`.

## Architecture retenue

- Backend canonique dans `../mindbrain-perso`, puis mise a jour de
  `ghostcrab-personal-mcp/vendor/mindbrain`.
- Surface MCP dans `ghostcrab-personal-mcp`.
- V1 explicite: l'evaluation est declenchee par commande/tool dedie, pas par
  `graph_diagnostics` et pas encore automatiquement apres mutation graphe.
- `graph_diagnostics` reste read-only.
- Les actions de remediation sont opt-in via metadata de regle.

## Backend MindBrain

1. Ajouter les tables SQLite:
   - `graph_rule_evaluations`
     - cle logique: `workspace_id`, `ontology_id`, `rule_id`, `subject_entity_id`
     - etat courant: `state` (`valid` ou `invalid`)
     - details: `observed_count`, `expected_min`, `expected_max`, `last_evaluated_at_unix`
   - `graph_rule_events`
     - journal append-only des transitions
     - `from_state` accepte `unknown`, `valid`, `invalid`
     - `to_state` accepte `valid`, `invalid`
     - `idempotency_key` unique
2. Ajouter une fonction d'evaluation explicite:
   - resoudre `ontology_id` comme `graph_diagnostics`
   - charger les regles actives du workspace
   - evaluer chaque entite ciblee comme dans les diagnostics
   - upsert l'etat courant
   - inserer un evenement seulement si l'etat change
   - retourner un resume: `evaluated`, `changed`, `events_created`,
     `invalid_count`, `remediation_actions_created`
3. Ajouter la creation optionnelle de `quality_remediation_action`:
   - uniquement sur transition `invalid -> valid`
   - uniquement si `rule.metadata_json` contient une action opt-in
   - utiliser une idempotency key stable pour eviter les doublons
4. Ajouter les endpoints HTTP:
   - `POST /api/mindbrain/graph/rule-evaluations/run`
   - `GET /api/mindbrain/graph/rule-evaluations`
   - `GET /api/mindbrain/graph/rule-events`
5. Ajouter les commandes standalone equivalentes.
6. Exposer les capabilities backend correspondantes.

## Surface GhostCrab MCP

1. Ajouter les wrappers HTTP dans `src/db/standalone-mindbrain.ts`.
2. Ajouter les tools:
   - `ghostcrab_graph_rule_evaluations_run`
   - `ghostcrab_graph_rule_evaluations`
   - `ghostcrab_graph_rule_events`
3. Brancher:
   - `src/tools/register-all.ts`
   - `src/tools/tool-manifest.ts`
   - `src/tools/catalog.ts`
   - `src/tools/pragma/status.ts`
   - docs de reference MCP
4. Garder la politique:
   - `run` est write
   - `evaluations` et `events` sont read

## Tests

### MindBrain Zig

- Premiere evaluation:
  - cree les evaluations
  - cree des evenements `unknown -> valid` et `unknown -> invalid`
- Deuxieme evaluation identique:
  - ne cree aucun nouvel evenement
- Correction d'une relation manquante:
  - produit `invalid -> valid`
- Suppression ou depassement de cardinalite:
  - produit `valid -> invalid`
- Metadata opt-in:
  - cree une `quality_remediation_action` seulement pour `invalid -> valid`
  - ne cree rien si la regle n'a pas d'action metadata
  - ne duplique pas l'action sur rerun
- `graph_diagnostics` reste read-only.

### GhostCrab TypeScript

- Les wrappers construisent les bonnes routes.
- Les tools valident les inputs Zod.
- Les trois tools sont presents dans manifest/catalog/register-all.
- Les erreurs backend sont structurees en `backend_unavailable`.
- `ghostcrab_status` expose les capabilities si le backend les annonce.

### Validation ciblee

- Dans `../mindbrain-perso`:
  - `ZIG_LOCAL_CACHE_DIR=/tmp/zig-cache ZIG_GLOBAL_CACHE_DIR=/tmp/zig-global-cache zig build test`
- Dans `ghostcrab-personal-mcp`:
  - tests tools graph cibles
  - `pnpm typecheck`
  - controle manifest/catalog
  - `git diff --submodule=short -- vendor/mindbrain`

## Notes futures

Le declenchement automatique apres mutation graphe est volontairement hors v1.
Pour l'ajouter, il faudra brancher les chemins qui modifient `graph_entity` et
`graph_relation`, puis borner l'evaluation aux entites affectees. Cette option
ameliore l'ergonomie mais augmente fortement le risque de side effects et de
cout runtime.
