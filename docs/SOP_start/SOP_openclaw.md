Voici le SOP complet. Il couvre les deux approches OpenClaw — self-memory (plug-in skill) et project-architect (création d'ontologies) — avec toute l'information nécessaire pour qu'un agent IA code séquentiellement sans ambiguïté.

***

# SOP — `ghostcrab-skills` Repository : OpenClaw Integration

## Contexte Général

Ce SOP décrit la construction du repo `ghostcrab-skills`, spécifiquement la surface OpenClaw. Ce repo ne contient **aucun code compilé** — uniquement des fichiers texte, JSON, Markdown et SQL template. Il consomme `@mindflight/ghostcrab` comme dépendance externe via `.mcp.json`. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/0844f916-1193-453a-b2a1-1e2b9b722f80/openclaw.md?AWSAccessKeyId=ASIA2F3EMEYE3ZVQTRTM&Signature=vm2ot9VEm3JpW51xE%2BAAmgOcxU8%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEKX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJGMEQCIB4gBOtHbCZx6mgwKRhAl3oYOUC7ti690EgB91f6%2Fo8wAiBJMSMPTaU5fesio5uCxCzsS56Of7rQPW3%2F%2BSU5mlQpDirzBAhuEAEaDDY5OTc1MzMwOTcwNSIMjrLkDc5EvuocjcyBKtAEtrvfxGIW7iJrQAahwxHVgzUGWuHtYYKsvQLNfXhpx4GAdGgtPHkS1y8FC7WWZg3TqALix8krSqqcJUQthUVWsHL2hcTCePUTf8Hbh%2BmYaD%2Fb9UB30j14VO8%2FwlomibgSruuMtVbBubwP3kIyUAdzEN6zhfVRVhd0ng2gc%2BXTho%2BBRG2FNyJZBE1WH1zEoFjA%2Fcoqn4nGM54k8WXCXC7zmo0u1rOtsyHgoUszNYrCRb%2F%2FC6en6AS36Ocb6rItzlOF%2FgkQnwQI2XyeDoknYd%2Fu0ydRWfd2OserOwrmkTTikhUXILb48ykOwMnYS2OEgvUQe%2F3uXOXH0H%2FLo1Ob%2FbCJoPJP5fxlNBkxHgEE5i7fmchLDOvAtIF5k9DkYoBdkSr6v9%2B6CcEqSXl3FlqNl4LI9t6xean5a54DKKGBB%2BdTU1dq%2FJ0LizxwhI1Xv9V96GTs7QJ73441f0KUAcY6J%2BmWaKJy%2B3kr8AjxrShEq4ksqCPZCdAujbkKUv%2FdyUaXCa05pTSHFwUg9XgTG2FWVb2J%2B1R1lgDnsWiSWirtqNxH%2B5jb0lImOTzLUZzf9i4ppHgoTnieZbRoKnWpUKHcBb4sQx%2F36zqM3eGtSyVV3ShV%2FJXVslLWHO9d4%2FD1MUFVh5p8XhL%2BasYkfQLzzU3zMFmOmIC4%2FzIQRv9Uaj%2BEmZC6oLX98oWZVhCYv9lBmtBvANCo2TzeR1sc0DXzNcv37VFPdvmSd%2B5qJc%2F1sQPOs46cWnGP9BgbdI5PmXP5LUpvfRPW%2BfU582BS4%2Bky2R6gMNczbTDWoIHOBjqZAQr%2Fms8I5LwbvZTzVglNd%2FcarBlL3DHzwJkhywbAdHyDqJnY07Tjn85odEsnZ%2BCe9wlQT5OKTMMX6ftLU3oG7nudBRupmjJouL2scFY4w0gNrrOBpZFciWfxGWVFWwBlGm2ISQMo8%2BVhRabPRcdtWK2HZBAk6eu1lv99NH9rpH5i91elv68iRXcAufA9hpwyjuEBsYjUed6Ung%3D%3D&Expires=1774213692)

### Deux rôles distincts, une même infrastructure

```
ghostcrab-skills/openclaw/
│
├── ghostcrab-memory/              ← Rôle 1 : Self-Memory
│   Plug-in pour N'IMPORTE QUEL agent existant.
│   L'agent stocke CE QU'IL APPREND et navigue sa propre connaissance.
│   Installation : 2 opérations (mcp.json + cat SKILL.md >> SOUL.md)
│
└── ghostcrab-project-architect/   ← Rôle 2 : Project Data Architect
    Skill additionnel qui donne à l'agent la capacité de
    MODÉLISER LES DONNÉES D'UN PROJET (ontologies, schémas domaine,
    bases de connaissance) sur les 3 extensions MFO.
    Pré-requis : ghostcrab-memory installé.
```

### Règle architecturale fondamentale

> Tout ce qui est identique entre les deux rôles vit dans `shared/` et est copié (pas symlinké — les symlinks cassent dans les ZIP de distribution) dans chaque skill au moment du `make dist`.

***

## Structure Complète du Repo

```
ghostcrab-skills/
│
├── Makefile                      ← dist, lint, validate
├── README.md                     ← entrée du repo
│
├── shared/
│   ├── SCHEMA_DESIGN.md          ← règles de conception de schémas
│   ├── QUERY_PATTERNS.md         ← 3 niveaux de lecture
│   ├── APP_PATTERNS.md           ← patterns applicatifs (pm, crm, kb)
│   └── bootstrap_seed.jsonl      ← entrées mfo:system canoniques
│
└── openclaw/
    ├── ghostcrab-memory/
    │   ├── mcp.json              ← déclaration MCP (9 tools)
    │   ├── SKILL.md              ← fragment SOUL.md (self-memory)
    │   ├── SCHEMA_DESIGN.md      ← copie de shared/
    │   ├── QUERY_PATTERNS.md     ← copie de shared/
    │   ├── APP_PATTERNS.md       ← copie de shared/
    │   └── README.md
    │
    └── ghostcrab-project-architect/
        ├── mcp.json              ← même contenu que ghostcrab-memory/mcp.json
        ├── SKILL.md              ← fragment SOUL.md (project architect)
        ├── SCHEMA_DESIGN_PROJECT.md ← raisonnement domaine-data
        ├── templates/
        │   ├── domain.schema.json   ← template de schéma domaine
        │   ├── graph.model.json     ← template de modèle graphe
        │   ├── migration.sql.tpl    ← template SQL seed
        │   └── types.md.tpl         ← guide génération types
        ├── examples/
        │   ├── project-management/
        │   │   ├── schema.json
        │   │   ├── graph.model.json
        │   │   ├── migration.sql
        │   │   └── README.md
        │   ├── crm/
        │   │   ├── schema.json
        │   │   ├── graph.model.json
        │   │   ├── migration.sql
        │   │   └── README.md
        │   └── knowledge-base/
        │       ├── schema.json
        │       ├── graph.model.json
        │       ├── migration.sql
        │       └── README.md
        └── README.md
```

***

## Séquence d'Exécution des MRs

```
MR 1 — Foundation (shared/ + Makefile)
  ↓
MR 2 — ghostcrab-memory (self-memory plug-in)
  ↓
MR 3 — ghostcrab-project-architect — Core (SKILL.md + SCHEMA_DESIGN_PROJECT.md)
  ↓
MR 4 — ghostcrab-project-architect — Templates + Examples
  ↓
MR 5 — Distribution + Validation
```

Chaque MR est mergeable indépendamment. Les MRs 3 et 4 peuvent être développés en parallèle après MR 2 mergé.

***

## MR 1 — Foundation

### PR 1.1 — Repo Init + Makefile

**WHY**
Le repo doit être distribuable sans build system complexe. `make dist` génère des ZIP installables pour chaque skill, en copiant les fichiers `shared/` dans chaque dossier destination. `make validate` vérifie la cohérence des `mcp.json` et la présence des fichiers obligatoires.

**WHAT**
- `README.md` racine avec vue d'ensemble des deux skills
- `Makefile` avec targets : `dist`, `validate`, `clean`
- Structure de dossiers vide (`.gitkeep` dans chaque dossier cible)

**HOW**

```makefile
# Makefile

SKILLS := openclaw/ghostcrab-memory openclaw/ghostcrab-project-architect
SHARED_FILES := SCHEMA_DESIGN.md QUERY_PATTERNS.md APP_PATTERNS.md

.PHONY: dist validate clean

dist: validate
	@for skill in $(SKILLS); do \
		echo "→ Copying shared files to $$skill"; \
		for f in $(SHARED_FILES); do \
			cp shared/$$f $$skill/$$f; \
		done; \
		echo "→ Building ZIP for $$skill"; \
		skillname=$$(basename $$skill); \
		zip -r dist/$${skillname}.zip $$skill/ \
			--exclude "*.gitkeep"; \
	done
	@echo "✓ dist/ ready"

validate:
	@echo "Validating mcp.json files..."
	@for skill in $(SKILLS); do \
		node -e "JSON.parse(require('fs').readFileSync('$$skill/mcp.json','utf8'))" \
			&& echo "  ✓ $$skill/mcp.json" \
			|| (echo "  ✗ $$skill/mcp.json INVALID" && exit 1); \
	done
	@echo "Checking required files..."
	@for skill in $(SKILLS); do \
		for f in mcp.json SKILL.md README.md; do \
			[ -f "$$skill/$$f" ] \
				&& echo "  ✓ $$skill/$$f" \
				|| (echo "  ✗ $$skill/$$f MISSING" && exit 1); \
		done; \
	done
	@echo "✓ Validation passed"

clean:
	rm -rf dist/
	mkdir -p dist/
```

