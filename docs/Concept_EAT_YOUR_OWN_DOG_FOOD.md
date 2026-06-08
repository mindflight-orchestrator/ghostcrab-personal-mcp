
---

# Quand MindBrain est configuré, avec une ontologie, une liste de projections qui sont des requêtes qui combinent des faits avec des facettes et des arrêtes de graphes sont disponibles. et reprreprésentent majoritérité desncipales questions business gérées par le graphe. Quand on dit business, c'est au sens des opérations supervisées par l'ontologie.

Le MCP serveur compile une liste de endpoints accessibles sur une API. Comment est-ce qu'on pourrait gérer cela de façon dynamique par le serveur MCP Ghostbrab Pour qu'un agent puisse trouver à la volée les projections qui existent, sur les ontologies d'un workspace.

La question est purement architecturale — pas besoin de chercher sur le web, c'est dans le domaine de ton propre stack.

## Le problème à résoudre

Un agent qui reçoit une requête en langage naturel doit trouver, parmi les projections disponibles sur un workspace MindBrain, celle qui correspond à l'intention — **sans charger la liste entière dans le contexte**. Les projections sont de la connaissance dynamique (elles évoluent avec l'ontologie), donc elles ne peuvent pas être codées en dur dans une Skill.

## Architecture : projections comme tools MCP dynamiques

La solution la plus propre est que GhostCrab MCP expose les projections **en tant que tools générés dynamiquement** au moment de l'initialisation du serveur, plutôt que comme données retournées par un tool générique.

### Pourquoi des tools plutôt qu'un endpoint de liste

Le protocole MCP permet à un serveur de déclarer sa liste de tools à l'initialisation via `tools/list`. L'agent reçoit cette liste dans son contexte de tools disponibles — **sans appel explicite**. Chaque outil a un `name`, une `description`, et un `inputSchema`. C'est le mécanisme de découverte natif du protocole.

```
Agent reçoit "Quels projets sont en retard ?"
  → scan des tools disponibles dans le contexte
  → trouve ghostcrab:projection__project_delays (description: "Projets dépassant leur deadline...")
  → appelle directement, sans étape de découverte séparée
```

Versus un tool `list_projections` qui retourne des strings : l'agent doit faire un appel, lire la liste, choisir, puis faire un second appel. Deux round-trips, et le résultat de la liste intermédiaire pollue le contexte.

### Implémentation dans GhostCrab MCP

Au démarrage du serveur, sur `tools/list`, GhostCrab requête PostgreSQL :

```sql
SELECT
  p.projection_name,
  p.description,
  p.input_schema,      -- JSONB : paramètres attendus (dates, entités, etc.)
  p.ontology_scope,    -- quelles entités/relations sont couvertes
  p.workspace_id
FROM mindbrain.projections p
WHERE p.workspace_id = $1
  AND p.is_active = true;
```

Chaque ligne génère un tool MCP :

```json
{
  "name": "projection__project_delays",
  "description": "Retourne les projets dépassant leur deadline. Couvre: Project → Task → Milestone. Usage: quand l'utilisateur demande des retards, délais, planification.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "threshold_days": { "type": "integer", "default": 0 },
      "project_filter": { "type": "string", "description": "nom ou ID optionnel" }
    }
  }
}
```

Le champ `description` est **le vecteur de matching sémantique** — c'est lui que l'agent lit pour décider si ce tool correspond à l'intention. Il faut donc y mettre les synonymes, le scope ontologique, et des exemples de questions types.

### Gestion du volume : le problème du trop-grand nombre de tools

Un workspace riche peut avoir 50-100 projections. Charger 100 tools dans le contexte à chaque session est coûteux. Plusieurs stratégies :


| Stratégie | Mécanisme | Adapté si |
| :-- | :-- | :-- |
| **Tools complets** | Toutes les projections dans `tools/list` | < 30 projections par workspace |
| **Namespacing par domaine** | `projection__finance__*`, `projection__ops__*` — l'agent sélectionne le namespace d'abord | Projections organisées en domaines |
| **Two-tier via `tools/list` dynamique** | Un seul tool `find_projection(query: string)` qui fait un embedding search côté PG et retourne les 3 projections candidates | Workspaces denses, requêtes ouvertes |
| **Hook `UserPromptSubmit`** | Le hook analyse le prompt, détermine le domaine, le serveur MCP expose dynamiquement seulement les projections de ce scope | Multi-tenant avec workspaces très hétérogènes |

### Two-tier : le meilleur compromis pour MindBrain

