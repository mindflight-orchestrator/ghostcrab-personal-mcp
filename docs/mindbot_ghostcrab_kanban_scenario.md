# MindBot -> MindCLI -> GhostCrab MCP — Scénario Kanban orienté onboarding réel

Ce scénario remplace une approche trop contrôlée.

Ici, le point de départ n'est pas:

- un SQL déjà figé
- une séquence d'outils imposée
- un pseudo-plan méta

Le point de départ est le besoin utilisateur.

Ensuite:

1. `mindBot` formule ce besoin
2. GhostCrab conduit l'onboarding et fait émerger la structure
3. l'agent propose, affine, puis exécute
4. on vérifie à la fin que le modèle créé répond bien au job initial

L'idée est simple:

- partir de `first principles`
- découper `MECE`
- juger sur le `JTBD`

## Précondition

Utiliser la DB de démo GhostCrab:

```bash
export DATABASE_URL='postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab'
```

## 1. First principles

Avant de parler schéma ou SQL, on fixe les invariants du problème.

Pour une app Kanban, les besoins minimaux sont:

1. représenter un tableau de travail
2. représenter des colonnes ordonnées
3. représenter des cartes qui changent d'état
4. représenter des personnes responsables
5. pouvoir relire la structure produite à la fin

Si un modèle ne couvre pas ces 5 besoins, il échoue, même s'il est techniquement propre.

## 2. JTBD

Le `job to be done` du scénario n'est pas:

- "faire un plan"
- "générer une taxonomie"
- "sortir du SQL élégant"

Le vrai job est:

> Quand je veux démarrer une app Kanban dans GhostCrab, je veux que l'agent fasse émerger un modèle exploitable avec GhostCrab, puis qu'il me restitue clairement la structure créée pour que je sache sur quoi je vais construire.

## 3. Découpage MECE

Pour éviter le flou, le besoin Kanban peut être découpé ainsi:

### Domaine

- boards
- columns
- cards
- members

### Comportement

- une board contient des columns
- une column contient des cards
- une card peut être assignée à un member
- une card change de statut

### Validation

- le modèle est créé dans un workspace identifié
- la structure est exécutable
- les méta-données de structure sont relisibles via MCP

Ce découpage suffit pour un premier scénario utile. Tout le reste est optionnel au premier passage.

## 4. Prompt de départ concret

Le prompt initial ne doit pas imposer la solution.
Il doit donner le job, les contraintes, et laisser GhostCrab conduire l'onboarding.

```text
Je veux modéliser une petite app Kanban dans GhostCrab.

Le besoin minimum est:
- gérer des boards
- gérer des colonnes ordonnées
- gérer des cards
- gérer des membres assignables
- pouvoir suivre le statut d'une card

Je ne veux pas figer trop tôt le modèle.
Commence par faire l'onboarding du besoin, propose la structure minimale nécessaire, puis fais le nécessaire pour créer cette structure dans GhostCrab.

À la fin, donne-moi:
- les objets métier retenus
- les relations retenues
- ce qui a réellement été créé
- les méta-données MCP/export du modèle
```

## 5. Ce qu'on attend de GhostCrab pendant l'onboarding

On n'impose pas une séquence d'outils.
On impose des comportements.

### Comportements attendus

1. reformuler le besoin en langage produit
2. identifier le plus petit modèle utile
3. expliciter les hypothèses si elles manquent
4. proposer une structure avant exécution
5. marquer le checkpoint d'approbation si DDL
6. exécuter seulement après validation
7. terminer par une lecture de la structure réellement créée

### Comportements non souhaités

- partir immédiatement dans un schéma trop riche
- inventer des concepts hors besoin
- parler trop tôt en interne GhostCrab sans valeur produit
- produire un plan abstrait sans converger vers une structure
- résumer le SQL initial au lieu de lire la structure réellement créée

## 6. Modèle minimal cible

On ne l'impose pas comme unique solution, mais si l'agent est bon, on s'attend à quelque chose de proche de ceci:

### Entités métier

- `board`
- `column`
- `card`
- `member`

### Relations métier

- `board -> columns`
- `column -> cards`
- `card -> member`

### Champs minimaux plausibles

- `board`: `id`, `name`, `created_at`
- `column`: `id`, `board_id`, `name`, `position`
- `card`: `id`, `column_id`, `assignee_id`, `title`, `status`, `priority`, `created_at`
- `member`: `id`, `display_name`, `joined_at`

Si le modèle final diverge légèrement mais couvre le même job, c'est acceptable.

## 7. Test en 3 phases

## Phase A — Onboarding réel

### But

Vérifier que `mindBot` n'impose pas la structure et que GhostCrab sait faire émerger le bon périmètre.

### Entrée

Le prompt de départ ci-dessus.

### Réussite

- l'agent reformule correctement le besoin
- il garde un périmètre simple
- il identifie bien les objets métier centraux
- il ne dérive pas en sur-modélisation