**Acceptance criteria**
- `make validate` passe sur un repo vide avec fichiers placeholder
- `make dist` produit `dist/ghostcrab-memory.zip` et `dist/ghostcrab-project-architect.zip`
- Les ZIPs sont extractables et contiennent les fichiers `shared/` copiés

***

### PR 1.2 — `shared/SCHEMA_DESIGN.md`

**WHY**
Les règles de conception de schémas sont identiques pour les deux rôles et les deux clients (OpenClaw et Claude Code). Un seul fichier source de vérité, distribué dans chaque skill via `make dist`.

**WHAT**
Le fichier complet en 6 étapes : Check first → Identify type → Design facet → Design node → Design edge → Validate. Plus la section Anti-Patterns.

**HOW**

Contenu exact : le fichier `SCHEMA_DESIGN.md` tel que développé dans cette conversation. Structure :

```
# How to Design Your Own Memory Schemas

## Step 1 — Check First (Always)
## Step 2 — Identify the Information Type
  [Table: content → facet / entity → graph node / relation → graph edge]
## Step 3 — Design a Facet Schema
  Q1 One-sentence description
  Q2 Filter dimensions
  Q3 Value constraints
  Q4 Required vs optional
  Q5 3 concrete examples
  [Output template JSON]
## Step 4 — Design a Graph Node Type
  Q1 Type label
  Q2 Properties
  Q3 Minimum viable node
  Q4 ID convention (type:domain:name)
  [Output template JSON]
## Step 5 — Design a Graph Edge Type
  Q1 Direction
  Q2 Label (UPPER_SNAKE_CASE, true sentence test)
  Q3 Weight/confidence/temporal
  [Output template JSON]
## Step 6 — Validation Checklist
  □ 7 checkboxes
## Anti-Patterns (5 named patterns)
```

**Règle de rédaction critique :** chaque section doit être auto-suffisante. L'agent qui lit Step 3 ne doit pas avoir besoin de lire Step 2 pour comprendre quoi faire.

**Acceptance criteria**
- Le fichier contient exactement les 7 checkboxes dans Step 6
- Chaque Step produit un bloc JSON de sortie concret et complet
- Les Anti-Patterns couvrent : trop de required fields, facets vs nodes, edges vs properties, schemas génériques, over-engineering

***

### PR 1.3 — `shared/QUERY_PATTERNS.md` + `shared/APP_PATTERNS.md` + `shared/bootstrap_seed.jsonl`

**WHY**
`QUERY_PATTERNS.md` enseigne les 3 niveaux de lecture (count → filter → traverse → pack). `APP_PATTERNS.md` donne 3 patterns applicatifs concrets. `bootstrap_seed.jsonl` est la source de vérité des entrées `mfo:system` chargées au démarrage du serveur MFO — ce fichier est aussi la référence pour `03_bootstrap.sql` dans `ghostcrab`.

**WHAT**
- `QUERY_PATTERNS.md` : Level 1 Browse, Level 2 Filter, Level 3 Traverse, Standard Reading Sequence
- `APP_PATTERNS.md` : Pattern 1 Hierarchical Project, Pattern 2 CRM, Pattern 3 Knowledge Base, Meta-Pattern
- `bootstrap_seed.jsonl` : un objet JSON par ligne, chacun avec `content` + `facets` pour insertion dans `mfo_facets`

**HOW**

```jsonl
# bootstrap_seed.jsonl — une entrée par ligne, format JSONL strict
{"content":"ghostcrab_search retrieves ranked documents from your fact store. Use it when you know what content you want. Combine query (semantic) with filters (exact facet match) for precision. Empty query with filters = pure facet filter, fastest mode.","facets":{"entry_type":"tool","tool_name":"ghostcrab_search","level":"foundation","use_when":"You need to retrieve specific content by topic or facet value"}}
{"content":"ghostcrab_count returns counts grouped by any facet dimension. Call this BEFORE ghostcrab_search to understand what exists without fetching content. Zero token cost on content. Use it for dashboards, overviews, and deciding where to look.","facets":{"entry_type":"tool","tool_name":"ghostcrab_count","level":"foundation","use_when":"You want to know what exists before fetching it"}}
{"content":"ghostcrab_pack returns a pre-ranked, compact context bundle for your current query. Inject its pack_text at the top of your reasoning before any LLM turn. It is your working memory — it replaces manual context assembly.","facets":{"entry_type":"tool","tool_name":"ghostcrab_pack","level":"foundation","use_when":"Before any multi-step reasoning or domain-specific task"}}
{"content":"ghostcrab_status returns a one-read JSON snapshot: health (GREEN/YELLOW/RED), token_budget_remaining, open gap_nodes, and directives[] with auto-executable conditions. Read directives[] and execute matching conditions immediately.","facets":{"entry_type":"tool","tool_name":"ghostcrab_status","level":"foundation","use_when":"Session start, before expensive actions, or when something feels wrong"}}
{"content":"ghostcrab_remember stores a new fact, document, or observation. Returns UUID of stored item. Facets are free-form key-value pairs — design them to support your filtering needs.","facets":{"entry_type":"tool","tool_name":"ghostcrab_remember","level":"foundation","use_when":"Store any fact, observation, or document worth keeping"}}
{"content":"ghostcrab_coverage checks how well this agent knows a domain by comparing its knowledge graph against a domain ontology. Returns coverage_score (0-1) and gap_nodes. >= 0.85 = full autonomy. 0.70-0.85 = proceed with disclosed gaps. < 0.70 = escalate.","facets":{"entry_type":"tool","tool_name":"ghostcrab_coverage","level":"intermediate","use_when":"Before acting autonomously on a domain-specific task"}}
{"content":"ghostcrab_traverse walks the knowledge graph from a start node, following edge labels, up to a given depth. outbound=what this node affects; inbound=what affects this node. Use for dependency and impact analysis.","facets":{"entry_type":"tool","tool_name":"ghostcrab_traverse","level":"intermediate","use_when":"You need to understand structural relationships, not just content"}}
{"content":"ghostcrab_learn writes a new knowledge node or directed edge into the knowledge graph. Use it after completing a task where you learned something structural. A task is not done until your graph reflects what you learned.","facets":{"entry_type":"tool","tool_name":"ghostcrab_learn","level":"intermediate","use_when":"After completing a task that involved new structural knowledge"}}
{"content":"ghostcrab_schema_register creates a new facet schema, node type, or edge label. Call ghostcrab_schema_list first to check for existing schemas. Register only when you have 3 concrete examples ready.","facets":{"entry_type":"tool","tool_name":"ghostcrab_schema_register","level":"intermediate","use_when":"You encounter a new type of information with no matching schema"}}
{"content":"Reading sequence: (1) ghostcrab_count — shape of knowledge. (2) ghostcrab_search — right slice. (3) ghostcrab_traverse — structure and dependencies. (4) ghostcrab_pack — working context for reasoning. Use cheapest level that answers the question.","facets":{"entry_type":"rule","level":"foundation","use_when":"Any memory read operation"}}
{"content":"Write-back is mandatory. After every session: ghostcrab_remember for facts, ghostcrab_learn for nodes and edges. Memory not written back is lost at session end. A task is complete only when the graph reflects what was learned.","facets":{"entry_type":"rule","level":"foundation","use_when":"After every completed task, before session end"}}
{"content":"Escalation format: never say I don't know without structure. Format: {escalate:true, gap_node_id, gap_label, covered_up_to, reason, resume_condition}. Triggered when ghostcrab_coverage returns can_proceed_autonomously=false OR ghostcrab_pack returns has_blocking_constraint=true.","facets":{"entry_type":"rule","level":"foundation","use_when":"Gap detected or blocking constraint found"}}
{"content":"Schema design checklist before ghostcrab_schema_register: (1) 3 real examples ready? (2) Every required field always available? (3) Every facet dimension filterable? (4) Every edge label forms true sentence A LABEL B? (5) ghostcrab_schema_list checked first?","facets":{"entry_type":"rule","tool_name":"ghostcrab_schema_register","level":"intermediate","use_when":"Before designing a new schema"}}
{"content":"Facets are application state. A status facet dimension is simultaneously a search filter, a state machine state, and a dashboard metric. Design facet schemas like state machines — define all possible states upfront. ghostcrab_count on a status dimension IS your application dashboard.","facets":{"entry_type":"concept","level":"advanced","use_when":"Designing any facet schema that tracks state over time"}}
{"content":"The write boundary: pg_pragma never owns data. It materializes projections FROM pg_facets and pg_dgraph. Never write directly to projections. Write to facets via ghostcrab_remember, write to graph via ghostcrab_learn. If a projection is wrong, fix the source — not the projection.","facets":{"entry_type":"concept","level":"advanced","use_when":"Understanding why you cannot directly edit pack or projection output"}}
```

**Acceptance criteria**
- `bootstrap_seed.jsonl` est un JSONL valide : `jq -c '.' shared/bootstrap_seed.jsonl` passe sans erreur
- Chaque ligne a exactement `content` (string) et `facets` (object avec `entry_type` et `level`)
- Minimum 15 entrées : 9 tools + 4 rules + 2 concepts

***

## MR 2 — OpenClaw `ghostcrab-memory` (Self-Memory Plug-in)

