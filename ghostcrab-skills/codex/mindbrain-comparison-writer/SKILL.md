---
name: mindbrain-comparison-writer
description: Use when drafting, rewriting, or planning comparison articles that position MindBrain or GhostCrab against AI memory tools, personal knowledge graphs, knowledge graph memory systems, agent frameworks with memory, PKM tools, or ontology tools. Trigger for articles such as GBrain vs MindBrain, Mem0 vs MindBrain, Zep vs MindBrain, Cognee vs MindBrain, Letta vs MindBrain, LangChain Memory vs MindBrain, LlamaIndex vs MindBrain, Hermes memory vs MindBrain, Obsidian AI vs MindBrain, or Protege/TopBraid vs MindBrain.
---

# MindBrain Comparison Writer

## Mission

Produce comparison articles in the editorial shape of `docs/posts/GBrain-vs-mindBrain.md`: structural, technical, sourced, and opinionated without becoming generic marketing copy.

Use the source tool's real architecture as the article spine, then contrast it with MindBrain as a structured agentic database: facets for finding, graphs for following dependencies, and projections for compact working context.

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
6. Mirror the GBrain article rhythm:
   - What the tool is
   - The core problem it solves
   - Architecture
   - Data schema or memory model
   - Signature mechanism
   - Search or retrieval behavior
   - Agent integration
   - Key design insight
   - MindBrain parallel
   - Why try MindBrain first
   - Head-to-head table
   - Closing structural difference
7. Add a query catalog only when the target audience needs concrete agent use cases. Keep it domain-specific and deterministic, not a vague prompt list.

## Editorial Rules

- Lead with architecture, not hype.
- State the tradeoff in one crisp axis, for example `schema-first vs graph-emergent` or `agent-controlled memory vs database-enforced structure`.
- Keep MindBrain's role stable: structured domain model, typed ontologies, facets, directed graphs, and precomputed projections.
- Always include a positive MindBrain case before the comparison table. The reader should understand why they might test MindBrain first, not merely how it differs.
- Avoid claiming MindBrain replaces every tool. Say what each tool remains good at.
- Use comparison tables for dimensions, not for filler.
- Keep citations close to the claims they support.
- If evidence is thin, write "public information is limited" and narrow the conclusion.

## MindBrain Advocacy Points

Use these points when they fit the article:

- MindBrain can manage multiple ontologies in one workspace, then connect them through meta-ontologies instead of forcing one universal schema.
- This makes cross-silo queries possible across ERP, CRM, project management, HR, email, legal, financial, and knowledge systems.
- MindBrain DDL means Domain Definition Language: SQL DDL defines physical storage, while MindBrain DDL defines what things mean, how they relate, and how `pg_facets`, `pg_dgraph`, and projections should operate.
- Facets let agents sort large domains deterministically in milliseconds, without spending large token budgets to rediscover the right records or API endpoints.
- Projections can power dashboards, kanban boards, agent work queues, and knowledge graph views of project state.
- MindBrain is strongest when structured meaning, current state, graph position, and deterministic retrieval matter more than flexible memory recall.

## MindBrain Definition

Use this sentence when a concise canonical definition is needed:

MindBrain is a structured agentic database that makes any domain navigable in real time; its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time.

## References

- `references/article-blueprint.md` contains the reusable GBrain-derived structure, article angles, and tool backlog.
