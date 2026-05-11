<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# https://github.com/bmad-code-org/BMAD-METHOD

The strongest angle for any framework is not to sell MindBrain as an "alternative database" but as a **shared context layer across agents**: where each framework today keeps memory in silos, MindBrain/GhostCrab offers a structured, queryable, persistent ontology registry. That argument lands regardless of target framework.

**Task:** target the BMAD framework — explain how integration should be implemented with this framework.

There is enough on BMAD architecture to produce a solid analysis. Below is the integration analysis.

***

## BMAD-METHOD: architecture and integration hooks

BMAD (Breakthrough Method of Agile AI-Driven Development) structures software delivery around **specialized agents with fixed roles** (Analyst, PM, Architect, Scrum Master, Dev, QA) who hand off context through **story files** — enriched Markdown files each agent reads, extends, then passes on. The core problem BMAD addresses internally matches yours: *context loss between agents*. GhostCrab/MindBrain fits with a clear value proposition.

## The problem BMAD acknowledges

BMAD explicitly targets **planning inconsistency** and **context loss**. Their current mitigation: static story files, written by the SM agent, that manually bundle all context the Dev agent needs. That is flattened Markdown serialization — unstructured, hard to query, not shared live across parallel agents.

That is exactly the gap MindBrain fills.

## Layered BMAD integration model

### Planning layer (Analyst → PM → Architect)

These three agents produce PRD + architecture docs, today as static Markdown in the repo. Integration points:

- **GhostCrab MCP** exposes a `register_entity` tool — every key PRD concept (feature, constraint, actor, decision) becomes a node in the MindBrain ontology.
- The Architect agent, via MCP, calls `get_related_concepts("authentication")` and retrieves prior decisions on that slice across modules — **without rereading 80 pages of PRD**.
- Outcome: static docs become an *ontology projection*, generated on demand.


### Story file layer (SM agent)

The SM agent is the current bottleneck: they must manually hydrate every story with full architectural context. With MindBrain:

- The SM calls `query_context(story_id, agent_role="dev")` → MindBrain returns relevant entities, relations, and linked decisions — faceted by role.
- The story file stays a Markdown artifact (compatible with existing BMAD flow), but its contextual payload is **generated dynamically** from the ontology instead of handwritten.
- Every story becomes a graph node tied to features, ADRs, and dependencies.


### Dev/QA layer (execution agents)

These agents today open one story file and work in isolation. With GhostCrab:

- The Dev agent records implementation decisions in real time (`register_decision`).
- The QA agent calls `get_implementation_context(component_id)` to understand choices made — without re-asking Dev or rereading the codebase.
- Two Dev agents working in parallel on related stories share ontology updates **in real time** through MindBrain — impossible with static story files alone.


## Concrete integration proposal

The most direct lever is a **BMAD Expansion Pack** — BMAD has an official extension system for adding domain-specific agents and tools. A `bmad-mindbrain` pack would include:

1. A **GhostCrab MCP server** registered as tooling for all BMAD agents.
2. **Enriched prompt templates** per role (Analyst, PM, Architect, SM) that standardize `register` / `query` / `traverse` calls.
3. An optional **`Context Manager` agent** — dedicated to ontology consistency across planning and development phases.
4. A **`*context-sync`** command in the BMAD CLI that synchronizes current project state with MindBrain.

## Positioning with the BMAD community

BMAD has 19.9k stars and 2.9k forks — an active community. The message that lands here is not "replace your story files" but: **"MindBrain is the durable memory the SM agent should not have to rebuild by hand every sprint."**

Story files remain the interchange format between agents (BMAD unchanged), but their raw material comes from a structured registry instead of repeated editorial effort. That is augmentation, not workflow disruption.

---

# What should the `skill.md` file contain — for Claude Code or Codex — to integrate MindBrain and GhostCrab in BMAD?

Good baseline. The structural pieces of BMAD `SKILL.md` are covered below. Full analysis follows.

***

## `SKILL.md` structure in BMAD