### PR 2.1 — `openclaw/ghostcrab-memory/mcp.json`

**WHY**
C'est le seul fichier technique du skill. Il enregistre le MCP server et déclare les 9 tools avec leurs descriptions et input schemas. OpenClaw lit ce fichier au démarrage du gateway et expose les tools automatiquement à l'agent. Les descriptions dans ce fichier **sont** les instructions de l'agent — elles remplacent la documentation. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/0844f916-1193-453a-b2a1-1e2b9b722f80/openclaw.md?AWSAccessKeyId=ASIA2F3EMEYE3ZVQTRTM&Signature=vm2ot9VEm3JpW51xE%2BAAmgOcxU8%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEKX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJGMEQCIB4gBOtHbCZx6mgwKRhAl3oYOUC7ti690EgB91f6%2Fo8wAiBJMSMPTaU5fesio5uCxCzsS56Of7rQPW3%2F%2BSU5mlQpDirzBAhuEAEaDDY5OTc1MzMwOTcwNSIMjrLkDc5EvuocjcyBKtAEtrvfxGIW7iJrQAahwxHVgzUGWuHtYYKsvQLNfXhpx4GAdGgtPHkS1y8FC7WWZg3TqALix8krSqqcJUQthUVWsHL2hcTCePUTf8Hbh%2BmYaD%2Fb9UB30j14VO8%2FwlomibgSruuMtVbBubwP3kIyUAdzEN6zhfVRVhd0ng2gc%2BXTho%2BBRG2FNyJZBE1WH1zEoFjA%2Fcoqn4nGM54k8WXCXC7zmo0u1rOtsyHgoUszNYrCRb%2F%2FC6en6AS36Ocb6rItzlOF%2FgkQnwQI2XyeDoknYd%2Fu0ydRWfd2OserOwrmkTTikhUXILb48ykOwMnYS2OEgvUQe%2F3uXOXH0H%2FLo1Ob%2FbCJoPJP5fxlNBkxHgEE5i7fmchLDOvAtIF5k9DkYoBdkSr6v9%2B6CcEqSXl3FlqNl4LI9t6xean5a54DKKGBB%2BdTU1dq%2FJ0LizxwhI1Xv9V96GTs7QJ73441f0KUAcY6J%2BmWaKJy%2B3kr8AjxrShEq4ksqCPZCdAujbkKUv%2FdyUaXCa05pTSHFwUg9XgTG2FWVb2J%2B1R1lgDnsWiSWirtqNxH%2B5jb0lImOTzLUZzf9i4ppHgoTnieZbRoKnWpUKHcBb4sQx%2F36zqM3eGtSyVV3ShV%2FJXVslLWHO9d4%2FD1MUFVh5p8XhL%2BasYkfQLzzU3zMFmOmIC4%2FzIQRv9Uaj%2BEmZC6oLX98oWZVhCYv9lBmtBvANCo2TzeR1sc0DXzNcv37VFPdvmSd%2B5qJc%2F1sQPOs46cWnGP9BgbdI5PmXP5LUpvfRPW%2BfU582BS4%2Bky2R6gMNczbTDWoIHOBjqZAQr%2Fms8I5LwbvZTzVglNd%2FcarBlL3DHzwJkhywbAdHyDqJnY07Tjn85odEsnZ%2BCe9wlQT5OKTMMX6ftLU3oG7nudBRupmjJouL2scFY4w0gNrrOBpZFciWfxGWVFWwBlGm2ISQMo8%2BVhRabPRcdtWK2HZBAk6eu1lv99NH9rpH5i91elv68iRXcAufA9hpwyjuEBsYjUed6Ung%3D%3D&Expires=1774213692)

**WHAT**
Déclaration complète des 9 tools : `ghostcrab_search`, `ghostcrab_remember`, `ghostcrab_count`, `ghostcrab_coverage`, `ghostcrab_traverse`, `ghostcrab_learn`, `ghostcrab_schema_register`, `ghostcrab_schema_list`, `ghostcrab_schema_inspect`, `ghostcrab_pack`, `ghostcrab_status`.

**HOW**

```json
{
  "mcpServers": {
    "ghostcrab-memory": {
      "command": "npx",
      "args": ["@mindflight/ghostcrab"],
      "env": {
        "DATABASE_URL": "postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab"
      },
      "description": "MindFlight MFO Stack — persistent facts (pg_facets), knowledge graph (pg_dgraph), and working memory (pg_pragma) for any OpenClaw agent",
      "tools": {

        "ghostcrab_search": {
          "description": "Retrieve ranked documents from persistent fact store. Combine query (semantic/BM25) with filters (exact facet match). Empty query + filters = pure facet filter, fastest mode. Returns: {results[], returned, query, filters}",
          "input": {
            "query":     { "type": "string",  "required": false, "default": "",
                           "description": "Semantic or keyword query. Empty string for pure filter mode." },
            "filters":   { "type": "object",  "required": false, "default": {},
                           "description": "Key-value facet filters. Array value = OR. E.g. {status:'blocked'} or {status:['todo','in_progress']}" },
            "limit":     { "type": "integer", "required": false, "default": 10,
                           "description": "Max results (1-100)" },
            "schema_id": { "type": "string",  "required": false,
                           "description": "Filter by schema ID. E.g. 'pm:task' or 'mfo:system'" }
          }
        },

        "ghostcrab_remember": {
          "description": "Store a new fact, document, or observation. Returns UUID of stored item for future reference. Call after every task where you learned something worth keeping.",
          "input": {
            "content":     { "type": "string",  "required": true,
                             "description": "The text content to store" },
            "facets":      { "type": "object",  "required": false, "default": {},
                             "description": "Key-value metadata. Design dimensions you'll actually filter by." },
            "schema_id":   { "type": "string",  "required": false, "default": "agent:observation",
                             "description": "Schema this item belongs to" },
            "created_by":  { "type": "string",  "required": false },
            "valid_until": { "type": "string",  "required": false,
                             "description": "ISO date string. Item expires after this date." }
          }
        },

        "ghostcrab_count": {
          "description": "Count items grouped by facet dimensions — zero content token cost. Call BEFORE ghostcrab_search to understand what exists. Returns {counts: {dimension: {value: count}}}. Use for dashboards and deciding where to look.",
          "input": {
            "group_by":  { "type": "array",   "required": true,
                           "description": "Facet dimension names to group by. E.g. ['status','domain'] or ['status','phase']" },
            "schema_id": { "type": "string",  "required": false,
                           "description": "Filter by schema before counting" },
            "filters":   { "type": "object",  "required": false, "default": {},
                           "description": "Pre-filter before counting. E.g. {project:'my-project'}" }
          }
        },

        "ghostcrab_coverage": {
          "description": "Check epistemic coverage for a domain. Returns coverage_score (0-1), gap_nodes[], and can_proceed_autonomously. Rule: >= 0.85 = full autonomy. 0.70-0.85 = proceed with disclosed gaps. < 0.70 = escalate.",
          "input": {
            "domain":   { "type": "string",  "required": true,
                          "description": "Domain to check coverage for. E.g. 'gdpr', 'contract-law', 'kubernetes'" },
            "agent_id": { "type": "string",  "required": false, "default": "agent:self" }
          }
        },

        "ghostcrab_traverse": {
          "description": "Walk the knowledge graph from a start node. outbound=what this node affects; inbound=what affects this node. Returns path[], gap_candidates[]. Use for dependency and impact analysis.",
          "input": {
            "start":       { "type": "string",  "required": true,
                             "description": "Start node ID. E.g. 'task:my-project:oauth' or 'phase:auth'" },
            "direction":   { "type": "string",  "required": false, "default": "outbound",
                             "description": "outbound (what this affects) or inbound (what affects this)" },
            "edge_labels": { "type": "array",   "required": false, "default": [],
                             "description": "Edge labels to follow. Empty = all. E.g. ['BLOCKS','REQUIRES']" },
            "depth":       { "type": "integer", "required": false, "default": 3,
                             "description": "Max traversal depth (1-10)" }
          }
        },

        "ghostcrab_learn": {
          "description": "Write a knowledge node or directed edge to the graph. Call after completing any task involving structural knowledge. Learning is mandatory — task is not done until graph is updated.",
          "input": {
            "node": {
              "type": "object", "required": false,
              "description": "Upsert a node. Properties: id (type:domain:name convention), node_type, label, properties{}",
              "properties": {
                "id":         { "type": "string",  "description": "Unique ID. Convention: type:domain:name. E.g. concept:gdpr:data-minimization" },
                "node_type":  { "type": "string",  "description": "concept|task|regulation|person|tool|process|organization" },
                "label":      { "type": "string",  "description": "Human-readable label" },
                "properties": { "type": "object",  "description": "domain, mastery(0-1), status, source_ref, ..." }
              }
            },
            "edge": {
              "type": "object", "required": false,
              "description": "Insert a directed edge A→B. Properties: source, target, label, weight(0-1)",
              "properties": {
                "source":  { "type": "string", "description": "Source node ID" },
                "target":  { "type": "string", "description": "Target node ID" },
                "label":   { "type": "string", "description": "REQUIRES|ENABLES|BLOCKS|CONTRADICTS|SUPERSEDES|BELONGS_TO|HAS_GAP|DELEGATES_TO|CONTAINS|DEPENDS_ON|ASSIGNED_TO|PRODUCED" },
                "weight":  { "type": "number", "description": "Edge strength 0.0 to 1.0", "default": 1.0 }
              }
            }
          }
        },

        "ghostcrab_schema_register": {
          "description": "Register a new facet schema, graph node type, or edge label. ALWAYS call ghostcrab_schema_list first to avoid duplicates. Returns {registered:bool, id, schema_id} or {registered:false, reason, existing_id} if duplicate.",
          "input": {
            "target":     { "type": "string",  "required": true,
                            "description": "facets | graph_node | graph_edge" },
            "definition": { "type": "object",  "required": true,
                            "description": "Schema definition per SCHEMA_DESIGN.md. Must include schema_id and description. Must have 3 examples." }
          }
        },

        "ghostcrab_schema_list": {
          "description": "List all registered schemas. ALWAYS call before ghostcrab_schema_register to avoid duplicates. Returns {schemas:[]} array with schema_id, target, description.",
          "input": {
            "target": { "type": "string", "required": false, "default": "all",
                        "description": "facets | graph_node | graph_edge | all" }
          }
        },

        "ghostcrab_schema_inspect": {
          "description": "Get full definition of a registered schema by schema_id. Call when you want to extend an existing schema rather than create a new one.",
          "input": {
            "schema_id": { "type": "string", "required": true }
          }
        },

        "ghostcrab_pack": {
          "description": "Get pre-ranked compact context bundle for current query. Inject pack_text at TOP of reasoning before every non-trivial LLM turn. Returns {pack_text, pack[], token_estimate, has_blocking_constraint}.",
          "input": {
            "query":    { "type": "string",  "required": true,
                          "description": "Current task or question" },
            "agent_id": { "type": "string",  "required": false, "default": "agent:self" },
            "scope":    { "type": "string",  "required": false,
                          "description": "Narrow to project scope. E.g. 'project:my-project'" },
            "limit":    { "type": "integer", "required": false, "default": 15 }
          }
        },

        "ghostcrab_status": {
          "description": "One-read operational + epistemic snapshot. Returns {operational:{health,state,metrics}, epistemic:{coverage_score,gap_nodes,blocking_constraints}, directives[]}. Read directives[] and execute matching conditions immediately.",
          "input": {
            "agent_id": { "type": "string", "required": false, "default": "agent:self" }
          }
        }

      }
    }
  }
}
```

