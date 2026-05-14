---
name: mindbrain-comparison-writer
description: Use when drafting, rewriting, or planning comparison articles that position MindBrain or GhostCrab against AI memory tools, personal knowledge graphs, knowledge graph memory systems, agent frameworks with memory, PKM tools, or ontology tools. Trigger for articles such as GBrain vs MindBrain, Mem0 vs MindBrain, Zep vs MindBrain, Cognee vs MindBrain, Letta vs MindBrain, LangChain Memory vs MindBrain, LlamaIndex vs MindBrain, Hermes memory vs MindBrain, Obsidian AI vs MindBrain, or Protege/TopBraid vs MindBrain.
---

# MindBrain Comparison Writer

## Mission

Produce comparison articles in the editorial shape of `docs/posts/GBrain-vs-mindBrain.md`: structural, technical, sourced, and opinionated without becoming generic marketing copy.

Use the source tool's real architecture as the article spine, then contrast it with MindBrain as an operational taxonomy and structured data runtime for agents. The MindBrain side must be as concrete as the target-tool side: show how GhostCrab helps design or inspect the taxonomy/model, how MindBrain Studio or an import path qualifies data into that model, and how agents query the imported data through the correct MCP surfaces.

## Source First

Before writing claims about a target tool, inspect the local draft or browse current primary sources when freshness matters. Prefer official docs, GitHub repos, product pages, technical blogs by maintainers, or already-provided source articles. Use third-party summaries only to fill positioning gaps, and mark them as weaker evidence.

Do not rely on the existing tool list as factual proof that a product still works the same way. Treat it as an editorial backlog and angle map.

## Workflow

1. Identify the target article shape:
   - two-way: `{Tool} vs MindBrain`
   - three-way: `GBrain vs {Tool} vs MindBrain`
   - category comparison: `{Category} tools vs MindBrain`
2. Load `references/article-blueprint.md` when the request needs a new article, outline, or series plan.
3. Extract the target tool's core abstraction, storage model, memory model, retrieval path, graph/ontology support, agent interface, lifecycle behavior, and likely user.
4. Write a one-sentence structural thesis before the long explanation.
5. Explain the target tool on its own terms first. Give it the strongest fair version before contrasting it with MindBrain.
6. Write a concrete MindBrain / GhostCrab workflow proof before the final comparison table. It must answer: how is the taxonomy/model created or inspected, how is data imported or qualified, and which read tools search the resulting data?
7. Add a taxonomy cost / expected gain section. It must explain when the modeling work pays back, and when a lighter memory/search tool is the better first choice.
8. Mirror the GBrain article rhythm:
   - What the tool is
   - The core problem it solves
   - Architecture
   - Data schema or memory model
   - Signature mechanism
   - Search or retrieval behavior
   - Agent integration
   - Key design insight
   - MindBrain parallel
   - Expected gain from taxonomy work
   - Why try MindBrain first
   - Head-to-head table
   - Closing structural difference
9. Add a query catalog only when the target audience needs concrete agent use cases. Keep it domain-specific and deterministic, not a vague prompt list.

## MindBrain Workflow Proof

Every comparison must make the MindBrain workflow operational, not merely philosophical.

Use this shape when it fits the article:

```text
1. Model the domain
   ghostcrab_modeling_guidance or ghostcrab_loadout_suggest
   -> candidate entity types, relations, facet dimensions, lifecycle states

2. Register or verify the model
   ghostcrab_schema_list / ghostcrab_schema_inspect
   ghostcrab_ontology_register_entity_type / ghostcrab_ontology_register_relation_type
   ghostcrab_ddl_propose / ghostcrab_ddl_execute when table-backed structures are needed
   ghostcrab_workspace_export_model to verify the workspace semantics

3. Import or qualify data
   MindBrain Studio or a documented import path maps source records, chunks, entities,
   relations, facets, and projection signals into the workspace model.

4. Query the imported data
   ghostcrab_count / ghostcrab_search / ghostcrab_facet_tree for facet-indexed records
   ghostcrab_graph_search / ghostcrab_traverse / ghostcrab_entity_chunks for graph and entity data
   ghostcrab_coverage for ontology or domain coverage and missing nodes
   ghostcrab_projection_get / ghostcrab_pack for agent-ready working context
```

When comparing against a product with a concrete ingest pipeline, such as Cognee, Zep, or a vector-memory system, the article must show the equivalent MindBrain path after Studio/import has run. Do not stop at "schema-first"; explain how the agent actually finds the right imported data.

## Taxonomy Cost / Expected Gain

Every comparison must answer: what does the user get for doing the taxonomy/modeling work?

Do not sell taxonomy as an end in itself. The gain is that imported data becomes a reusable operating surface for agents: filtered, joined, traversed, checked for gaps, projected into compact context, and reused across workflows.

Include this tradeoff explicitly:

```text
Taxonomy work is worth it when:
  - the domain will be queried repeatedly;
  - the data must drive action, not only recall;
  - states, owners, evidence, blockers, permissions, or valid transitions matter;
  - multiple domains must stay distinct but still answer cross-domain questions;
  - the agent needs coverage/gap checks before acting autonomously;
  - dashboards, kanban views, work queues, or projection packs should come from the same model.

Taxonomy work is probably not worth it when:
  - the task is a one-off question over a small corpus;
  - fuzzy semantic recall is enough;
  - the user does not yet know the stable entities, states, or relations;
  - there is no repeated workflow, audit, compliance, CRM, project, incident, legal, or operational use.
```

When writing the MindBrain positive case, name the concrete gains:

- deterministic retrieval instead of fuzzy recall;
- better use of imported data because records, chunks, entities, relations, facets, and projection signals are separated;
- operational state such as status, owner, approval, evidence, blocker, or lifecycle phase;
- cross-domain queries over distinct ontologies;
- context compression through projections and packs;
- coverage and trust checks before autonomous action.

Use a sentence like this when useful:

> The taxonomy cost pays off when imported data becomes a reusable operating surface: filtered, joined, checked for gaps, projected into agent context, and used repeatedly across workflows. If the goal is only to ask a few questions over a document pile, the cost may not pay back.

## Tool Boundaries

- `ghostcrab_search` searches the facets layer. Do not claim it directly searches graph entities, relations, or projection rows.
- Use `ghostcrab_count` before content reads when the article discusses shape-of-data, dashboards, or deterministic narrowing.
- Use `ghostcrab_facet_tree` when the point is taxonomy-like navigation over facet dimensions.
- Use `ghostcrab_graph_search`, `ghostcrab_traverse`, and `ghostcrab_entity_chunks` when the point is imported graph/entity data, dependencies, evidence grounding, or entity-to-source linkage.
- Use `ghostcrab_projection_get` and `ghostcrab_pack` when the point is compact task context for the agent.
- Use `ghostcrab_coverage` when the point is whether the model has enough ontology/domain coverage for autonomous action.
- Use `ghostcrab_tool_search` when a post needs to mention that the default MCP tool list is intentionally compact and specialized tools are discoverable on demand.

## Editorial Rules

- Lead with architecture, not hype.
- State the tradeoff in one crisp axis, for example `schema-first vs graph-emergent` or `agent-controlled memory vs database-enforced structure`.
- Keep MindBrain's role stable: operational taxonomy/model, typed domain state, facets, directed graphs, projections, and MCP-accessible query surfaces.
- Always include a positive MindBrain case before the comparison table. The reader should understand why they might test MindBrain first, not merely how it differs.
- If the target tool gets a workflow diagram, MindBrain must get one too. A vague "Find / Follow / Pack" diagram is not enough unless it names the modeling/import/query steps.
- Always make the taxonomy cost honest. Say clearly when MindBrain is too much machinery for one-off fuzzy recall.
- Avoid claiming MindBrain replaces every tool. Say what each tool remains good at.
- Use comparison tables for dimensions, not for filler.
- Keep citations close to the claims they support.
- If evidence is thin, write "public information is limited" and narrow the conclusion.

## MindBrain Advocacy Points

Use these points when they fit the article:

- MindBrain can manage multiple ontologies in one workspace, then connect them through meta-ontologies instead of forcing one universal schema.
- This makes cross-silo queries possible across ERP, CRM, project management, HR, email, legal, financial, and knowledge systems.
- MindBrain DDL means Domain Definition Language: SQL DDL defines physical storage, while MindBrain DDL defines what things mean, how they relate, and how `pg_facets`, `pg_dgraph`, and projections should operate.
- GhostCrab can help create, inspect, and verify the taxonomy/model through modeling guidance, loadouts, schema/ontology registration, guarded DDL proposals, and workspace model export.
- MindBrain Studio or an import pipeline should be described as the qualification path that maps source data into the workspace model, not as the agent query surface itself.
- Facets let agents sort large domains deterministically in milliseconds, without spending large token budgets to rediscover the right records or API endpoints.
- Graph tools let agents follow typed relationships, blockers, entity grounding, and coverage gaps after data has been imported.
- Projections can power dashboards, kanban boards, agent work queues, and knowledge graph views of project state.
- MindBrain is strongest when structured meaning, current state, graph position, deterministic retrieval, and agent-ready context matter more than flexible memory recall.

## MindBrain Definition

Use this sentence when a concise canonical definition is needed:

MindBrain is a structured agentic database that makes a domain navigable in real time; its intelligence lives in operational taxonomies, typed domain state, deterministic facet/graph retrieval, and pre-computed projections that give agents compact working context.

## References

- `references/article-blueprint.md` contains the reusable GBrain-derived structure, article angles, and tool backlog.