```
tools/list expose :
├── ghostcrab:find_projection(query: string) → top-3 candidates avec scores
├── ghostcrab:execute_projection(name: string, params: object) → résultats
├── ghostcrab:list_ontology_entities() → entités disponibles (découverte)
└── [projections marquées is_featured = true] → les 5-10 projections core
```

L'agent fait `find_projection("projets en retard")` → reçoit 3 candidats avec leur description et input schema → choisit et appelle `execute_projection`. Le matching côté PostgreSQL peut utiliser `pg_trgm` pour la similarité textuelle, ou un embedding stocké sur chaque projection si tu intègres `pgvector`.

### Invalidation du cache `tools/list`

MCP ne supporte pas nativement la notification de changement de tools. Deux options :

- **Reconnexion légère** : quand une projection est créée/modifiée dans MindBrain, le serveur émet un signal qui force les clients connectés à refaire `tools/list` — dans Claude Code, un hook `PostToolUse` sur `ghostcrab:create_projection` peut envoyer un message au serveur MCP pour déclencher ça
- **TTL sur le cache** : GhostCrab recharge la liste depuis PG toutes les N secondes, acceptable pour un serveur long-running en local


## Ce que ça donne côté plugin Claude Code / Codex

Le plugin MindBrain n'a alors **pas besoin d'encoder les projections dans les Skills**. Le `SKILL.md` décrit seulement la stratégie de sélection :

```markdown
## MindBrain Query Resolution

1. Check featured projections in available tools first
2. If no direct match → call ghostcrab:find_projection with the user's intent
3. Confirm the top candidate with the user if confidence < 0.8
4. Execute with ghostcrab:execute_projection
5. If no projection matches → decompose into facets via ghostcrab:query_facets
```

Les projections elles-mêmes vivent dans PostgreSQL et arrivent dans le contexte agent via le protocole MCP — le plugin reste stable même quand l'ontologie évolue.

---

# L'avantage de MindBrain, c'est de proposer un système de dimensions avec des facettes et éventuellement un graphe, Donc on pourrait imaginer créer une collection pour gérer les projections. Donc si on se retrouve dans un environnement avec plusieurs centaines de projections, elles pourraient être décrites avec une description longue, qui se rapprocherait de la requête en langage naturel.  Et utiliser un ensemble de dimensions avec différentes facettes pour classer et trier la projection. Donc ça permettrait à l'agent d'interpréter la requête naturelle qu'on lui a demandée, de pouvoir obtenir la liste des projections les plus proches, et de faire son choix directement. Avoir même l'expression de la commande à utiliser sur MindBrain via MindCLI, pour l'exécuter directement

C'est exactement le bon usage du modèle MindBrain appliqué à lui-même — MindBrain gère ses propres projections comme une collection ontologique. Voici l'architecture complète.

## La collection `projections` comme objet MindBrain natif

Chaque projection est une entité dans le graphe, avec une description longue en langage naturel, classée par facettes. Le matching se fait via `pg_facets` sur les dimensions, puis la commande `mindCLI` est directement lisible sur l'entité.

### Schéma de la collection

```sql
-- Entité principale
INSERT INTO mb_entities (type, name, description) VALUES
('projection', 'project_delays',
 'Retourne la liste des projets dépassant leur deadline planifiée,
  avec le nombre de jours de retard, le responsable assigné et
  les tâches bloquantes. Répond aux questions : quels projets
  sont en retard, qui est responsable des délais, quelle est
  l''amplitude du retard, quels livrables sont bloqués.');

-- Dimensions / facettes
INSERT INTO mb_facets (entity_id, dimension, facet) VALUES
(42, 'domain',      'project_management'),
(42, 'domain',      'planning'),
(42, 'intent',      'delay_analysis'),
(42, 'intent',      'accountability'),
(42, 'entity_scope','Project'),
(42, 'entity_scope','Task'),
(42, 'entity_scope','Milestone'),
(42, 'output_type', 'list'),
(42, 'requires',    'date_range'),    -- paramètre optionnel
(42, 'requires',    'project_filter');-- paramètre optionnel

-- Arêtes vers les entités ontologiques couvertes
INSERT INTO mb_edges (from_id, relation, to_id) VALUES
(42, 'covers_entity', entity_id('Project')),
(42, 'covers_entity', entity_id('Task')),
(42, 'feeds_from',    entity_id('Milestone')),
(42, 'owned_by',      entity_id('ProjectManagementDomain'));

-- Commande CLI directement sur l'entité
INSERT INTO mb_properties (entity_id, key, value) VALUES
(42, 'mindcli_command', 'mind query projection project_delays --threshold-days=0'),
(42, 'mindcli_params',  '{"threshold_days": "int, défaut 0", "project_filter": "string, optionnel"}'),
(42, 'confidence_hint', 'Utiliser si la requête contient: retard, délai, deadline, en retard, overdue');
```