**Acceptance criteria**
- `node -e "JSON.parse(require('fs').readFileSync('mcp.json','utf8'))"` passe
- 11 tools déclarés : ghostcrab_search, ghostcrab_remember, ghostcrab_count, ghostcrab_coverage, ghostcrab_traverse, ghostcrab_learn, ghostcrab_schema_register, ghostcrab_schema_list, ghostcrab_schema_inspect, ghostcrab_pack, ghostcrab_status
- Chaque tool a `description`, `input` avec au moins un champ
- Les descriptions de tools contiennent les règles `use_when` et les formats de sortie

***

### PR 2.2 — `openclaw/ghostcrab-memory/SKILL.md`

**WHY**
Fragment additionnel à coller dans le `SOUL.md` de n'importe quel agent OpenClaw existant. Doit être **additif uniquement** — `cat SKILL.md >> SOUL.md` ne doit jamais casser un agent existant. Contient 3 blocs : tools table, 3 rules, schema design meta-rule. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/0844f916-1193-453a-b2a1-1e2b9b722f80/openclaw.md?AWSAccessKeyId=ASIA2F3EMEYE3ZVQTRTM&Signature=vm2ot9VEm3JpW51xE%2BAAmgOcxU8%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEKX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJGMEQCIB4gBOtHbCZx6mgwKRhAl3oYOUC7ti690EgB91f6%2Fo8wAiBJMSMPTaU5fesio5uCxCzsS56Of7rQPW3%2F%2BSU5mlQpDirzBAhuEAEaDDY5OTc1MzMwOTcwNSIMjrLkDc5EvuocjcyBKtAEtrvfxGIW7iJrQAahwxHVgzUGWuHtYYKsvQLNfXhpx4GAdGgtPHkS1y8FC7WWZg3TqALix8krSqqcJUQthUVWsHL2hcTCePUTf8Hbh%2BmYaD%2Fb9UB30j14VO8%2FwlomibgSruuMtVbBubwP3kIyUAdzEN6zhfVRVhd0ng2gc%2BXTho%2BBRG2FNyJZBE1WH1zEoFjA%2Fcoqn4nGM54k8WXCXC7zmo0u1rOtsyHgoUszNYrCRb%2F%2FC6en6AS36Ocb6rItzlOF%2FgkQnwQI2XyeDoknYd%2Fu0ydRWfd2OserOwrmkTTikhUXILb48ykOwMnYS2OEgvUQe%2F3uXOXH0H%2FLo1Ob%2FbCJoPJP5fxlNBkxHgEE5i7fmchLDOvAtIF5k9DkYoBdkSr6v9%2B6CcEqSXl3FlqNl4LI9t6xean5a54DKKGBB%2BdTU1dq%2FJ0LizxwhI1Xv9V96GTs7QJ73441f0KUAcY6J%2BmWaKJy%2B3kr8AjxrShEq4ksqCPZCdAujbkKUv%2FdyUaXCa05pTSHFwUg9XgTG2FWVb2J%2B1R1lgDnsWiSWirtqNxH%2B5jb0lImOTzLUZzf9i4ppHgoTnieZbRoKnWpUKHcBb4sQx%2F36zqM3eGtSyVV3ShV%2FJXVslLWHO9d4%2FD1MUFVh5p8XhL%2BasYkfQLzzU3zMFmOmIC4%2FzIQRv9Uaj%2BEmZC6oLX98oWZVhCYv9lBmtBvANCo2TzeR1sc0DXzNcv37VFPdvmSd%2B5qJc%2F1sQPOs46cWnGP9BgbdI5PmXP5LUpvfRPW%2BfU582BS4%2Bky2R6gMNczbTDWoIHOBjqZAQr%2Fms8I5LwbvZTzVglNd%2FcarBlL3DHzwJkhywbAdHyDqJnY07Tjn85odEsnZ%2BCe9wlQT5OKTMMX6ftLU3oG7nudBRupmjJouL2scFY4w0gNrrOBpZFciWfxGWVFWwBlGm2ISQMo8%2BVhRabPRcdtWK2HZBAk6eu1lv99NH9rpH5i91elv68iRXcAufA9hpwyjuEBsYjUed6Ung%3D%3D&Expires=1774213692)

**WHAT**
Un fichier Markdown en 3 sections : table des tools avec `when_to_call`, 3 règles comportementales, bloc optionnel schema design.

**HOW**

```markdown
## Memory & Knowledge Tools (MFO Stack)

You have access to a persistent PostgreSQL memory system via the
`ghostcrab-memory` MCP server. Eleven tools. Three mandatory rules.

---

### Your Tools

| Tool | When to use it |
|---|---|
| `ghostcrab_status` | **Always first at session start** — get health + gaps + directives |
| `ghostcrab_pack` | **Always before complex reasoning** — get pre-ranked working context |
| `ghostcrab_count` | Before any planning task — understand what exists at zero token cost |
| `ghostcrab_search` | Retrieve specific content by topic, facet filter, or both |
| `ghostcrab_remember` | Store any fact, decision, or observation worth keeping |
| `ghostcrab_coverage` | Before domain-specific tasks — check how well you know this domain |
| `ghostcrab_traverse` | Understand dependencies, impacts, and structural relationships |
| `ghostcrab_learn` | After completing a task — write back what you learned to the graph |
| `ghostcrab_schema_register` | When you need a new storage structure — design and register it |
| `ghostcrab_schema_list` | Always before ghostcrab_schema_register — check for existing schemas |
| `ghostcrab_schema_inspect` | Get full definition of an existing schema before extending it |

---

### Three Mandatory Rules

**Rule 1 — Pack before you reason.**
Before any question requiring facts, domain knowledge, or multi-step
reasoning: call `ghostcrab_pack(query)` first.
Inject `pack_text` at the TOP of your reasoning context.
This is your working memory. Use it — don't improvise context.

**Rule 2 — Write back before session ends.**
After every task where you learned something:
- New fact or document → `ghostcrab_remember`
- New concept or entity → `ghostcrab_learn` (node)
- New relationship → `ghostcrab_learn` (edge)
Memory not written back is permanently lost. This is not optional.

**Rule 3 — Be honest about gaps.**
If `ghostcrab_coverage` returns `coverage_score < 0.70` or `gap_nodes`:
> "My knowledge on [domain] is [score*100]% complete.
> Verified gaps: [gap_labels].
> What I can tell you based on what I do know: …"

Never present partial coverage as full confidence.
If `can_proceed_autonomously = false`, use this escalation format:
```json
{
  "escalate": true,
  "gap_node_id": "concept:X",
  "gap_label": "Human-readable name",
  "covered_up_to": "What you handled before the gap",
  "reason": "Why this gap matters for this task",
  "resume_condition": "What needs to happen to continue"
}
```

---

### Designing Your Own Memory Schemas

You are not limited to predefined schemas. When you encounter
a new type of information with no matching schema:

1. `ghostcrab_schema_list()` — check for duplicates first
2. Apply SCHEMA_DESIGN.md reasoning — ask the 5 design questions
3. `ghostcrab_schema_register()` — only when you have 3 real examples ready
4. Start storing with your new structure

**The one meta-rule:**
A schema is a contract with your future self. Design it so that
in 30 days, without memory of today, you can look at a stored item
and immediately know what it is, how to find it, and how it
connects to everything else.

---

### Session Start Sequence

On every new session, run:
```
1. ghostcrab_status()            → read health + directives, execute conditions
2. ghostcrab_search(
     query="session start",
     filters={entry_type:"rule", level:"foundation"},
     limit=5
   )                        → reload core rules if needed