### Échec

- trop abstrait
- trop technique trop tôt
- trop de concepts non demandés
- pas de convergence vers une structure exécutable

## Phase B — Création effective

### But

Vérifier que l'onboarding mène à une vraie structure créée dans GhostCrab.

### Invariants à valider

- un workspace est créé
- une proposition de structure est produite
- si le flux passe par DDL, l'approbation est explicite
- la structure est effectivement exécutée

### Point important

Dans le runtime actuel, la lecture de méta-structure utile intervient après exécution.
Autrement dit:

- `ghostcrab_ddl_propose` prépare
- l'approbation autorise
- `ghostcrab_ddl_execute` matérialise
- `ghostcrab_workspace_inspect` et `ghostcrab_workspace_export_model` confirment

## Phase C — Restitution métier + méta-données

### But

Vérifier que la sortie finale aide réellement l'utilisateur à comprendre ce qui a été créé.

### La réponse finale attendue doit contenir

- le nom du workspace
- les objets métier retenus
- les relations retenues
- le fait que la structure a été exécutée
- une lecture méta de la structure
- un export de modèle ou une référence à cet export

### Ce qu'on veut éviter

- "voici le SQL que j'ai proposé"
- "voici mon plan"
- "voici une analyse du concept de workflow"

La sortie doit parler du résultat réel, pas seulement de l'intention.

## 8. Critères de réussite concrets

Le scénario est `pass` si:

1. `mindBot` part bien du besoin Kanban et non d'un schéma imposé
2. GhostCrab propose un modèle minimal couvrant boards, columns, cards, members
3. la création aboutit à une structure effectivement lisible via MCP
4. la restitution finale parle du modèle réellement créé

Le scénario est `weak_pass` si:

1. le modèle est juste mais sur-spécifié
2. la création fonctionne mais la restitution finale reste trop SQL-centric
3. l'onboarding est correct mais verbeux

Le scénario est `fail` si:

1. pas de convergence vers un modèle exécutable
2. absence de lecture finale de la structure créée
3. réponse surtout méta, sans création utile
4. le modèle ne couvre pas le JTBD Kanban minimal

## 9. Version avancée avec `mindBrain`

Si `mindBot` s'appuie sur `mindBrain`, il faut juger la valeur produite, pas la sophistication apparente.

La bonne question n'est pas:

- "est-ce qu'il y a des agents, des prompts et des plans ?"

La bonne question est:

- "est-ce que cette orchestration améliore réellement le résultat ?"

### Attendus minimaux

- `mindBrain` aide à clarifier le besoin
- `mindBrain` aide à séparer conception, approbation, exécution, restitution
- la couche d'orchestration ne cache pas le vrai résultat métier

### Red flags

- agents qui se paraphrasent
- plans sur les plans
- prompts d'agents plus détaillés que le modèle final
- beaucoup d'orchestration, peu de structure créée

## 10. Prompt avancé concret

Si vous voulez tester la couche `mindBrain`, utilisez un prompt de ce type:

```text
Je veux que tu utilises GhostCrab pour faire émerger puis créer le modèle minimum d'une app Kanban.

Si tu as besoin de structurer le travail avec mindBrain, fais-le, mais reste concret.
Je veux juger le résultat sur trois choses:
- la qualité de l'onboarding
- la qualité du modèle réellement créé
- la qualité de la restitution finale

À la fin, montre-moi ce que GhostCrab a réellement créé, pas seulement le plan ou la proposition initiale.
```

## 11. Sortie finale idéale

Une bonne sortie finale ressemble à ceci:

1. rappel bref du besoin compris
2. résumé du modèle créé:
   - boards
   - columns
   - cards
   - members
3. relations confirmées
4. état d'exécution:
   - proposé
   - approuvé
   - exécuté
5. lecture MCP:
   - `ghostcrab_workspace_inspect`
   - `ghostcrab_workspace_export_model`
6. conclusion produit:
   - "vous avez maintenant un modèle Kanban minimal exploitable"

## 12. Ce qu'on doit mesurer

Si on veut être efficace, les métriques les plus utiles sont:

- temps pour converger vers un modèle utile
- nombre d'aller-retours avant structure exécutable
- couverture du JTBD minimal
- clarté de la restitution finale
- écart entre structure proposée et structure réellement créée

Ce sont de meilleures métriques que:

- profondeur apparente du plan
- nombre d'agents
- volume de discours méta

## 13. Référence d'export

Pour la forme attendue de l'export final, viser une structure proche de [docs/contracts/examples/kanban-board.export.json](/Users/francois/Documents/mars2026/ghostcrab-mcp/docs/contracts/examples/kanban-board.export.json) et conforme au contrat [docs/contracts/workspace-model-export.schema.json](/Users/francois/Documents/mars2026/ghostcrab-mcp/docs/contracts/workspace-model-export.schema.json).