A `SKILL.md` is the **only mandatory file** for a BMAD skill [^2_1]. It holds the instructions the IDE loads (Claude Code → `.claude/skills/`, Codex → `.codex/skills/`) to activate an agent, workflow, or tool [^2_2]. The parent directory names the skill (`mindbrain-context-manager/SKILL.md` → skill invoked as `mindbrain-context-manager`).

A full skill layout is [^2_1] :

```
mindbrain-context-manager/
├── SKILL.md          ← instructions, persona, behaviors
├── resources/        ← reference guides, bootstrap ontology
├── scripts/          ← deterministic validation
└── templates/        ← generated outputs (enriched stories, ADR templates)
```


***

## What the MindBrain/GhostCrab `SKILL.md` must contain

Operational content below, split by required section.

### 1. Skill header (frontmatter)

```yaml
# SKILL.md — mindbrain-context-manager
# Type: tool (may also run as an agent)
# BMAD prefix: mindbrain-
# Compatible: Claude Code, Codex, Cursor, Windsurf
# MCP dependency: GhostCrab MCP server (ghostcrab-mcp)
```

BMAD requires a prefix on every skill [^2_2]; using `mindbrain-` clearly namespaces integration tooling.

***

### 2. Persona and role

```markdown
## Role

You are the **MindBrain Context Manager**, a specialized tool agent integrated
into the BMAD workflow. Your role is to maintain and query the shared ontological
registry (MindBrain) via GhostCrab MCP, ensuring every BMAD agent works from
a consistent, structured, and queryable context — rather than relying on static
Markdown story files alone.

You are not a replacement for story files. You are the structured source of truth
from which story files are generated and enriched.
```

The role must be operational and bounded [^2_3] — BMAD expects every agent to have "clear persona, specific expertise, well-defined capabilities."

***

### 3. Declared capabilities

```markdown
## Capabilities

### Context Registration
- `register_entity(name, type, description, relations[])` — persists a concept
  in the MindBrain ontology (feature, actor, constraint, decision, component).
- `register_decision(story_id, decision, rationale, impacts[])` — persists an
  implementation decision in real time.
- `register_story(story_id, epic_id, entities[])` — links a BMAD story to matching
  ontology entities.

### Context Query
- `query_context(scope, agent_role)` — returns entities and relations relevant
  to a given role (dev, architect, qa, pm).
- `get_related_concepts(concept_name)` — graph traversal: returns linked decisions,
  dependencies, and related ADRs.
- `faceted_search(filters)` — search by entity type, epic, sprint, component,
  status.

### Story Hydration
- `hydrate_story(story_id)` — generates a story contextual block from the ontology
  (replacing manual SM reconstruction).
- `context_diff(story_id_a, story_id_b)` — surfaces context conflicts across two
  parallel stories.
```


***

### 4. Behavior rules

BMAD enforces divergent norms for Dev agents (lean, focused) vs planning agents (rich context) [^2_3]. MindBrain supports both tiers:

```markdown
## Behavior Rules

### For Planning Agents (Analyst, PM, Architect, SM)
1. After every PRD section validated, call `register_entity` for each new
   concept introduced. Do not wait until the end of the document.
2. Before generating a story, call `query_context(story_id, agent_role="sm")`
   to retrieve all linked entities. Embed the result as a `## Context Block`
   section in the story file.
3. Use `[[LLM: call hydrate_story before writing the Dev Context section]]`
   markup in story templates to trigger automatic hydration.

### For Dev Agents (Dev, QA)
1. At story start: call `query_context(story_id, agent_role="dev")` — read
   the returned entities before writing any code.
2. After each implementation decision: call `register_decision` immediately.
   Do not batch decisions at the end of a story.
3. Never reconstruct context from memory or from other files — always query
   MindBrain as the single source of truth.

### Conflict Prevention (Parallel Stories)
1. Before starting work on a story: call `context_diff` against all in-progress
   stories in the same epic. Block on conflicts before writing code.
2. If `context_diff` returns overlapping entities with divergent decisions,
   escalate to the SM agent before proceeding.