3. ghostcrab_pack(query=<task>)  → load working context for first task
```
```

**Acceptance criteria**
- `cat openclaw/ghostcrab-memory/SKILL.md >> /tmp/test_soul.md` produit un fichier Markdown valide
- Le fichier ne contient aucune référence à un agent spécifique (Clawdbot, Echo, etc.)
- Les 3 règles sont numérotées et contiennent chacune un trigger précis
- Le format d'escalade JSON est complet (6 champs)

***

### PR 2.3 — `openclaw/ghostcrab-memory/README.md`

**WHY**
C'est le fichier de découverte pour awesome-openclaw-agents et GitHub. Il doit permettre à un développeur de comprendre la valeur en 30 secondes et d'installer en 3 commandes.

**WHAT**
README avec : tagline, what it adds (4 bullets), install (3 steps), quick test (4 prompts), compatibility, requirements, category tags.

**HOW**

```markdown
# 🧠 ghostcrab-memory — Persistent Memory for Any OpenClaw Agent

> Add persistent memory, a knowledge graph, and smart context packing
> to any existing OpenClaw agent in under 5 minutes.

## What It Adds

- **Persistent fact store** — your agent remembers across sessions
  via pg_facets (full-text + semantic search + facet filtering)
- **Knowledge graph** — tracks what it knows, what it's missing,
  and how concepts relate via pg_dgraph
- **Smart context packing** — pre-ranked, token-efficient working
  memory bundle per query via pg_pragma
- **Honest gap disclosure** — structured epistemic self-awareness
  with coverage scores and escalation contracts

## Requirements

- Docker (for the PostgreSQL + MFO extensions image)
- Node.js 18+ (for the MCP server)
- Any OpenClaw agent with an existing `SOUL.md`

## Install

### Step 1 — Start the database
```bash
docker run -d -p 5432:5432 \
  -e POSTGRES_DB=mfo \
  -e POSTGRES_USER=mfo \
  -e POSTGRES_PASSWORD=mfo \
  mindflight/ghostcrab-postgres
```

### Step 2 — Register the MCP server
Merge `mcp.json` into your `~/.openclaw/mcp_servers.json`, or:
```bash
cat mcp.json >> ~/.openclaw/mcp_servers.json
```

### Step 3 — Add the skill to your agent
```bash
cat SKILL.md >> ~/.openclaw/workspace/your-agent/SOUL.md
openclaw gateway restart
```

## Quick Test

Ask your agent:
> "Check your memory status."
→ Should call `ghostcrab_status()` and report health GREEN

> "What do you know about GDPR data transfers?"
→ Should call `ghostcrab_pack()` then `ghostcrab_coverage(domain='gdpr')`

> "Remember that our API rate limit is 100 req/min."
→ Should call `ghostcrab_remember(content=..., facets={type:'constraint'})`

> "Show me what types of information you have stored."
→ Should call `ghostcrab_count(group_by=['schema_id'])`

## Compatibility

Works with any OpenClaw agent: Clawdbot, MoltBot, Echo, Radar,
or any custom agent. Additive only — does not modify existing behavior.

## Want to Model Project Data Too?

See `ghostcrab-project-architect` — the companion skill that lets your
agent design and manage domain-specific data models (project management,
CRM, knowledge bases) on the same MFO infrastructure.

## Category
`Memory` · `Knowledge` · `Tools` · `Data` · `Foundation`
```

**Acceptance criteria**
- 3 install steps exécutables tels quels sur macOS et Linux
- Les 4 quick test prompts produisent des appels tool identifiables
- La section "Want to Model Project Data Too?" pointe vers `ghostcrab-project-architect`

***

## MR 3 — OpenClaw `ghostcrab-project-architect` — Core

### PR 3.1 — `openclaw/ghostcrab-project-architect/SKILL.md`

**WHY**
Ce fragment s'ajoute au `SOUL.md` après `ghostcrab-memory/SKILL.md`. Il donne à l'agent son rôle d'architecte de données — il ne modifie pas les 3 règles de base, il ajoute un workflow de 8 étapes pour modéliser les données d'un projet. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/34b41d7b-723a-4c4b-931a-9f61dfecb80f/memoproj_conceptual_plan_304b35ed.plan-2.md)

**WHAT**
Un bloc Markdown avec : activation triggers, 8-phase workflow, output contract, 3 query examples post-modélisation.

**HOW**

```markdown
## Project Data Architect Role (MFO Stack Extension)

In addition to managing your own memory, you can model and structure
the domain data of any project using the MFO stack. This makes project
knowledge queryable, relational, and context-packable for any agent
working on this project.

---

### When to Activate This Role

Activate when the user says or implies:
- "Model the data for X"
- "Organize our knowledge about Y"
- "Create a data structure for Z"
- "Set up a database schema for [domain]"
- "Help me track [any collection of entities]"
- Or when you discover the project needs structured domain knowledge
  that doesn't fit `agent:observation`

---

### The 8-Phase Modeling Workflow

Execute these phases in order. Each phase produces a named output.

**Phase 1 — Discover**
```
ghostcrab_schema_list(target="all")
ghostcrab_count(group_by=["schema_id"])
```
Output: list of existing schemas, count per schema.
Decision: identify gaps — what domains are NOT yet modeled?

**Phase 2 — Read the Project**
Read without calling any tools:
- Existing types/, models/, migrations/ if they exist
- README.md, architecture docs
- Any domain documentation
Questions to answer internally:
  1. What are the main entities?
  2. What states does each entity go through?
  3. How do entities relate to each other?
  4. What are the query patterns? (What will people ask most often?)
  5. What hierarchy exists? (parent-child relationships)

**Phase 3 — Produce Domain Analysis** (output before designing)
Before touching any schema tool, write a domain analysis block:
```
ENTITIES: [list]
STATE_MACHINES: { entity: [state1, state2, ...], ... }
QUERY_PATTERNS: ["Show me all X where Y", ...]
RELATIONSHIPS: [{ from, to, label, traversable:bool }, ...]
HIERARCHY: [parent → child → grandchild, ...]
```
Show this to the user if in interactive mode. Proceed if autonomous.

**Phase 4 — Apply Decision Tree**
For each entity, decide:
```
Has content to read?       YES → Facet schema
Has relations to traverse? YES → Also graph node
Relationship is directional AND meaningful? YES → Graph edge
Relationship is just a FK? YES → Facet field on child
```

**Phase 5 — Design Schemas**
Apply SCHEMA_DESIGN.md rules (Steps 3-5) for each entity.
Mandatory: every status enum must list ALL possible states upfront.
Convention: schema_id format = `[project-prefix]:[entity-name]`
Example: `pm:task`, `crm:contact`, `kb:article`

**Phase 6 — Register Schemas**
```
ghostcrab_schema_list()                        ← final duplicate check
ghostcrab_schema_register(target, definition)  ← one call per schema
```
Order: facet schemas first, then graph node types, then edge labels.

**Phase 7 — Generate Artifacts**
Produce and write to `mfo/` directory:
- `mfo/schemas/[domain].schema.json` — complete schema definitions
- `mfo/schemas/graph.model.json` — node types + edge labels
- `mfo/migrations/[NNN]_[domain].sql` — registration INSERT statements
- `mfo/schemas/index.json` — registry of all schemas in this project

**Phase 8 — Validate**
```
ghostcrab_count(schema_id="[new_schema_id]", group_by=["status"])
```
Should return `{counts: {status: {}}}` — empty but functional.
This confirms the schema is registered and queryable.

---

### Output Contract

After every modeling session, always produce:
1. `mfo/schemas/index.json` with `schemas[]` and `dashboard_queries{}`
2. At least one working `ghostcrab_count` query in the README
3. A 3-line "How to query this model" section for the next agent

---

### After Modeling — Using the Data (Quick Reference)

**Dashboard: how is the project going?**
```
ghostcrab_count(schema_id="[prefix]:task",
                 group_by=["status","phase"],
                 filters={project:"my-project"})
```

**Find blocked items:**
```
ghostcrab_search(query="", filters={status:"blocked", project:"my-project"},
           schema_id="[prefix]:task", limit=20)
```

**Impact analysis — what breaks if X is blocked?**
```
ghostcrab_traverse(start="task:my-project:X",
             direction="outbound",
             edge_labels=["BLOCKS","DEPENDS_ON"],
             depth=3)
```

**Context for next planning session:**
```
ghostcrab_pack(query="[project] sprint planning", scope="project:[name]")
```
```

**Acceptance criteria**
- Le workflow a exactement 8 phases numérotées
- Chaque phase produit un output nommé
- Le Decision Tree est présent en Phase 4 sous forme de bloc `code`
- Les 4 query examples post-modélisation sont copiables tels quels

***

### PR 3.2 — `openclaw/ghostcrab-project-architect/SCHEMA_DESIGN_PROJECT.md`

