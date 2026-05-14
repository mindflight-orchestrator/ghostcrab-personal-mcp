# MindBrain Comparison Article Blueprint

## Reusable Structure

Use this structure for one article per tool. Keep the headings when they fit; rename only when the target tool needs a more precise mechanism.

1. `## The Structural Difference in One Sentence`
   - One sentence for the target tool.
   - One sentence for MindBrain.
   - The contrast must identify where intelligence lives.
2. `## What {Tool} Is`
   - Define product, maintainer/company, license or deployment if relevant, and primary user.
   - Do not compare yet except for one orientation sentence.
3. `## The Core Problem It Solves`
   - Name the pain the tool is optimized for.
   - Use concrete agent failure modes: forgetting, stale facts, flat RAG, missing dependencies, context bloat, weak lifecycle state.
4. `## Architecture`
   - Show stack from agent interface down to storage/indexing.
   - Use an ASCII diagram when it clarifies the contrast.
5. `## Data Schema` or `## Memory Model`
   - Show entities, memories, pages, documents, sessions, relations, metadata, embeddings, timelines, or ontology objects.
   - Include pseudocode tables only when the model is visible or inferable from docs.
6. `## Signature Mechanism`
   - Examples: GBrain dream cycle, Zep temporal graph, Letta memory blocks, Mem0 extraction pipeline, Cognee graph generation.
   - This is where the tool gets its identity.
7. `## Search / Retrieval / Reasoning Path`
   - Describe vector, BM25, graph traversal, metadata filtering, recency, reranking, or query engine behavior.
   - Include benchmarks only when the source is reliable.
8. `## Agent Integration`
   - Explain SDKs, APIs, MCP tools, framework adapters, storage backends, and operational setup.
9. `## Key Design Insight`
   - Name the honest architectural bet.
   - This should be the most quotable paragraph in the article.
10. `## What MindBrain Is`
    - Reintroduce MindBrain only after the target is fairly explained.
    - Emphasize facets, graphs, projections, typed ontologies, and GhostCrab MCP.
11. `## Why Try MindBrain First`
    - Make the affirmative case: multi-ontology workspaces, meta-ontologies, cross-silo queries, Domain Definition Language, deterministic facets, and projections that feed dashboards, kanban, work queues, and agent teams.
    - Tie the case to the target tool's gap. Do not leave MindBrain as a neutral comparison row.
12. `## Head-to-Head: MindBrain vs {Tool}`
    - Use dimensions that matter for builders: abstraction, use case, storage, schema enforcement, memory model, retrieval, graph, lifecycle, agent interface, target user.
13. `## The Structural Difference in One Sentence`
    - Restate the thesis with more confidence after the evidence.

Optional extension: add a `Query Catalog` when the article should show practical MindBrain queries for the target tool's audience.

## Tool Backlog And Angles

| Tool | Category | Core comparison angle |
|---|---|---|
| GBrain | Personal knowledge graph | Self-wiring personal graph vs schema-enforced agentic database |
| Mem0 | Personal/agent memory layer | Frictionless API memory vs structured domain model |
| Zep | Temporal knowledge graph memory | Temporal fact graph vs typed ontology plus projections |
| Letta | Agent memory operating system | Agent-controlled memory vs database-enforced structure |
| Supermemory | Universal memory API | Ingest-anything memory API vs modeled domain state |
| Cognee | Knowledge graph memory | Graph-emergent memory vs schema-first domain modeling |
| Hindsight | Knowledge graph memory | Emerging retrieval memory vs durable ontology-backed state |
| LangChain Memory | Agent framework memory | DIY memory assembly vs opinionated agentic database |
| LlamaIndex | Document/RAG framework memory | Document retrieval memory vs domain state modeling |
| Hermes Agent memory | Agent-native cross-session recall | Conversation recall vs cross-ontology structured state |
| Notion / Obsidian + AI plugins | PKM tools | Human-authored notes plus AI vs agent-native structured memory |
| Protege / TopBraid | Ontology tooling | Research-grade ontology editors vs practitioner-ready agentic ontology runtime |

## Category Framing

Personal knowledge graphs:
Mem0, Zep, Letta, Supermemory, and GBrain mostly answer "what should this agent remember about a person, session, or conversation?"

Knowledge graph memory:
Cognee and Hindsight answer "how can unstructured information become a traversable graph?"

Agent frameworks with embedded memory:
LangChain Memory, LlamaIndex, and Hermes Agent memory answer "how does memory plug into an existing agent workflow?"

Traditional PKM and ontology tools:
Notion, Obsidian, Protege, and TopBraid answer "how do humans organize knowledge before agents act on it?"

MindBrain's recurring contrast:
MindBrain answers "how does an agent navigate a typed domain with states, dependencies, rules, and compact projections at query time?"

MindBrain's affirmative case:
MindBrain lets one workspace hold several ontologies at once, then connect them with meta-ontologies. That is the basis for queries across application silos, such as CRM relationship warmth intersected with ERP invoices, project blockers, HR ownership, emails, legal obligations, and financial filings.

MindBrain DDL:
Treat DDL as Domain Definition Language. SQL DDL defines tables, columns, and physical storage; MindBrain DDL defines meaning, relations, lifecycle states, facet dimensions, graph edges, and projections that drive `pg_facets`, `pg_dgraph`, and the MindBrain stack.

Deterministic advantage:
Facets and graph traversal let agents select the right records or endpoints in milliseconds. Use the endpoint example when helpful: if 10,000 endpoints are registered across 20 active MCP servers, the agent should find the four endpoints needed for email and calendar work through facets and graph relations, not by burning tokens over a giant tool catalog.

## Recommended Article Series

| Article | Best audience | Likely conclusion |
|---|---|---|
| `GBrain vs Mem0 vs MindBrain` | AI builders and indie hackers | Personal brain, API memory, and structured domain model are three different layers |
| `Zep vs MindBrain` | Backend engineers | Temporal memory graphs are strong for changing facts; MindBrain is stronger for domain operations |
| `Cognee vs MindBrain` | Knowledge graph practitioners | Inferred graphs help discovery; typed ontologies help deterministic work |
| `Letta vs MindBrain` | Agent framework architects | Letta trusts the agent to manage memory; MindBrain constrains the domain so agents can act safely |
| `Hermes memory vs MindBrain` | OpenClaw/Hermes users | Cross-session recall is not the same as cross-ontology project state |
| `LangChain Memory vs MindBrain` | Full-stack developers | LangChain gives parts; MindBrain gives an operational model |
| `Obsidian + AI vs GBrain vs MindBrain` | Developer productivity audience | Notes, personal graphs, and agentic databases solve different stages of knowledge work |

## Head-To-Head Dimensions

Use these table rows unless the target tool calls for better ones:

- Core abstraction
- Primary use case
- Storage engine
- Schema enforcement
- Memory model
- Retrieval
- Graph support
- Temporal/lifecycle behavior
- Multi-ontology or multi-domain support
- Agent interface
- Target user
- Operational complexity
- Best fit
- Weak fit

## Quality Bar

The article is ready when a knowledgeable user can say:

- "This explains the other tool fairly."
- "The MindBrain comparison is architectural, not just promotional."
- "I understand what I would use each tool for."
- "The conclusion follows from the mechanisms described earlier."