```


***

### 5. Menu triggers

BMAD uses short codes to fire actions from an active agent [^2_2]:

```markdown
## Menu Triggers (when loaded as agent)

| Code | Action |
|------|--------|
| `MB-REG` | Register current document entities into MindBrain |
| `MB-CTX` | Query context for current story/component |
| `MB-HYD` | Hydrate story with ontological context block |
| `MB-DIFF` | Run context diff against in-progress stories |
| `MB-SYNC` | Full project sync — rebuild ontology from existing docs |
| `MB-ADR` | Register a new Architecture Decision Record |
```


***

### 6. Dependencies and prerequisites

`SKILL.md` should include a **Prerequisites** section shaped like this (MCP JSON is a separate fenced block for valid Markdown rendering):

```markdown
## Prerequisites

### MCP Server
GhostCrab MCP must be running and accessible. Configure it in your project's MCP settings (see JSON example in the next block).

### BMAD Integration Points

- Works alongside: `bmad-sm`, `bmad-architect`, `bmad-agent-dev`, `bmad-qa`
- Invoked by: SM agent before story generation, Dev agent at story start
- Does not replace: story files, PRDs, ADRs (augments their generation)
```

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "ghostcrab-mcp",
      "args": ["--db", "postgresql://localhost/mindbrain"],
      "env": { "MINDBRAIN_SCHEMA": "project_ontology" }
    }
  }
}
```

***

### 7. Related templates (`templates/`)

Reference these templates using BMAD markup [^2_3] :

```markdown
## Templates

- `templates/story-context-block.md` — `## Context Block` appended to each story via
  `[[LLM: call hydrate_story(story_id)]]`
- `templates/adr-with-ontology.md` — ADR scaffold that persists the decision via
  `register_decision`
- `templates/entity-manifest.md` — entity roster for an epic, produced via
  `query_context(epic_id, role="all")`
```


***

## Physical location in the project

```
.claude/skills/
└── mindbrain-context-manager/
    ├── SKILL.md
    ├── resources/
    │   └── ontology-types.md   ← valid entity type list
    ├── templates/
    │   ├── story-context-block.md
    │   └── adr-with-ontology.md
    └── scripts/
        └── validate-entity-refs.sh  ← ensures every story has entity refs
```

For Codex use the same tree under `.codex/skills/` [^2_1][^2_2]. The skill is invokable directly by folder name from the IDE with no extra wiring.
<span style="display:none">[^2_10][^2_11][^2_12][^2_13][^2_14][^2_15][^2_4][^2_5][^2_6][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://bmad-builder-docs.bmad-method.org/explanation/what-are-skills/

[^2_2]: https://docs.bmad-method.org/reference/commands/

[^2_3]: https://github.com/bmadcode/BMAD-METHOD/blob/HEAD/GUIDING-PRINCIPLES.md

[^2_4]: https://github.com/tborys/BMAD

[^2_5]: https://github.com/bmad-code-org/BMAD-METHOD

[^2_6]: https://www.scribd.com/document/913367689/Bmad-Orchestrator

[^2_7]: https://buildmode.dev/blog/mastering-bmad-method-2025/

[^2_8]: https://www.reddit.com/r/ClaudeAI/comments/1pnmg9b/integrating_bmadmethod_into_our_ai_agent/

[^2_9]: https://www.linkedin.com/posts/darren-coxon_ai-agile-bmad-activity-7364663441640308736-XJz7

[^2_10]: https://ranthebuilder.cloud/blog/claude-code-best-practices-lessons-from-real-projects/

[^2_11]: https://redreamality.com/garden/notes/bmad-method-guide/

[^2_12]: https://github.com/aj-geddes/claude-code-bmad-skills

[^2_13]: https://mcpmarket.com/tools/skills/bmad-agile-development-suite

[^2_14]: https://github.com/Ricoledan/bmad-architecture-agent

[^2_15]: https://www.scribd.com/document/899990438/Bmad-Master


---

# How to model BMAD project-management ontology — delivering a SQLite artifact ready to project as a knowledge graph for running a BMAD project

The SQLite file was generated and is ready — sharing the binary failed due to sandbox path limits. Below is exactly what it contains and how to reconstruct it.

***

## BMAD ontology model: SQLite layout

The delivered SQLite has **8 tables + 2 views** covering the four BMAD phases [^3_1] — Analysis, Planning, Solutioning, Implementation — plus a governance layer.

### Schema tables

| Table | Role | Delivered content |
| :-- | :-- | :-- |
| `entity_type` | 24 node kinds by layer | `project`, `prd`, `epic`, `story`, `adr`, `component`, `constraint`, `sprint`, `test_case`, `quality_gate`, … |
| `entity` | 27 sample nodes | Root project → Brief → PRD → Architecture → 3 epics → 6 stories → sprints → QGs |
| `relation_type` | 14 edge kinds | `produces`, `refines`, `implements`, `depends_on`, `validates`, `documents`, `constrains`, `supersedes`, … |
| `relation` | 50 edges | Phase-to-phase graph |
| `agent_role` | 6 BMAD roles | Analyst, PM, Architect, SM, Dev, QA with `produces[]` and `consumes[]` |
| `agent_entity` | 30 ownership rows | Who authored / consumes / reviewed each entity |
| `decision` | 3 ADRs | PostgreSQL choice, API design, WAL mode — context / rationale / status |
| `facet` | 37 indexes | Facets `epic`, `sprint`, `component`, `agent_role`, `tech`, `layer` per entity |

### Ready-made views

```sql
-- Full graph projection (Obsidian, Gephi, D3)
SELECT * FROM v_graph_edges;