**WHY**
`shared/SCHEMA_DESIGN.md` enseigne comment modéliser n'importe quelle information. Ce fichier est spécifique au cas où l'agent modélise les données d'un **projet externe** — les questions à se poser sont différentes (query patterns, hiérarchies, state machines). Il complète et ne remplace pas `SCHEMA_DESIGN.md`. [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/0844f916-1193-453a-b2a1-1e2b9b722f80/openclaw.md?AWSAccessKeyId=ASIA2F3EMEYE3ZVQTRTM&Signature=vm2ot9VEm3JpW51xE%2BAAmgOcxU8%3D&x-amz-security-token=IQoJb3JpZ2luX2VjEKX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJGMEQCIB4gBOtHbCZx6mgwKRhAl3oYOUC7ti690EgB91f6%2Fo8wAiBJMSMPTaU5fesio5uCxCzsS56Of7rQPW3%2F%2BSU5mlQpDirzBAhuEAEaDDY5OTc1MzMwOTcwNSIMjrLkDc5EvuocjcyBKtAEtrvfxGIW7iJrQAahwxHVgzUGWuHtYYKsvQLNfXhpx4GAdGgtPHkS1y8FC7WWZg3TqALix8krSqqcJUQthUVWsHL2hcTCePUTf8Hbh%2BmYaD%2Fb9UB30j14VO8%2FwlomibgSruuMtVbBubwP3kIyUAdzEN6zhfVRVhd0ng2gc%2BXTho%2BBRG2FNyJZBE1WH1zEoFjA%2Fcoqn4nGM54k8WXCXC7zmo0u1rOtsyHgoUszNYrCRb%2F%2FC6en6AS36Ocb6rItzlOF%2FgkQnwQI2XyeDoknYd%2Fu0ydRWfd2OserOwrmkTTikhUXILb48ykOwMnYS2OEgvUQe%2F3uXOXH0H%2FLo1Ob%2FbCJoPJP5fxlNBkxHgEE5i7fmchLDOvAtIF5k9DkYoBdkSr6v9%2B6CcEqSXl3FlqNl4LI9t6xean5a54DKKGBB%2BdTU1dq%2FJ0LizxwhI1Xv9V96GTs7QJ73441f0KUAcY6J%2BmWaKJy%2B3kr8AjxrShEq4ksqCPZCdAujbkKUv%2FdyUaXCa05pTSHFwUg9XgTG2FWVb2J%2B1R1lgDnsWiSWirtqNxH%2B5jb0lImOTzLUZzf9i4ppHgoTnieZbRoKnWpUKHcBb4sQx%2F36zqM3eGtSyVV3ShV%2FJXVslLWHO9d4%2FD1MUFVh5p8XhL%2BasYkfQLzzU3zMFmOmIC4%2FzIQRv9Uaj%2BEmZC6oLX98oWZVhCYv9lBmtBvANCo2TzeR1sc0DXzNcv37VFPdvmSd%2B5qJc%2F1sQPOs46cWnGP9BgbdI5PmXP5LUpvfRPW%2BfU582BS4%2Bky2R6gMNczbTDWoIHOBjqZAQr%2Fms8I5LwbvZTzVglNd%2FcarBlL3DHzwJkhywbAdHyDqJnY07Tjn85odEsnZ%2BCe9wlQT5OKTMMX6ftLU3oG7nudBRupmjJouL2scFY4w0gNrrOBpZFciWfxGWVFWwBlGm2ISQMo8%2BVhRabPRcdtWK2HZBAk6eu1lv99NH9rpH5i91elv68iRXcAufA9hpwyjuEBsYjUed6Ung%3D%3D&Expires=1774213692)

**WHAT**
6 questions de domaine + decision tree + exemple canonique project-management complet avec analyse, schémas, nodes, edges.

**HOW**

```markdown
# Project Domain Modeling

You are modeling the data of a project domain, not your own memory.
Same tools. Different questions. Read this AFTER SCHEMA_DESIGN.md.

---

## The 6 Domain Questions

Before any tool call, answer these by reading project files:

**Q1 — What are the main entities?**
List them with two properties each:
- has_content: does this entity have text content worth retrieving? → Facet
- has_relations: does it relate to other entities you'll traverse? → Graph node

**Q2 — What states does each entity go through?**
This is your most important design decision.
Draw the state machine for each entity with has_content=true.
Rule: every state that will be FILTERED or COUNTED = a facet enum value.
Rule: every state must be mutually exclusive.

**Q3 — What are the top 5 query patterns?**
Write them as natural language questions:
"Show me all [entity] where [condition]"
"How many [entity] by [dimension]?"
"What [entity] depends on [other entity]?"
Each pattern maps to one level of the reading sequence.

**Q4 — What is the hierarchy?**
If parent-child relationships exist:
- Add a `parent_key` facet field on the child (for flat filtering)
- Add a CONTAINS edge in the graph (for hierarchical traversal)
Both are needed. They answer different queries.

**Q5 — What are the traversable relationships?**
A relationship is traversable if you'll ask:
"What are all the descendants of X?" or
"What breaks if X is blocked?" or
"What prerequisites does X require?"
Traversable = graph edge. Non-traversable = facet field.

**Q6 — What context does the next LLM turn need?**
Think about ghostcrab_pack output. What lines should appear?
- GOAL line: the main objective for this domain
- CONSTRAINT lines: blockers and hard limits
- FACT lines: key current-state facts
- STEP lines: what to do next
Design your schema so these can be auto-projected.

---

## Decision Tree (Extended for Project Domains)

```
Entity has content to read AND states to track?
  → Facet schema with status enum

Entity has identity and relates to other entities?
  → Also a graph node (same entity, dual representation)

Relationship: parent CONTAINS child (hierarchy)?
  → Facet field: child.parent_id = parent.id (flat filter)
  → Graph edge: CONTAINS (hierarchical traversal)
  → Need BOTH

Relationship: A requires B to exist/complete first?
  → Graph edge: DEPENDS_ON or REQUIRES

Relationship: A being blocked causes B to be blocked?
  → Graph edge: BLOCKS

Relationship: A was created during B?
  → Graph edge: PRODUCED_BY

Relationship: A is owned/assigned to B?
  → Facet field IF B is not a traversable node
  → Graph edge ASSIGNED_TO IF B is a node you traverse
