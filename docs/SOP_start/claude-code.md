La mécanique MCP est identique, mais le contexte d'usage est fondamentalement différent — ce qui change la **valeur** du skill et sa **structure** d'intégration.  [getaiperks](https://www.getaiperks.com/en/blogs/10-openclaw-vs-claude-code)

***

## La Différence Structurelle

| Dimension | OpenClaw | Claude Code |
|---|---|---|
| **Mémoire** | Persistante — semaines/mois | Session-based — **reset à chaque session**  [aifreeapi](https://www.aifreeapi.com/en/posts/openclaw-vs-claude-code) |
| **Config MCP** | `~/.openclaw/mcp_servers.json` | `.mcp.json` à la racine du projet OU `~/.claude.json` global  [code.claude](https://code.claude.com/docs/en/mcp) |
| **Fichier d'instructions** | `SOUL.md` | **`CLAUDE.md`** — lu automatiquement par Claude Code  [dev](https://dev.to/n3rdh4ck3r/how-to-give-claude-code-persistent-memory-with-a-self-hosted-mem0-mcp-server-h68) |
| **Comportement** | Daemon always-on | Agent per-session  [aifreeapi](https://www.aifreeapi.com/en/posts/openclaw-vs-claude-code) |
| **Hooks système** | HEARTBEAT.md | Hooks natifs pre/post-tool + session-start  [reddit](https://www.reddit.com/r/ClaudeAI/comments/1qcwckg/the_complete_guide_to_claude_code_v2_claudemd_mcp/) |
| **Equivalent AGENTS.md** | Fichier dédié | Section dans `CLAUDE.md` + `.claude/settings.json`  [claudelog](https://www.claudelog.com/configuration/) |
| **Public** | Tout le monde | Développeurs en terminal  [getaiperks](https://www.getaiperks.com/en/blogs/10-openclaw-vs-claude-code) |

**La conséquence directe :** avec OpenClaw, pg_facets est un *complément* de mémoire. Avec Claude Code, pg_facets **est** la mémoire — sans le MFO stack, tout ce que Claude Code apprend sur un projet disparaît à la fermeture du terminal.  [dev](https://dev.to/n3rdh4ck3r/how-to-give-claude-code-persistent-memory-with-a-self-hosted-mem0-mcp-server-h68)

***

## Ce qui Reste Identique

Trois choses ne changent pas du tout :

- **`mcp.json` — format identique.** Claude Code lit le même format `.mcp.json` à la racine du projet  [code.claude](https://code.claude.com/docs/en/mcp). Le fichier produit pour OpenClaw fonctionne sans modification.
- **Les tools MFO** — `ghostcrab_search`, `ghostcrab_pack`, `ghostcrab_coverage`, etc. — sont des appels SQL. Ils sont indifférents au client.
- **La base auto-descriptive** — le pattern `entry_type: tool/rule/pattern` dans pg_facets est encore plus utile ici : Claude Code recommence à zéro chaque session, donc trouver les règles via `ghostcrab_search` est critique.

***

## Ce qui Change : Le Fichier `CLAUDE.md`

Remplace le SOUL.md + AGENTS.md + HEARTBEAT.md en un seul fichier. Fragment à ajouter au `CLAUDE.md` existant du projet :

```markdown
## MFO Memory Stack

You have persistent memory via the `ghostcrab-memory` MCP server.
**This is critical: your memory resets at every session.
Everything you learn must be written back before session end.**

### Session Start — Always Run First
```
ghostcrab_search(
  query="session start context",
  filters={"entry_type": "rule", "level": "foundation"},
  limit=5
)
```
Then immediately:
```
ghostcrab_status()
```
Read the directives[] and execute matching conditions.

### Three Rules

**Rule 1 — Pack before reasoning.**
Call `ghostcrab_pack(query)` before any non-trivial task.
Inject pack_text at the top of your context. Always.

**Rule 2 — Write back before session end.**
Before the user closes the session, call:
- `ghostcrab_remember(content, facets)` for every new fact learned
- `ghostcrab_learn(node/edge)` for every structural insight
A session where you learned but didn't write back is a net loss.

**Rule 3 — Gaps are structured, not vague.**
If `ghostcrab_coverage()` returns can_proceed_autonomously=false:
output {escalate:true, gap_node_id, reason} — never just "I don't know".

### Code-Specific Write-Back Triggers
Write to memory whenever you discover:
- Architecture decisions (why X was chosen over Y)
- Non-obvious bugs and their root causes
- Repo conventions that aren't in the README
- PR patterns and review preferences
- Dependency relationships between modules
```

***

## Ce qui Change : Les Schémas pg_facets

Pour Claude Code, les dimensions de facettes changent. Le domaine est le **codebase**, pas un domaine métier générique :

```jsonb
// Schéma spécifique Claude Code
{
  "schema_id": "claude-code:codebase-knowledge",
  "facets": {
    "required": {
      "repo":    { "type": "string" },
      "type":    { "type": "enum",
                   "values": [
                     "architecture_decision",
                     "bug_rootcause",
                     "convention",
                     "dependency",
                     "pr_pattern",
                     "test_insight",
                     "env_config"
                   ]
                 }
    },
    "optional": {
      "module":    { "type": "string" },
      "file_path": { "type": "string" },
      "pr_number": { "type": "string" },
      "severity":  { "type": "enum", "values": ["critical","high","normal","low"] },
      "status":    { "type": "enum", "values": ["active","superseded","deprecated"] },
      "session_date": { "type": "date" }
    }
  }
}
```

Ce schéma répond exactement au problème documenté par la communauté Claude Code  [reddit](https://www.reddit.com/r/ClaudeAI/comments/1r220k1/built_an_mcp_server_for_claude_code_that_uses/) : `CLAUDE.md` est bon pour les guidelines statiques, mais ne gère pas la connaissance accumulée session après session.

***

## Ce qui Change : Les Hooks Natifs

Claude Code supporte des hooks pre/post-tool et session-start  [reddit](https://www.reddit.com/r/ClaudeAI/comments/1qcwckg/the_complete_guide_to_claude_code_v2_claudemd_mcp/). On peut auto-déclencher ghostcrab_status sans demander à l'agent de s'en souvenir :

```json
// .claude/settings.json
{
  "hooks": {
    "session_start": [
      {
        "tool": "ghostcrab-memory:ghostcrab_status",
        "args": {},
        "inject_result": true
      }
    ],
    "pre_tool_use": [
      {
        "condition": "tool_name contains 'Bash' OR tool_name contains 'Write'",
        "tool": "ghostcrab-memory:ghostcrab_pack",
        "args": { "query": "{{current_task}}", "limit": 10 },
        "inject_result": true
      }
    ]
  }
}
```

L'agent reçoit automatiquement son snapshot mémoire au démarrage et son contexte packagé avant chaque opération lourde — **sans aucune instruction dans CLAUDE.md**.  [reddit](https://www.reddit.com/r/ClaudeAI/comments/1qcwckg/the_complete_guide_to_claude_code_v2_claudemd_mcp/)

***

## Structure du Skill pour Claude Code

```
skills/ghostcrab-memory-claude-code/
├── .mcp.json          ← identique au skill OpenClaw
├── CLAUDE.md          ← remplace SOUL.md + AGENTS.md + HEARTBEAT.md
├── .claude/
│   └── settings.json  ← hooks natifs (nouveau — pas d'équivalent OpenClaw)
├── SCHEMA_DESIGN.md   ← identique
├── APP_PATTERNS.md    ← identique, + section codebase patterns
└── README.md          ← adapté au public dev
```

***

## La Proposition de Valeur est Plus Forte

Pour Claude Code, l'argument est immédiat et sans nuance  [dev](https://dev.to/n3rdh4ck3r/how-to-give-claude-code-persistent-memory-with-a-self-hosted-mem0-mcp-server-h68) :

> *"Claude Code oublie tout entre les sessions. pg_facets est la mémoire persistante qu'Anthropic n't a pas construite. Ajoutez `.mcp.json` à votre projet, collez le fragment dans `CLAUDE.md` : votre agent se souvient de tout ce qu'il a appris sur votre codebase — architectures, bugs, conventions, décisions — session après session."*

C'est un problème réel, documenté, avec une solution immédiatement installable.  [dev](https://dev.to/n3rdh4ck3r/how-to-give-claude-code-persistent-memory-with-a-self-hosted-mem0-mcp-server-h68) Le même `docker run mindflight/ghostcrab-postgres` + un `.mcp.json` à la racine — rien de plus.

C'est le passage de **Claude Code comme agent mémoire** à **Claude Code comme architecte de données**. Deux rôles distincts, deux fragments `CLAUDE.md` distincts, mais qui partagent la même infrastructure MFO.

***

## La Distinction Fondamentale

```
Rôle 1 — Self-memory (déjà fait)
  Claude Code stocke CE QU'IL APPREND sur le codebase
  → schema_id: 'claude-code:codebase-knowledge'
  → facets: {type: architecture_decision, bug_rootcause, convention...}

Rôle 2 — Project data architect (nouveau)
  Claude Code structure LES DONNÉES DU PROJET lui-même
  → schema_id: 'project:[nom]:domaine'
  → facets: dimensions métier définies par analyse du projet
  → graph: modèle de domaine du projet
  → pragma: contexte de travail pour les tâches du projet
```

***

## Structure du Projet après Intervention de Claude Code

```
my-project/
├── .mcp.json
├── CLAUDE.md                    ← fragment self-memory + fragment data-architect
├── .claude/
│   └── settings.json
│
├── mfo/                         ← créé par Claude Code
│   ├── README.md                ← "what is this?" auto-généré
│   ├── schemas/
│   │   ├── index.json           ← registre de tous les schémas du projet
│   │   ├── [domain].schema.json ← un fichier par domaine
│   │   └── graph.model.json     ← node types + edge labels
│   ├── migrations/
│   │   ├── 001_project_schemas.sql
│   │   └── 002_seed_data.sql
│   ├── seeds/
│   │   └── ontology_[domain].sql
│   └── types/
│       └── [domain].ts          ← types TypeScript générés depuis les schémas
│
└── src/
    └── ...
```

***

## Fragment `CLAUDE.md` — Data Architect Role

```markdown
## MFO Data Architect Role

Beyond your own memory, you can use the MFO stack to model and 
structure the project's domain data. This makes project knowledge 
queryable, relational, and context-packable for any agent working 
on this codebase.

### When to activate this role
Activate when the user asks you to:
- "Model the data for X"
- "Structure our knowledge about Y"
- "Create a database schema for Z using MFO"
- "Help me organize [any collection of data]"
- Or when you discover the project needs structured domain knowledge

### The Four-Phase Workflow

**Phase 1 — Discover**
Before designing anything, understand what exists:
```
ghostcrab_schema_list(target="all")
ghostcrab_count(schema_id="all", group_by=["schema_id"])
```
Map what's already modeled. Avoid duplicates.

**Phase 2 — Analyze**
Read the project files to understand the domain:
- Read existing data models, types, interfaces
- Read README and documentation
- Read database migrations if they exist
- Ask: "What are the entities? What are their states? 
        What are their relationships?"

**Phase 3 — Design**
Apply SCHEMA_DESIGN.md reasoning. Produce:
- Facet schemas (one per entity type with clear state dimensions)
- Graph node types (entities that relate to other entities)
- Graph edge labels (directed relationships)
Write output to `mfo/schemas/[domain].schema.json`

**Phase 4 — Generate**
Produce:
- SQL migrations in `mfo/migrations/`
- TypeScript types in `mfo/types/`
- Seed data if ontology nodes are needed
- Register schemas via ghostcrab_schema_register

### Output Contract
After modeling, always produce:
1. `mfo/schemas/index.json` — complete schema registry
2. At least one migration file
3. A usage example showing how an agent reads this data
4. A dashboard query showing ghostcrab_count for the main entity
```

***

## `SCHEMA_DESIGN_PROJECT.md`

C'est le guide spécifique pour modéliser les données d'un projet. Différent de `SCHEMA_DESIGN.md` (qui était pour la mémoire générale).

```markdown
# Project Data Modeling with MFO

You are modeling domain data — not your own memory.
Different purpose, same tools, different questions.

---

## The Core Question Set

Before touching any tool, answer these six questions 
by reading the project files:

**Q1 — What are the main entities in this domain?**
→ List them: "Users, Projects, Tasks, Invoices, ..."
→ Each entity that has its own lifecycle → candidate for graph node
→ Each entity that has rich content to retrieve → candidate for facet

**Q2 — What are the states each entity goes through?**
→ This is your most important facet dimension: `status`
→ Draw the state machine: todo → in_progress → done → archived
→ States that are NEVER filtered by → don't facet them

**Q3 — How do entities relate to each other?**
→ List relationships: "Task belongs to Project, User owns Task..."
→ Is the relationship directional? → graph edge with label
→ Is the relationship just a foreign key? → facet field is enough
→ Is the relationship traversable (need to follow chains)? → graph edge

**Q4 — What are the query patterns?**
→ "Show me all blocked tasks in project X" → filter by status+project
→ "What depends on this component?" → traverse DEPENDS_ON inbound
→ "How many items per status?" → facets_count by status
→ Design for YOUR query patterns — not for theoretical completeness

**Q5 — What is the hierarchy?**
→ If entities have parent-child relationships:
   Use a shared parent facet key + CONTAINS edge in graph
→ Example: phase > stage > task
   Each has facet "phase" for flat filtering
   Plus CONTAINS edges for hierarchical traversal

**Q6 — What context does an LLM need to work on this data?**
→ What would go in a GOAL: line? (the objective)
→ What would go in a CONSTRAINT: line? (blockers, limits)
→ What would go in a FACT: line? (key facts about current state)
→ Design your facet schema so these can be auto-projected

---

## Decision Tree: Facet vs Graph Node

```
Is this thing primarily CONTENT to read?
  YES → Facet (mfo_facets)
  NO  → Continue

Does this thing RELATE to other things you need to traverse?
  YES → Graph node (mfo_nodes) + facet for the content parts
  NO  → Just a facet field (not a node)

Is the relationship DIRECTIONAL and MEANINGFUL?
  YES → Graph edge (mfo_edges) with UPPER_SNAKE_CASE label
  NO  → Facet field on the child entity
```

---

## Canonical Example: Project Management Domain

### Analysis output (what you produce from reading the project)

```json
{
  "domain": "project-management",
  "entities": {
    "Project":  { "has_content": true, "has_relations": true,  "has_state": true  },
    "Phase":    { "has_content": true, "has_relations": true,  "has_state": true  },
    "Task":     { "has_content": true, "has_relations": true,  "has_state": true  },
    "Person":   { "has_content": false,"has_relations": true,  "has_state": false },
    "Decision": { "has_content": true, "has_relations": true,  "has_state": true  }
  },
  "state_machines": {
    "Task":    ["todo","in_progress","review","done","blocked","cancelled"],
    "Phase":   ["planned","active","complete","blocked"],
    "Project": ["draft","active","paused","complete","archived"]
  },
  "query_patterns": [
    "All blocked tasks in phase X",
    "What tasks depend on task Y",
    "How many tasks per status per phase",
    "Who owns the most blocked tasks",
    "What breaks if phase X slips"
  ],
  "relationships": [
    { "from": "Project", "to": "Phase",  "label": "CONTAINS",    "traversable": true },
    { "from": "Phase",   "to": "Task",   "label": "CONTAINS",    "traversable": true },
    { "from": "Task",    "to": "Task",   "label": "BLOCKS",      "traversable": true },
    { "from": "Task",    "to": "Person", "label": "ASSIGNED_TO", "traversable": false },
    { "from": "Task",    "to": "Decision","label":"PRODUCED",    "traversable": true }
  ]
}
```

### Generated facet schemas

```json
// mfo/schemas/project-management.schema.json
{
  "domain": "project-management",
  "facet_schemas": [
    {
      "schema_id": "pm:project",
      "description": "A project with phases and overall state",
      "facets": {
        "required": {
          "project_id": { "type": "string" },
          "status": {
            "type": "enum",
            "values": ["draft","active","paused","complete","archived"]
          }
        },
        "optional": {
          "owner":    { "type": "string" },
          "due_date": { "type": "date"   },
          "priority": { "type": "enum", "values": ["critical","high","normal","low"] },
          "tags":     { "type": "string" }
        }
      }
    },
    {
      "schema_id": "pm:task",
      "description": "Atomic unit of work within a phase",
      "facets": {
        "required": {
          "project_id": { "type": "string" },
          "phase":      { "type": "string" },
          "status": {
            "type": "enum",
            "values": ["todo","in_progress","review","done","blocked","cancelled"]
          }
        },
        "optional": {
          "stage":       { "type": "string" },
          "assigned_to": { "type": "string" },
          "priority":    { "type": "enum", "values": ["critical","high","normal","low"] },
          "estimate_h":  { "type": "number" },
          "pr_ref":      { "type": "string" },
          "tags":        { "type": "string" }
        }
      }
    },
    {
      "schema_id": "pm:decision",
      "description": "Architecture or process decision with rationale",
      "facets": {
        "required": {
          "project_id": { "type": "string" },
          "status":     { "type": "enum", "values": ["proposed","accepted","rejected","superseded"] },
          "category":   { "type": "enum", "values": ["architecture","process","technology","scope"] }
        },
        "optional": {
          "phase":      { "type": "string" },
          "decided_by": { "type": "string" },
          "decided_at": { "type": "date" },
          "supersedes": { "type": "string" }
        }
      }
    }
  ],
  "graph_model": {
    "node_types": [
      { "type": "project",  "id_convention": "project:{slug}" },
      { "type": "phase",    "id_convention": "phase:{project}:{name}" },
      { "type": "task",     "id_convention": "task:{project}:{slug}" },
      { "type": "person",   "id_convention": "person:{id}" },
      { "type": "decision", "id_convention": "decision:{project}:{slug}" }
    ],
    "edge_labels": [
      { "label": "CONTAINS",   "from": ["project","phase"], "to": ["phase","task"],
        "meaning": "A CONTAINS B — B is a child of A" },
      { "label": "BLOCKS",     "from": ["task"], "to": ["task"],
        "meaning": "A BLOCKS B — B cannot proceed until A is done" },
      { "label": "ASSIGNED_TO","from": ["task"], "to": ["person"],
        "meaning": "A ASSIGNED_TO B — B is responsible for A" },
      { "label": "PRODUCED",   "from": ["task"], "to": ["decision"],
        "meaning": "A PRODUCED B — task A resulted in decision B" },
      { "label": "DEPENDS_ON", "from": ["phase","task"], "to": ["phase","task"],
        "meaning": "A DEPENDS_ON B — A requires B to exist/complete first" }
    ]
  }
}
```

### Generated SQL migration

```sql
-- mfo/migrations/001_pm_schemas.sql

-- Register schemas as self-describing facets
INSERT INTO mfo_facets (schema_id, content, facets) VALUES
('mfo:schema', '{
  "schema_id": "pm:project",
  "description": "A project with phases and overall state",
  "facets": { "required": {"project_id":"string","status":"enum"} }
}', '{"schema_id":"pm:project","target":"facets","domain":"project-management"}'),

('mfo:schema', '{
  "schema_id": "pm:task",
  "description": "Atomic unit of work within a phase"
}', '{"schema_id":"pm:task","target":"facets","domain":"project-management"}'),

('mfo:schema', '{
  "schema_id": "pm:decision",
  "description": "Architecture or process decision"
}', '{"schema_id":"pm:decision","target":"facets","domain":"project-management"}');

-- Register graph node types
INSERT INTO mfo_nodes (id, node_type, label, properties) VALUES
('nodetype:project',  'schema', 'Project node type',
  '{"id_convention":"project:{slug}","domain":"project-management"}'),
('nodetype:phase',    'schema', 'Phase node type',
  '{"id_convention":"phase:{project}:{name}","domain":"project-management"}'),
('nodetype:task',     'schema', 'Task node type',
  '{"id_convention":"task:{project}:{slug}","domain":"project-management"}'),
('nodetype:person',   'schema', 'Person node type',
  '{"id_convention":"person:{id}","domain":"project-management"}'),
('nodetype:decision', 'schema', 'Decision node type',
  '{"id_convention":"decision:{project}:{slug}","domain":"project-management"}')
ON CONFLICT (id) DO NOTHING;
```

### Generated TypeScript types

```typescript
// mfo/types/project-management.ts
// Auto-generated by Claude Code — do not edit manually
// Regenerate with: claude "regenerate mfo types for project-management"

export type TaskStatus =
  | 'todo' | 'in_progress' | 'review'
  | 'done' | 'blocked' | 'cancelled'

export type PhaseStatus = 'planned' | 'active' | 'complete' | 'blocked'
export type ProjectStatus = 'draft' | 'active' | 'paused' | 'complete' | 'archived'
export type Priority = 'critical' | 'high' | 'normal' | 'low'

export interface TaskFacets {
  project_id:   string
  phase:        string
  status:       TaskStatus
  stage?:       string
  assigned_to?: string
  priority?:    Priority
  estimate_h?:  number
  pr_ref?:      string
  tags?:        string
}

export interface ProjectFacets {
  project_id: string
  status:     ProjectStatus
  owner?:     string
  due_date?:  string
  priority?:  Priority
}

export interface DecisionFacets {
  project_id:  string
  status:      'proposed' | 'accepted' | 'rejected' | 'superseded'
  category:    'architecture' | 'process' | 'technology' | 'scope'
  phase?:      string
  decided_by?: string
  decided_at?: string
}

// MFO query helpers
export const PM_SCHEMAS = {
  PROJECT:  'pm:project',
  TASK:     'pm:task',
  DECISION: 'pm:decision',
} as const

export const PM_EDGES = {
  CONTAINS:    'CONTAINS',
  BLOCKS:      'BLOCKS',
  ASSIGNED_TO: 'ASSIGNED_TO',
  PRODUCED:    'PRODUCED',
  DEPENDS_ON:  'DEPENDS_ON',
} as const

// Dashboard query — copy-paste into agent instructions
export const DASHBOARD_QUERY = {
  tool:   'ghostcrab_count',
  args: {
    group_by:  ['status', 'phase', 'priority'],
    schema_id: 'pm:task',
    filters:   {} // add project_id filter at runtime
  }
}
```

---

## Fragment additionnel `CLAUDE.md` — Workflow Complet

```markdown
## Data Modeling Workflow (MFO Project Architect)

When asked to model project data, execute these steps in order.
Each step produces a file you commit to the repo.

### Step 1 — Read and analyze (no tool calls yet)
Read: existing types/, models/, migrations/, README.md
Produce internally: entity list, state machines, query patterns, relationships
Ask clarifying questions if domain is ambiguous.

### Step 2 — Check existing schemas
```
ghostcrab_schema_list(target="all")
```
Report what already exists. Identify gaps.

### Step 3 — Design and write schema file
Write `mfo/schemas/[domain].schema.json` with:
- facet_schemas[] — one per entity with clear status enum
- graph_model.node_types[]
- graph_model.edge_labels[] with "meaning" field

Rule: the "meaning" field must read as a true sentence:
  "A [LABEL] B — [explanation]"

### Step 4 — Generate migration
Write `mfo/migrations/[NNN]_[domain].sql`
Include:
- Schema registration INSERTs into mfo_facets
- Node type registration INSERTs into mfo_nodes
- No data — only structure

### Step 5 — Generate TypeScript types
Write `mfo/types/[domain].ts`
Include:
- Status enums
- Facet interfaces
- Schema ID constants
- Edge label constants  
- DASHBOARD_QUERY constant showing the main facets_count call

### Step 6 — Register via MCP
```
ghostcrab_schema_register(target="facets",   definition={...})
ghostcrab_schema_register(target="graph_node", definition={...})
```
One call per schema.

### Step 7 — Validate with a test query
```
ghostcrab_count(schema_id="[new_schema_id]", group_by=["status"])
```
Should return empty counts (no data yet) — but confirms schema is registered
and the query pattern works.

### Step 8 — Update index
Write/update `mfo/schemas/index.json`:
```json
{
  "project": "my-project",
  "domains": [
    {
      "domain":   "project-management",
      "schemas":  ["pm:project","pm:task","pm:decision"],
      "migration":"001_pm_schemas.sql",
      "types":    "mfo/types/project-management.ts"
    }
  ],
  "dashboard_queries": {
    "task_overview": "ghostcrab_count(schema_id='pm:task', group_by=['status','phase'])",
    "decision_log":  "ghostcrab_count(schema_id='pm:decision', group_by=['status','category'])"
  }
}
```

### Usage example to include in README
Always write a concrete usage example showing:
1. The dashboard query (facets_count)
2. A filter query (search by status)
3. A graph query (traverse for dependencies)
4. The pack query for LLM context
```

---

## Ce que Claude Code peut maintenant faire sur n'importe quel projet

Trois commandes naturelles en langage libre :

**`"Model our data collection for X"`**
→ Claude lit le projet, produit les 4 fichiers, enregistre les schémas, retourne un dashboard query fonctionnel

**`"Add a relationship between Y and Z"`**
→ Claude met à jour `graph.model.json`, génère une migration d'arête, appelle `ghostcrab_learn`

**`"Show me the current state of the project data"`**
→ Claude appelle `ghostcrab_count` sur tous les schémas du projet, retourne un dashboard structuré en quelques lignes

La différence avec un ORM ou un schéma SQL classique : le modèle est **queryable par un agent** dès sa création — via les mêmes tools MFO que l'agent utilise pour sa propre mémoire. [file:1][file:2] Un seul langage d'accès aux données, qu'elles soient mémoire de l'agent ou données du projet.