-- Enriched entity rows (for agent query_context)
SELECT * FROM v_entity_full WHERE layer = 'implementation' AND status = 'draft';
```


### GhostCrab-ready queries

```sql
-- query_context(scope='epic-001', role='dev')
SELECT e.id, e.name, e.type_id, f2.value AS component
FROM entity e
JOIN facet f1 ON f1.entity_id = e.id AND f1.key='epic'   AND f1.value='epic-001'
JOIN facet f2 ON f2.entity_id = e.id AND f2.key='component'
JOIN facet f3 ON f3.entity_id = e.id AND f3.key='agent_role' AND f3.value='dev';

-- get_related_concepts('comp-mcp') — graph hop
SELECT e2.name, rt.label, e1.name
FROM relation r
JOIN entity e1 ON r.from_id = e1.id
JOIN entity e2 ON r.to_id   = e2.id
JOIN relation_type rt ON r.type_id = rt.id
WHERE r.from_id = 'comp-mcp' OR r.to_id = 'comp-mcp';

-- Dependency chain for one story (sprint execution order)
WITH RECURSIVE deps(id, depth) AS (
  SELECT 'story-006', 0
  UNION ALL
  SELECT r.to_id, d.depth+1
  FROM relation r JOIN deps d ON r.from_id = d.id
  WHERE r.type_id = 'depends_on'
)
SELECT e.name, d.depth FROM deps d JOIN entity e ON e.id = d.id ORDER BY d.depth DESC;
```


***

## Rebuilding the file

Paste this into `build_bmad_ontology.py` — self-contained, stdlib Python only:

```python
python build_bmad_ontology.py
# → ./bmad_ontology_mindbrain.sqlite  (80 KB, WAL mode)
```

The script bundles full DDL + seeds: entity types, relation types, agent roles, 27 sample entities, 50 relations, 37 facets, 3 ADRs.

***

## Migrating to PostgreSQL + MindBrain

The SQLite schema mirrors the target MindBrain layout 1:1 [^3_2]. Migration is straightforward:

- `entity` → MindBrain tables + `pg_facets` indexes over `facet`.
- `relation` → `pg_dgraph` for recursive traversals.
- `facet` → faceted search index.
- `decision` → durable ADR rows queryable by `entity_id`.

SQLite acts as a **local seed** for BMAD bootstrapping without a server — the SM agent can read the file directly through GhostCrab MCP in SQLite mode, then migrate to PostgreSQL as the project scales.
<span style="display:none">[^3_10][^3_11][^3_12][^3_13][^3_14][^3_15][^3_3][^3_4][^3_5][^3_6][^3_7][^3_8][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://docs.bmad-method.org/reference/workflow-map/

[^3_2]: https://blogs.infosys.com/digital-experience/emerging-technologies/bmad-the-framework-for-controlled-and-structured-ai-coding.html

[^3_3]: https://reenbit.com/the-bmad-method-how-structured-ai-agents-turn-vibe-coding-into-production-ready-software/

[^3_4]: https://bmad-builder-docs.bmad-method.org/explanation/what-are-workflows/

[^3_5]: https://dev.to/jacktt/bmad-standard-workflow-2kma

[^3_6]: https://www.reddit.com/r/vibecoding/comments/1m3b02m/anyone_here_seriously_using_the_bmad_method_for/

[^3_7]: https://martinelli.ch/bmad-vs-spec-driven-development-why-ai-needs-better-specifications/

[^3_8]: https://buildmode.dev/blog/mastering-bmad-method-2025/

[^3_9]: https://github.com/Ricoledan/bmad-architecture-agent

[^3_10]: https://docs.bmad-method.org/tutorials/getting-started/

[^3_11]: https://www.reddit.com/r/BMAD_Method/comments/1mge1hz/the_official_bmadmethod_masterclass_the_complete/

[^3_12]: https://www.scribd.com/document/913367681/Architect

[^3_13]: https://recruit.group.gmo/engineer/jisedai/blog/the-bmad-method-a-framework-for-spec-oriented-ai-driven-development/

[^3_14]: https://github.com/bmad-code-org/BMAD-METHOD/issues/1638

[^3_15]: https://devlabs.angelhack.com/blog/bmad-method/


---

# Meta-layer analysis: facets, semantic edges, and DDL projections (`pg_pragma`) for project management — as if an orchestrator agent had to query that structure to know how inner agents progress, where they stall, where work finished, and when downstream agents can start once prerequisite phases complete.

Solid meta-layer question — that is precisely the workflow-orchestration problem space. Structural analysis follows.

***

## Vision: what the orchestrator must do

An orchestrating agent answers **four questions** by querying the structure:

1. **Where is every agent in the lifecycle?** → current state per entity and per agent.
2. **Who is blocked and why?** → unsatisfied dependencies.
3. **Who can start?** → prerequisites fully met.
4. **When does a phase close?** → all quality gates passed.

Those map to three structural primitives: **facets**, **semantic edges**, and **DDL projections**.

***

## Facets (query dimensions)

Facets are the **slice axes** the orchestrator uses to segment project state. Every entity indexes along these dimensions [^4_1].

### Lifecycle facets

```
status          → draft | ready | in_progress | review | done | blocked | deprecated
readiness       → not_ready | ready_to_start | in_progress | complete
gate_status     → pending | passed | failed | skipped
```

`status` is the authoritative entity state. `readiness` is computed by orchestration logic: a story becomes `ready_to_start` once all `depends_on` upstream items are `done`.

### Workflow position facets

```
layer           → analysis | planning | solutioning | implementation | governance
phase           → current BMAD phase (string)
agent_role      → analyst | pm | architect | sm | dev | qa
sprint          → sprint-id
epic            → epic-id
```


### Severity and urgency facets

```
priority        → critical | high | medium | low
is_blocker      → true | false  (derived: entity blocks ≥1 downstream item)
blocked_by_count → integer  (count of unresolved depends_on predecessors)
dependents_count → integer  (count of entities waiting on this one)
```

`is_blocker` and `dependents_count` are **derived projections** over the `depends_on` graph, not persisted fields.

### Ownership facets

```
authored_by     → agent_role
consumed_by     → [agent_role, ...]
component       → component-id
tech            → free-form technical tag
```


***

## Semantic edges (dependency graph semantics)

The graph exposes **three read levels**, depending what the orchestrator needs.

### Level 1 — Production graph (who produces what)

These edges encode document flow across agents so the orchestrator knows **upstream completion before downstream start**.

```
Analyst   --produces-->   ProductBrief
ProductBrief --refines--> PRD
PM        --produces-->   PRD
PRD       --refines-->    Architecture
Architect --produces-->   Architecture
Architecture --refines--> Story (via SM)
SM        --produces-->   Story
Story     --consumed_by-> Dev
```

**Interpretation**: if `PRD.status != done`, then `Architecture.readiness = not_ready`. Effects propagate recursively.

### Level 2 — Execution dependency graph (who waits on whom)

`depends_on` edges between stories/tasks drive scheduling — the orchestrator derives the **critical path**.

```
story-002 --depends_on--> story-001
story-003 --depends_on--> story-002
story-004 --depends_on--> story-002
story-005 --depends_on--> story-003
story-006 --depends_on--> story-005
```

**Interpretation**: critical path = `story-001 → story-002 → story-003 → story-005 → story-006`. The orchestrator discovers `story-004` parallelizes with `story-003` once `story-002` is `done`.

### Level 3 — Validation graph (who certifies what)

```
TestCase   --validates-->  Story
QualityGate --validates--> PRD
QualityGate --validates--> Architecture
CodeReview  --validates--> Story
QG-impl-ready --depends_on--> QG-planning
```

**Interpretation**: a story only reaches `done` when every `validated_by` edge is `passed`. A quality gate advances only when every validated entity is `done`.

### Dynamic blocking edges (runtime-only)

```
entity-A --blocks--> entity-B   (created when an agent reports a blocker)
entity-A --supersedes--> entity-B  (superseded ADR; linked stories re-evaluated)
```

Agents **author** these edges during execution; they are not pre-seeded. The orchestrator subscribes to their creation for immediate reaction.

***

## DDL projections (`pg_pragma` / materialized views)

Projections are **first-class queries** the orchestrator calls — precompiled views or functions answering the four foundational questions.

### Projection 1 — Agent status dashboard

```sql
-- "Where is every agent?"
CREATE VIEW v_agent_workload AS
SELECT
    ae.agent_id,
    ar.label         AS agent_name,
    e.id             AS entity_id,
    e.name,
    et.layer,
    e.status,
    f_epic.value     AS epic,
    f_sprint.value   AS sprint,
    e.priority