```

---

## Canonical Example: Project Management Domain

### Domain Analysis Output (Phase 3)

```json
{
  "domain": "project-management",
  "entities": {
    "Project":  { "has_content": true,  "has_relations": true  },
    "Phase":    { "has_content": true,  "has_relations": true  },
    "Stage":    { "has_content": true,  "has_relations": true  },
    "Task":     { "has_content": true,  "has_relations": true  },
    "Person":   { "has_content": false, "has_relations": true  },
    "Decision": { "has_content": true,  "has_relations": true  }
  },
  "state_machines": {
    "Project": ["draft","active","paused","complete","archived"],
    "Phase":   ["planned","active","complete","blocked"],
    "Stage":   ["planned","active","complete","blocked"],
    "Task":    ["todo","in_progress","review","done","blocked","cancelled"],
    "Decision":["proposed","accepted","rejected","superseded"]
  },
  "query_patterns": [
    "Show me all blocked tasks in phase X → search filter",
    "How many tasks per status per phase → facets_count",
    "What breaks if task Y stays blocked → traverse BLOCKS outbound",
    "Who owns the most blocked tasks → facets_count + traverse ASSIGNED_TO",
    "What context for sprint planning → pack"
  ],
  "relationships": [
    { "from":"Project","to":"Phase",    "label":"CONTAINS",    "traversable":true  },
    { "from":"Phase",  "to":"Stage",    "label":"CONTAINS",    "traversable":true  },
    { "from":"Stage",  "to":"Task",     "label":"CONTAINS",    "traversable":true  },
    { "from":"Task",   "to":"Task",     "label":"BLOCKS",      "traversable":true  },
    { "from":"Task",   "to":"Task",     "label":"DEPENDS_ON",  "traversable":true  },
    { "from":"Task",   "to":"Person",   "label":"ASSIGNED_TO", "traversable":false },
    { "from":"Task",   "to":"Decision", "label":"PRODUCED",    "traversable":true  }
  ],
  "hierarchy": "Project > Phase > Stage > Task"
}
```

### Facet Schemas (Phase 5 output)

```json
[
  {
    "schema_id": "pm:phase",
    "description": "A project phase with status and timeline",
    "facets": {
      "required": {
        "project":    { "type": "string" },
        "phase_name": { "type": "string" },
        "status":     { "type": "enum",
                        "values": ["planned","active","complete","blocked"] }
      },
      "optional": {
        "owner":    { "type": "string" },
        "due_date": { "type": "date" },
        "priority": { "type": "enum", "values": ["critical","high","normal","low"] }
      }
    },
    "examples": [
      { "content": "Authentication phase — OAuth2 and session management",
        "facets": { "project": "acme-api", "phase_name": "auth", "status": "active" } },
      { "content": "Payment integration phase — Stripe and invoicing",
        "facets": { "project": "acme-api", "phase_name": "payments", "status": "blocked" } },
      { "content": "Infrastructure phase — Docker and CI/CD",
        "facets": { "project": "acme-api", "phase_name": "infra", "status": "complete" } }
    ]
  },
  {
    "schema_id": "pm:task",
    "description": "Atomic unit of work within a stage",
    "facets": {
      "required": {
        "project": { "type": "string" },
        "phase":   { "type": "string" },
        "status":  { "type": "enum",
                     "values": ["todo","in_progress","review","done","blocked","cancelled"] }
      },
      "optional": {
        "stage":       { "type": "string" },
        "assigned_to": { "type": "string" },
        "priority":    { "type": "enum", "values": ["critical","high","normal","low"] },
        "estimate_h":  { "type": "number" },
        "pr_ref":      { "type": "string" },
        "tags":        { "type": "string" }
      }
    },
    "examples": [
      { "content": "Implement OAuth2 PKCE flow for mobile clients",
        "facets": { "project":"acme-api","phase":"auth","status":"in_progress","assigned_to":"alice","priority":"high" } },
      { "content": "Write integration tests for session refresh endpoint",
        "facets": { "project":"acme-api","phase":"auth","status":"todo","priority":"normal" } },
      { "content": "Implement Stripe webhook handler for payment events",
        "facets": { "project":"acme-api","phase":"payments","status":"blocked","priority":"critical" } }
    ]
  },
  {
    "schema_id": "pm:decision",
    "description": "Architecture or process decision with rationale",
    "facets": {
      "required": {
        "project":  { "type": "string" },
        "status":   { "type": "enum", "values": ["proposed","accepted","rejected","superseded"] },
        "category": { "type": "enum", "values": ["architecture","process","technology","scope"] }
      },
      "optional": {
        "phase":       { "type": "string" },
        "decided_by":  { "type": "string" },
        "decided_at":  { "type": "date" },
        "supersedes":  { "type": "string" }
      }
    },
    "examples": [
      { "content": "Use PostgreSQL instead of MongoDB — relational data model, team expertise",
        "facets": { "project":"acme-api","status":"accepted","category":"technology","decided_by":"team","decided_at":"2026-03-01" } },
      { "content": "Defer mobile app to v2 — scope reduction to hit Q2 deadline",
        "facets": { "project":"acme-api","status":"accepted","category":"scope","decided_at":"2026-03-15" } },
      { "content": "Use JWT instead of session cookies",
        "facets": { "project":"acme-api","status":"superseded","category":"architecture","supersedes":"decision:acme-api:session-cookies" } }
    ]
  }
]
```

### Graph Model (Phase 5 output)

```json
{
  "node_types": [
    { "node_type":"project",  "id_convention":"project:{slug}",
      "properties":{ "required":["label","status"] } },
    { "node_type":"phase",    "id_convention":"phase:{project}:{name}",
      "properties":{ "required":["label","project","status"] } },
    { "node_type":"stage",    "id_convention":"stage:{project}:{phase}:{name}",
      "properties":{ "required":["label","project","phase"] } },
    { "node_type":"task",     "id_convention":"task:{project}:{slug}",
      "properties":{ "required":["label","project","phase","status"] } },
    { "node_type":"person",   "id_convention":"person:{id}",
      "properties":{ "required":["label"] } },
    { "node_type":"decision", "id_convention":"decision:{project}:{slug}",
      "properties":{ "required":["label","project","status"] } }
  ],
  "edge_labels": [
    { "label":"CONTAINS",   "source":["project","phase","stage"],
      "target":["phase","stage","task"],
      "meaning":"A CONTAINS B — B is a child item of A" },
    { "label":"BLOCKS",     "source":["task"], "target":["task"],
      "meaning":"A BLOCKS B — B cannot proceed until A is resolved",
      "properties":{ "weight":"float 0-1" } },
    { "label":"DEPENDS_ON", "source":["phase","task"], "target":["phase","task"],
      "meaning":"A DEPENDS_ON B — A requires B to exist or complete first" },
    { "label":"ASSIGNED_TO","source":["task"], "target":["person"],
      "meaning":"A ASSIGNED_TO B — B is responsible for completing A" },
    { "label":"PRODUCED",   "source":["task"], "target":["decision"],
      "meaning":"A PRODUCED B — completing task A produced decision B" }
  ]
}
```

### SQL Migration (Phase 7 output)

```sql
-- mfo/migrations/001_pm_schemas.sql
-- Project Management domain schemas — generated by ghostcrab-project-architect

-- Facet schemas
INSERT INTO mfo_facets (schema_id, content, facets) VALUES
('mfo:schema',
 '{"schema_id":"pm:phase","description":"A project phase with status","facets":{"required":{"project":"string","phase_name":"string","status":"enum"}}}',
 '{"schema_id":"pm:phase","target":"facets","domain":"project-management","version":1}'::jsonb),

('mfo:schema',
 '{"schema_id":"pm:task","description":"Atomic unit of work within a stage","facets":{"required":{"project":"string","phase":"string","status":"enum"}}}',
 '{"schema_id":"pm:task","target":"facets","domain":"project-management","version":1}'::jsonb),

('mfo:schema',
 '{"schema_id":"pm:decision","description":"Architecture or process decision with rationale","facets":{"required":{"project":"string","status":"enum","category":"enum"}}}',
 '{"schema_id":"pm:decision","target":"facets","domain":"project-management","version":1}'::jsonb)

ON CONFLICT DO NOTHING;

-- Graph node types
INSERT INTO mfo_nodes (id, node_type, label, properties) VALUES
('nodetype:pm:project',  'schema', 'Project node',
  '{"id_convention":"project:{slug}","domain":"project-management"}'::jsonb),
('nodetype:pm:phase',    'schema', 'Phase node',
  '{"id_convention":"phase:{project}:{name}","domain":"project-management"}'::jsonb),
('nodetype:pm:stage',    'schema', 'Stage node',
  '{"id_convention":"stage:{project}:{phase}:{name}","domain":"project-management"}'::jsonb),
('nodetype:pm:task',     'schema', 'Task node',
  '{"id_convention":"task:{project}:{slug}","domain":"project-management"}'::jsonb),
('nodetype:pm:person',   'schema', 'Person node',
  '{"id_convention":"person:{id}","domain":"project-management"}'::jsonb),