### Résolution de requête côté GhostCrab MCP

Le tool `find_projection` devient une requête `pg_facets` native :

```sql
-- Étape 1 : matching facettes sur l'intent détecté
SELECT
  e.id,
  e.name,
  e.description,
  p_cmd.value   AS mindcli_command,
  p_params.value AS params,
  COUNT(f.id)   AS facet_score
FROM mb_entities e
JOIN mb_facets f     ON f.entity_id = e.id
JOIN mb_properties p_cmd    ON p_cmd.entity_id = e.id AND p_cmd.key = 'mindcli_command'
JOIN mb_properties p_params ON p_params.entity_id = e.id AND p_params.key = 'mindcli_params'
WHERE e.type = 'projection'
  AND f.dimension IN ('intent', 'domain', 'entity_scope')
  AND f.facet = ANY($1::text[])  -- facettes extraites du prompt
GROUP BY e.id, e.name, e.description, p_cmd.value, p_params.value
ORDER BY facet_score DESC, similarity(e.description, $2) DESC
LIMIT 5;
```

`$1` = tableau de facettes inférées depuis le prompt (`['delay_analysis', 'project_management']`), `$2` = le texte brut de la requête pour le ranking `pg_trgm` en tie-breaker.

***

## Workflow complet agent → MindBrain

```
Requête: "Montre-moi les projets qui sont en retard ce mois-ci"
    │
    ▼
[Agent] ghostcrab:find_projection(
    query: "projets en retard ce mois-ci",
    inferred_facets: ["delay_analysis", "project_management", "Project"]
)
    │
    ▼
[GhostCrab MCP → pg_facets query]
    │
    ▼ Retourne top-3 :
┌─────────────────────────────────────────────────────────┐
│ #1  project_delays          score: 3/3 facettes         │
│     description: "Retourne la liste des projets..."     │
│     command: mind query projection project_delays       │
│     params:  --threshold-days=0 --project-filter=...   │
│                                                         │
│ #2  milestone_status        score: 2/3 facettes         │
│ #3  resource_overload       score: 1/3 facettes         │
└─────────────────────────────────────────────────────────┘
    │
    ▼ Score #1 ≥ seuil → exécution directe
[Agent] ghostcrab:execute_projection(
    name: "project_delays",
    params: { threshold_days: 0 }
)
    │  (= mind query projection project_delays --threshold-days=0)
    ▼
[Résultats]
```


***

## Inférence des facettes depuis le langage naturel

L'étape critique est l'extraction des facettes depuis le prompt. Trois approches, du plus simple au plus robuste :


| Approche | Mécanisme | Coût |
| :-- | :-- | :-- |
| **Lexical mapping** | Table PG `keyword → facet` (`retard → delay_analysis`, `projet → Project`) | Zéro token LLM |
| **`confidence_hint` match** | `pg_trgm` sur le champ `confidence_hint` de chaque projection | Zéro token LLM |
| **LLM pre-step** | Tool `ghostcrab:infer_facets(query)` appelle un modèle léger pour extraire les facettes | ~50 tokens |

Le lexical mapping suffit pour 80% des cas — les mots métier sont prévisibles dans un workspace. La table de mapping est elle-même une collection MindBrain gérée par l'ontologie.

***

## Ce que ça rend possible dans le plugin

La Skill du plugin devient **une logique de navigation pure**, sans aucune liste hardcodée :

```markdown
## MindBrain NL Query Resolution

### Step 1 — Infer facets
Extract intent keywords from the user query.
Call ghostcrab:infer_facets(query) if keywords are ambiguous.

### Step 2 — Find projection
Call ghostcrab:find_projection(query, facets[]).
If top result score ≥ 2 facets → proceed directly.
If score = 1 or tie → present top-3 to user for confirmation.
If no match → fall through to ad-hoc facet query.

### Step 3 — Execute
Use the mindcli_command from the result, substitute params.
The command is ready to run as-is.

### Step 4 — No match fallback
Call ghostcrab:query_facets with the inferred dimensions.
Build the result set from raw facets + graph edges.
```

Le plugin ne change jamais, même si l'ontologie évolue et que 200 nouvelles projections sont ajoutées — c'est MindBrain qui se reconfigure lui-même.