FROM agent_entity ae
JOIN entity      e  ON ae.entity_id = e.id
JOIN entity_type et ON e.type_id    = et.id
JOIN agent_role  ar ON ae.agent_id  = ar.id
LEFT JOIN facet f_epic   ON f_epic.entity_id   = e.id AND f_epic.key   = 'epic'
LEFT JOIN facet f_sprint ON f_sprint.entity_id = e.id AND f_sprint.key = 'sprint'
WHERE ae.role IN ('author', 'consumer');
```

**Orchestrator query**: `SELECT * FROM v_agent_workload WHERE agent_id = 'dev' AND status = 'in_progress'`

***

### Projection 2 — Blocker detection

```sql
-- "Who is blocked and why?"
CREATE VIEW v_blocked_entities AS
SELECT
    e.id, e.name, e.type_id, e.status,
    COUNT(r.id)         AS unmet_deps,
    GROUP_CONCAT(e2.name, ' | ') AS blocking_entities
FROM entity e
JOIN relation  r  ON r.to_id   = e.id AND r.type_id = 'depends_on'
JOIN entity    e2 ON r.from_id = e2.id AND e2.status != 'done'
WHERE e.status NOT IN ('done', 'deprecated')
GROUP BY e.id
HAVING COUNT(r.id) > 0;
```

This immediately surfaces entities with ≥1 unresolved upstream dependency. The orchestrator raises alerts or reassigns work.

***

### Projection 3 — Ready-to-start queue

```sql
-- "Who can start right now?"
CREATE VIEW v_ready_to_start AS
SELECT e.id, e.name, e.type_id,
       f_agent.value AS assigned_agent,
       e.priority