('nodetype:pm:decision', 'schema', 'Decision node',
  '{"id_convention":"decision:{project}:{slug}","domain":"project-management"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
```

**Acceptance criteria**
- Le fichier contient les 6 questions de domaine avec exemples de réponse
- Le Decision Tree est sous forme de blocs `code` lisibles
- L'exemple PM couvre les 3 artéfacts : domain analysis JSON, schemas[], graph model JSON, migration SQL
- Chaque schema a exactement 3 exemples avec facets complètes

---

## MR 4 — Templates + Examples

### PR 4.1 — `templates/` directory

**WHY**
Les templates sont des fichiers pré-remplis avec des placeholders `[REPLACE_WITH_X]` que l'agent remplit selon son analyse. Ils accélèrent la Phase 5-7 du workflow et garantissent la cohérence des artefacts générés. [file:2]

**WHAT**
4 fichiers template.

**HOW**

```json
// templates/domain.schema.json
{
  "_template_version": "1.0",
  "_instructions": "Replace all [REPLACE_WITH_X] values. Remove _template_version and _instructions before registering.",
  "domain": "[REPLACE_WITH_DOMAIN_NAME]",
  "schema_prefix": "[REPLACE_WITH_2-3_CHAR_PREFIX]",
  "facet_schemas": [
    {
      "schema_id": "[PREFIX]:[ENTITY_NAME_LOWERCASE]",
      "description": "[REPLACE_WITH_ONE_SENTENCE]",
      "facets": {
        "required": {
          "status": {
            "type": "enum",
            "values": ["[STATE_1]","[STATE_2]","[STATE_3]"],
            "_note": "List ALL possible states. These become your dashboard dimensions."
          }
        },
        "optional": {}
      },
      "examples": [
        { "content": "[REAL_EXAMPLE_1]", "facets": { "status": "[STATE_1]" } },
        { "content": "[REAL_EXAMPLE_2]", "facets": { "status": "[STATE_2]" } },
        { "content": "[REAL_EXAMPLE_3]", "facets": { "status": "[STATE_3]" } }
      ]
    }
  ]
}
```

```json
// templates/graph.model.json
{
  "_template_version": "1.0",
  "domain": "[REPLACE_WITH_DOMAIN_NAME]",
  "node_types": [
    {
      "node_type": "[ENTITY_TYPE_LOWERCASE]",
      "id_convention": "[type]:[parent]:[name]",
      "id_example": "[type]:my-project:my-entity",
      "properties": {
        "required": ["label"],
        "optional": ["domain","status","mastery"]
      }
    }
  ],
  "edge_labels": [
    {
      "label": "[UPPER_SNAKE_CASE]",
      "source": ["[source_node_type]"],
      "target": ["[target_node_type]"],
      "meaning": "A [LABEL] B — [REPLACE_WITH_TRUE_SENTENCE]",
      "_test": "Read aloud: does 'A [LABEL] B' make a true sentence?"
    }
  ]
}
```

---

### PR 4.2 — `examples/project-management/`

**WHY**
Un exemple complet et fonctionnel est la meilleure documentation. L'agent peut lire cet exemple pour comprendre le niveau de détail attendu avant de produire ses propres artefacts.

**WHAT**
4 fichiers : `schema.json`, `graph.model.json`, `migration.sql`, `README.md`

**HOW**
Utiliser exactement les artefacts de l'exemple PM de `SCHEMA_DESIGN_PROJECT.md` comme contenu de ces fichiers. Plus un `README.md` qui montre les 4 query patterns opérationnels :

```markdown
# Project Management Domain — MFO Model

## Schemas
- `pm:phase` — project phases with status lifecycle
- `pm:task` — atomic work units (main query target)
- `pm:decision` — architecture and process decisions

## Dashboard Query
```
ghostcrab_count(
  schema_id="pm:task",
  group_by=["status","phase"],
  filters={project:"your-project"}
)
```

## Key Queries

**All blocked tasks:**
ghostcrab_search(query="", filters={status:"blocked",project:"X"}, schema_id="pm:task")

**Impact of a blocked task:**
ghostcrab_traverse(start="task:X:slug", direction="outbound", edge_labels=["BLOCKS"], depth=3)

**Sprint planning context:**
ghostcrab_pack(query="sprint planning blocked tasks", scope="project:X")

**Architecture decisions:**
ghostcrab_search(query="", filters={status:"accepted",category:"architecture"}, schema_id="pm:decision")
```

---

### PR 4.3 — `examples/crm/` + `examples/knowledge-base/`

**WHY**
Deux examples supplémentaires couvrent des domaines non-techniques (CRM) et documentaires (base de connaissance). Ils montrent que la même structure MFO s'applique à des use cases radicalement différents. [file:49]

**WHAT**
Même structure 4 fichiers pour chaque example, avec leurs schémas spécifiques.

**HOW — CRM core schema**

```json
{
  "domain": "crm",
  "schema_prefix": "crm",
  "facet_schemas": [
    {
      "schema_id": "crm:contact",
      "description": "A contact in the sales pipeline",
      "facets": {
        "required": {
          "status": { "type": "enum",
                      "values": ["lead","prospect","customer","churned","dormant"] },
          "source": { "type": "enum",
                      "values": ["inbound","outbound","referral","event","cold"] }
        },
        "optional": {
          "company":   { "type": "string" },
          "domain":    { "type": "string", "_note": "industry vertical" },
          "priority":  { "type": "enum", "values": ["hot","warm","cold"] },
          "arr_range": { "type": "enum", "values": ["<10k","10-50k","50-200k",">200k"] },
          "owner":     { "type": "string" }
        }
      }
    }
  ],
  "graph_model": {
    "edge_labels": [
      { "label":"WORKS_AT",     "meaning":"contact WORKS_AT organization" },
      { "label":"REFERRED_BY",  "meaning":"contact REFERRED_BY contact" },
      { "label":"INTERESTED_IN","meaning":"contact INTERESTED_IN product-feature" },
      { "label":"CLOSED_BY",    "meaning":"deal CLOSED_BY person" }
    ]
  }
}
```

**HOW — Knowledge Base core schema**

```json
{
  "domain": "knowledge-base",
  "schema_prefix": "kb",
  "facet_schemas": [
    {
      "schema_id": "kb:article",
      "description": "A knowledge article with domain, type and lifecycle",
      "facets": {
        "required": {
          "domain":  { "type": "string" },
          "type":    { "type": "enum",
                       "values": ["concept","procedure","regulation","faq","runbook"] },
          "status":  { "type": "enum",
                       "values": ["draft","validated","deprecated","superseded"] },
          "version": { "type": "number" }
        },
        "optional": {
          "audience":    { "type": "enum", "values": ["technical","business","legal","all"] },
          "language":    { "type": "enum", "values": ["en","fr","nl","de"] },
          "valid_until": { "type": "date",
                           "_note": "Alert when approaching: deprecated articles accumulate" },
          "supersedes":  { "type": "string", "_note": "UUID of article this replaces" }
        }
      }
    }
  ],
  "graph_model": {
    "edge_labels": [
      { "label":"SUPERSEDES",  "meaning":"article SUPERSEDES article — version chain" },
      { "label":"REQUIRES",    "meaning":"article REQUIRES article — prerequisite reading" },
      { "label":"CONTRADICTS", "meaning":"article CONTRADICTS article — conflict detected" },
      { "label":"PART_OF",     "meaning":"article PART_OF collection" }
    ]
  }
}
```

---

## MR 5 — Distribution + Validation

### PR 5.1 — `openclaw/ghostcrab-project-architect/README.md`

**WHY**
Point d'entrée pour awesome-openclaw-agents. Doit différencier clairement `ghostcrab-project-architect` de `ghostcrab-memory` — ce n'est pas la même chose.

**WHAT**
README avec : tagline précise, prérequis (ghostcrab-memory installé), 3 lignes d'install, 3 use case triggers, lien vers examples/.

**HOW**

```markdown
# 🏗️ ghostcrab-project-architect — Domain Data Modeling for OpenClaw Agents

> Give your agent the ability to design and manage structured data models
> for any project domain — project management, CRM, knowledge bases,
> compliance, and more — on the MFO PostgreSQL stack.

**Prerequisite:** `ghostcrab-memory` must be installed first.
This skill extends it — it does not replace it.

## What It Enables

Your agent can:
1. **Analyze a project domain** — identify entities, state machines,
   relationships, and query patterns from existing code and docs
2. **Design the data model** — facet schemas, graph node types,
   edge labels — using structured reasoning (SCHEMA_DESIGN_PROJECT.md)
3. **Generate artifacts** — `mfo/schemas/`, migrations, and dashboard queries
4. **Query the model** — using the same 4-level reading sequence as self-memory

## Install

```bash
# Add to your agent's SOUL.md (after ghostcrab-memory SKILL.md)
cat SKILL.md >> ~/.openclaw/workspace/your-agent/SOUL.md
openclaw gateway restart
```

## When Your Agent Activates This Role

Trigger phrases:
> "Model the data for our [project/domain]"
> "Create a database structure for [entities]"
> "Set up knowledge base tracking for [domain]"
> "Organize our [CRM/project/compliance] data"

## Examples

See `examples/` for complete working models:
- `examples/project-management/` — phases, stages, tasks, decisions
- `examples/crm/` — contacts, organizations, pipeline
- `examples/knowledge-base/` — articles, versioning, prerequisites

## Category
`Data` · `Architecture` · `Knowledge` · `Project Management` · `Modeling`
```

---

### PR 5.2 — End-to-End Validation Scenario

**WHY**
Un scénario de test documenté permet à quiconque de valider que les deux skills fonctionnent correctement après installation, sans écrire de tests automatisés.

**WHAT**
Un fichier `VALIDATION.md` à la racine du repo avec 2 scénarios : self-memory et project-architect.

**HOW**

```markdown
# Validation Scenarios

Run these scenarios after install to confirm both skills work.
Each scenario lists the expected tool calls in order.

***

## Scenario A — Self-Memory (ghostcrab-memory)

**Setup:** Clawdbot with ghostcrab-memory SKILL.md appended, MFO server running.

**Step 1:** Ask: "Check your memory status."
Expected: agent calls `ghostcrab_status()`, reports health GREEN, no blocking gaps.

**Step 2:** Ask: "Remember that our Stripe API key rotates every 90 days."
Expected: agent calls `ghostcrab_remember(content="...", facets={type:"constraint", domain:"payments", expires_at:"..."})`
Verify: `ghostcrab_search(filters={type:"constraint"})` returns this item.

**Step 3:** Ask: "What constraints do you know about?"
Expected: agent calls `ghostcrab_count(group_by=["type"])`, then
`ghostcrab_search(query="", filters={type:"constraint"}, limit=10)`

**Step 4:** Ask: "Create a knowledge node for Stripe as an external payment service."
Expected: agent calls `ghostcrab_learn(node={id:"service:payments:stripe", node_type:"service", label:"Stripe", properties:{domain:"payments"}})`

**Step 5:** Ask: "What do you know about payments?"
Expected: agent calls `ghostcrab_pack(query="payments")` first,
then `ghostcrab_coverage(domain="payments")`.

✓ PASS if all 5 steps produce expected tool calls.

***

## Scenario B — Project Data Architect (ghostcrab-project-architect)

**Setup:** Same agent, ghostcrab-project-architect SKILL.md also appended.
Project has a `README.md` describing a simple task tracker.

**Step 1:** Ask: "Model our task tracker data using MFO."
Expected sequence:
1. `ghostcrab_schema_list()` — check existing schemas
2. Agent reads README.md (no tool call)
3. Agent produces domain analysis block internally or in response
4. `ghostcrab_schema_register(target="facets", definition={schema_id:"tracker:task",...})`
5. `ghostcrab_schema_register(target="graph_node", definition={...})`
6. `ghostcrab_schema_register(target="graph_edge", definition={label:"BLOCKS",...})`
7. `ghostcrab_count(schema_id="tracker:task", group_by=["status"])` — validation call

**Step 2:** Verify artifacts.
Expected: `mfo/schemas/tracker.schema.json` exists and is valid JSON.
Expected: `mfo/schemas/index.json` lists `tracker:task` schema.
Expected: `mfo/migrations/001_tracker_schemas.sql` exists.

**Step 3:** Ask: "Show me the task dashboard."
Expected: agent calls `ghostcrab_count(schema_id="tracker:task", group_by=["status"])`.
Returns empty counts `{status: {}}` — correct, no data yet.

**Step 4:** Ask: "Add a task: Implement login — status: todo, priority: high."
Expected: `ghostcrab_remember(content="Implement login", facets={status:"todo", priority:"high"}, schema_id="tracker:task")`

**Step 5:** Ask: "Show me the task dashboard again."
Expected: `ghostcrab_count(schema_id="tracker:task", group_by=["status"])`
Returns: `{status: {todo: 1}}`

✓ PASS if all 5 steps complete without errors and counts