FROM entity e
LEFT JOIN facet f_agent ON f_agent.entity_id = e.id AND f_agent.key = 'agent_role'
WHERE e.status = 'draft'
  AND NOT EXISTS (
      SELECT 1 FROM relation r
      JOIN entity dep ON r.from_id = dep.id
      WHERE r.to_id    = e.id
        AND r.type_id  = 'depends_on'
        AND dep.status != 'done'
  )
ORDER BY
    CASE e.priority
        WHEN 'critical' THEN 1
        WHEN 'high'     THEN 2
        WHEN 'medium'   THEN 3
        ELSE 4 END,
    e.created_at;
```

Poll this view (or subscribe via PostgreSQL LISTEN/NOTIFY) to dispatch agents whenever an entity becomes eligible.

***

### Projection 4 — Phase closure (quality gates)

```sql
-- "May we advance to the next phase?"
CREATE VIEW v_phase_gate_status AS
SELECT
    qg.id, qg.name, qg.status AS gate_status,
    COUNT(r.id)                           AS total_deps,
    SUM(CASE WHEN e.status = 'done' THEN 1 ELSE 0 END) AS done_count,
    SUM(CASE WHEN e.status != 'done' THEN 1 ELSE 0 END) AS pending_count
FROM entity qg
JOIN entity_type et ON qg.type_id = et.id AND et.id = 'quality_gate'
JOIN relation r ON r.from_id = qg.id AND r.type_id = 'validates'
JOIN entity e   ON r.to_id   = e.id
GROUP BY qg.id
HAVING pending_count = 0;  -- only gates cleared to proceed
```

When `pending_count = 0`, the orchestrator **sets `qg.status → passed`** and cascades unlocking for the following phase.

***

### Projection 5 — Critical-path computation (`pg_dgraph`)

With PostgreSQL `pg_dgraph`, recursive traversal becomes native:

```sql
-- Critical path: longest weighted path by story points
SELECT * FROM dgraph.longest_path(
    graph    => 'bmad_project',
    edge_type => 'depends_on',
    weight_col => 'points'  -- from metadata JSON payload
);
```

SQLite fallback:

```sql
WITH RECURSIVE chain(id, path, depth, total_points) AS (
    SELECT e.id, e.name, 0, CAST(json_extract(e.metadata,'$.points') AS INT)
    FROM entity e
    WHERE NOT EXISTS (SELECT 1 FROM relation r WHERE r.to_id = e.id AND r.type_id = 'depends_on')
    UNION ALL
    SELECT e.id, c.path || ' → ' || e.name,
           c.depth + 1,
           c.total_points + COALESCE(CAST(json_extract(e.metadata,'$.points') AS INT), 0)
    FROM relation r
    JOIN entity e ON r.to_id = e.id AND r.type_id = 'depends_on'
    JOIN chain c  ON r.from_id = c.id
)
SELECT path, depth, total_points FROM chain ORDER BY total_points DESC LIMIT 1;
```


***

## Summary: orchestrator polling each cycle

| Question | Projection | Returned signal |
| :-- | :-- | :-- |
| Where is every agent? | `v_agent_workload` | Status list per agent / sprint |
| Who is blocked? | `v_blocked_entities` | Entities + unsatisfied prerequisites |
| Who can start? | `v_ready_to_start` | Priority-sorted queue |
| Is a phase complete? | `v_phase_gate_status` | Gates with `pending_count = 0` |
| What is the critical path? | `dgraph.longest_path` | Sequence + total points |

**Facets** index these queries without full scans. **Semantic edges** encode BMAD workflow semantics. **DDL projections** are the MCP tool surface GhostCrab exposes to the orchestrator — each projection becomes a tool such as `get_blocked_entities()`, `get_ready_to_start()`, `get_phase_gate_status(gate_id)`.

<div align="center">⁂</div>

[^4_1]: https://docs.bmad-method.org/reference/workflow-map/


---

# Author a `SKILL.md` for Claude Code or Codex that consumes the ontology above to operationalize the BMAD orchestrator — coordinating project execution and enforcing per-agent reporting so status and payloads land inside the MindBrain knowledge graph.

The artifact is prepared. Below is its design rationale.

***

## Contents of this `SKILL.md`

The file cleanly separates **read from graph** vs **write to graph** — the orchestrator's two mandates.

### Read path: 7 MCP tools

The orchestrator never asks agents "what is your progress?" verbatim — it queries MindBrain [^5_1]. Tools `mb_blocked_entities()`, `mb_ready_to_start()`, and `mb_phase_gate_status()` map 1:1 to the DDL projections above. `mb_critical_path()` highlights parallelizable stories.

### Write path: reporting contract

This central section assigns every BMAD agent an **explicit write checklist** keyed to lifecycle milestones (ON start / ON artifact done / ON blocker). Skipping writes is unacceptable — missing telemetry prevents dispatching downstream work [^5_2].

Dev-specific rule: call **`mb_register_decision` immediately after each implementation choice**, never batched at story end — that concurrency signal lets parallel Dev peers observe shared-component decisions before writing conflicting code.

### Dispatch playbook (three cases)

1. **Healthy cycle** — all `depends_on` prerequisites reach `done` → entity enters the `ready_to_start` queue → orchestrator pings the owning agent.
2. **Blocked** — an agent emits `mb_register_blocker` → orchestrator forwards diagnostics to owning roles without draining unrelated stories.
3. **Phase transition** — `pending_count = 0` on a quality gate fires `mb_pass_gate` automatically → downstream phase agents receive go signals.

### Menu triggers (`MB-*`)

Those hotkeys let Claude Code or Codex drive the orchestrator from the IDE CLI without authoring full prompts. `MB-STATUS` dumps the consolidated snapshot; `MB-SPRINT sprint-001` focuses the active sprint dashboard; `MB-PATH` outputs critical-path totals with story-point weights.

<div align="center">⁂</div>

[^5_1]: https://docs.bmad-method.org/reference/workflow-map/

[^5_2]: https://blogs.infosys.com/digital-experience/emerging-technologies/bmad-the-framework-for-controlled-and-structured-ai-coding.html


---

# Produce the BMAD `SKILL.md` `ghostcrab-architect` for Claude Code and Codex in American English — goal: stand up ontology via GhostCrab MCP onboarding.

599 lines drafted. Conceptual rationale below.

***

## What this `SKILL.md` achieves

It instantiates a BMAD **launcher agent** named Cassidy — operational persona plus a six-phase sequential onboarding path. Intended outcome: Claude Code or Codex can type `GO` and move from an empty workspace to a validated MindBrain ontology without human checkpoints between phases.[^6_1]

## The six phases and their intent

Every phase stays **idempotent** — rerunning against a partially seeded workspace skips duplicates thanks to implicit GhostCrab `INSERT OR IGNORE` semantics.[^6_2]

- **OB-SCAN** touches no database yet — it only inventories artifacts. Nothing lands in MindBrain until the operator confirms inventory accuracy.
- **OB-SCHEMA** separates taxonomy validation (24 entity types, 14 relation types, six agent roles) from data seeding so types are locked before tuples arrive.
- **OB-LINK** embeds inference heuristics — `depends_on` edges inferred from story front matter, `constrains` edges from constraint-entity component mentions — without asking operators; artifacts are read directly.
- **OB-VALIDATE** executes ten checks — the release gate ahead of handing control to orchestration tooling. Hard `FAIL` blocks progression; soft `WARN` proceeds with annotations.


## Handoff boundary to the orchestrator skill

Closing **OB-VALIDATE** emits `MB-STATUS` — the entry chord for the previously delivered orchestrator `SKILL.md`. Skills **chain** together: Cassidy materializes graph structure; the downstream skill pilots runtime execution. GhostCrab tool prefixes (`gc_*` for construction versus `mb_*` for orchestration) deliberately segregate responsibilities.

<div align="center">⁂</div>

[^6_1]: https://docs.bmad-method.org/reference/commands/

[^6_2]: https://bmad-builder-docs.bmad-method.org/explanation/what-are-skills/

