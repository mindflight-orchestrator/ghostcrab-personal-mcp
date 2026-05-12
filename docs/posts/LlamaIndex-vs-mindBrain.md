---
title: LlamaIndex vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - llamaindex
  - rag
  - agent-memory
---

## The Structural Difference in One Sentence

LlamaIndex is a **document and query framework** for getting the right context into an LLM: its intelligence lives in indexes, retrievers, memory blocks, and query engines.

mindBrain is a **domain state model** for agents: its intelligence lives in typed entities, facets, directed relations, and compact projections served through GhostCrab MCP. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## What LlamaIndex Is

LlamaIndex is strongest when the problem starts with information sources: documents, nodes, indexes, vector stores, retrievers, query engines, and agents that need to reason over retrieved context. Its indexing documentation defines an index as a data structure composed of `Document` objects that enables querying by an LLM. The common `VectorStoreIndex` splits documents into nodes and creates vector embeddings for query-time retrieval. [LlamaIndex indexing](https://docs.llamaindex.ai/en/stable/understanding/indexing/indexing/)

LlamaIndex also has an agent memory system. Its `Memory` class stores and retrieves both short-term and long-term memory. Short-term memory is represented as a FIFO queue of `ChatMessage` objects; when it exceeds configured limits, older messages can be archived and optionally flushed into long-term memory blocks. [LlamaIndex memory example](https://developers.llamaindex.ai/python/examples/memory/memory/)

That makes LlamaIndex a natural fit for agents whose main job is:

- answer questions over a corpus
- retrieve semantically relevant source chunks
- summarize or synthesize documents
- maintain conversation state around query workflows
- add memory blocks to agents without replacing the retrieval stack

The comparison to mindBrain is therefore **document/query memory vs domain state modeling**.

***

## The Core Problem It Solves

LlamaIndex solves the "my model needs the right context" problem. Raw documents are too large, too numerous, or too heterogeneous to paste into a prompt. LlamaIndex provides the machinery to load, transform, index, retrieve, postprocess, and synthesize information into responses.

Its memory layer solves the adjacent problem: once an agent is running, it needs to keep recent chat history and optionally distill older messages into long-term memory blocks. The official memory example describes short-term memory as a token-bounded chat history and long-term memory as `Memory Block` objects that receive flushed messages and may process them to extract information. [LlamaIndex memory example](https://developers.llamaindex.ai/python/examples/memory/memory/)

This is the right shape when the failure mode is:

- relevant documents are buried in a large corpus
- semantic search beats keyword lookup
- the agent needs recent chat plus retrieved documents
- older messages should be summarized, extracted, or vectorized
- query engines should coordinate retrieval and response synthesis

It is not the same problem as modeling a live domain:

- a deal has a stage, owner, objections, approvals, blockers, and next actions
- a compliance workflow has prerequisites, exceptions, and validation steps
- a release has tasks, dependencies, owners, risks, and status transitions
- a family relocation has people, documents, deadlines, schools, and constraints

Those are not only documents to retrieve. They are domain state to navigate.

***

## Architecture

LlamaIndex begins with data access and retrieval.

```text
+------------------------------+
| Data Sources                 |
| PDFs, docs, websites, DBs    |
+------------------------------+
| Documents / Nodes            |
| chunking + metadata          |
+------------------------------+
| Indexes                      |
| vector, summary, KG, SQL...  |
+------------------------------+
| Retrievers / Query Engines   |
| fetch, rerank, synthesize    |
+------------------------------+
| Agents + Memory              |
| chat history + memory blocks |
+------------------------------+
```

The memory subsystem sits inside that broader retrieval framework:

```text
new messages
  -> short-term FIFO chat history
  -> token limit exceeded
  -> flush older messages
  -> long-term memory blocks
  -> merge short-term and long-term memory at retrieval time
```

The LlamaIndex docs describe default short-term memory as the last messages that fit a token limit, controlled by `token_limit`, `chat_history_token_ratio`, and `token_flush_size`. [LlamaIndex memory guide](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/)

mindBrain starts from a different substrate:

```text
+------------------------------+
| Domain                       |
| people, tasks, docs, rules   |
+------------------------------+
| Facets                       |
| status, owner, phase, role   |
+------------------------------+
| Graphs                       |
| REQUIRES, BLOCKS, VALIDATES  |
+------------------------------+
| Projections                  |
| FACT, GOAL, STEP, CONSTRAINT |
+------------------------------+
| GhostCrab MCP                |
| existing agent interface     |
+------------------------------+
```

GhostCrab's architecture page defines the mental model as three capabilities on one MCP surface: find with Facettes, follow with Graphes, and pack context with Projections. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Memory Model

LlamaIndex memory is token-budget aware.

```text
Memory
  session_id
  token_limit
  chat_history_token_ratio
  token_flush_size
  short_term_messages[]
  memory_blocks[]
```

Long-term memory is represented as memory blocks. The docs describe blocks as receiving messages flushed from short-term memory, optionally processing them to extract information, and then being merged back with short-term memory when memory is retrieved. [LlamaIndex memory guide](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/)

That gives LlamaIndex a practical memory model for agents that need:

- recent chat history
- selected durable facts
- vector memory blocks
- static memory blocks
- fact extraction blocks
- token-aware truncation

mindBrain's model is not built around chat-message overflow. It is built around domain objects:

```text
entity
  type: opportunity | task | obligation | document | person
  status: active | blocked | approved | missing
  facets: owner, phase, country, priority, customer
  relations: REQUIRES, BLOCKS, VALIDATES, DEPENDS_ON
  projections: FACT, GOAL, STEP, CONSTRAINT
```

This is the core divide. LlamaIndex memory asks "what should the model remember from the interaction?" mindBrain asks "what is the modeled state of the world the agent is operating inside?"

***

## Signature Mechanism

LlamaIndex's signature mechanism is **retrieval-centered context construction**.

Its index layer turns documents into retrievable structures. Its memory layer turns recent and older chat into a token-bounded context surface. Its query engines and retrievers decide which indexed nodes should be used for a response. The indexing docs position `VectorStoreIndex` as the common path: documents become nodes, nodes get embeddings, and the LLM queries those embeddings. [LlamaIndex indexing](https://docs.llamaindex.ai/en/stable/understanding/indexing/indexing/)

The memory system extends that same philosophy:

```text
conversation grows
  -> short-term queue fills
  -> older messages are flushed
  -> memory blocks extract / store / retrieve
  -> model receives a merged memory view
```

mindBrain's signature mechanism is **pre-modeled operational structure**:

```text
domain grows
  -> facts are faceted
  -> dependencies become directed edges
  -> working context is projected
  -> agent receives the compact state surface
```

Both systems reduce context overload. LlamaIndex reduces it by retrieving and summarizing the right content. mindBrain reduces it by keeping the domain already structured.

***

## Search / Retrieval / Reasoning Path

In LlamaIndex, search usually begins with a query over indexes.

```text
user question
  -> query engine
  -> retriever
  -> vector / summary / graph / SQL index
  -> nodes
  -> postprocessing
  -> response synthesis
```

The public indexing guide frames indexes as complementary to querying strategy and describes vector embeddings as numerical representations of meaning that let an LLM retrieve relevant nodes. [LlamaIndex indexing](https://docs.llamaindex.ai/en/stable/understanding/indexing/indexing/)

Memory retrieval is merged into that workflow. Short-term and long-term memory are combined under token limits, and memory blocks can be truncated according to priority if the combined content exceeds the budget. [LlamaIndex memory guide](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/)

mindBrain's reasoning path is closer to operational querying:

```text
user asks about a domain
  -> filter by facets
  -> traverse directed relations
  -> detect blockers / prerequisites / gaps
  -> pack FACT / GOAL / STEP / CONSTRAINT
  -> agent responds with next action
```

This is why the two systems can be complementary. A LlamaIndex agent can retrieve documents about a policy. mindBrain can tell the agent which policy obligation is blocking which workflow step and what must happen next.

***

## Agent Integration

LlamaIndex is a strong choice when the agent is already a RAG or document agent. It gives the builder a coherent way to connect documents, indexes, retrievers, query engines, vector stores, and memory blocks.

mindBrain is a strong choice when the agent is not the application framework but the interface. GhostCrab sits between an MCP-capable agent and durable structured storage. The GhostCrab architecture says it extends agents such as Claude Code, Cursor, Codex, and OpenClaw rather than replacing them. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

A practical deployment can use both:

```text
LlamaIndex
  -> retrieve source documents and citations

mindBrain / GhostCrab
  -> track entities, lifecycle state, dependencies, blockers, projections
```

That split is cleaner than forcing one tool to play both roles.

***

## Key Design Insight

LlamaIndex's honest bet is that most LLM applications fail because the model does not have the right context from the right sources. It therefore optimizes the path from source data to query-time context.

mindBrain's honest bet is that many agents fail even when they can retrieve the right source text, because they do not have a stable model of the domain's state. They can quote a policy but miss the dependency. They can summarize a meeting but lose the blocker. They can find a document but not know whether the procedure is ready to advance.

The difference is not "RAG vs memory." It is **retrieval over knowledge artifacts vs structured navigation of work**.

***

## What MindBrain Is

mindBrain is the structured database layer under GhostCrab. GhostCrab exposes Facettes, Graphes, and Projections through one MCP surface: filter the relevant subset, follow directional relationships, and pack compact working context. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

The architecture page describes mindBrain Personal as SQLite-backed and mindBrain Professional as PostgreSQL-backed. It also describes Projections as ranked `FACT`, `GOAL`, `STEP`, and `CONSTRAINT` bundles, not transcript dumps or raw graph dumps. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

In LlamaIndex terms, mindBrain is not another retriever. It is the modeled state the retriever's evidence can feed.

***

## Why Ontologies Beat Flat Data Models

Traditional databases store data in tables — rows and columns with fixed types. That works well for transactional data, but it breaks down fast when your domain is complex, evolving, or needs to be understood by an AI agent. Tables answer *"what is stored here?"* but not *"what does this mean?"*

An ontology answers both.

***

### The Three Building Blocks

**Concepts** are the things that exist in your domain — a `Person`, a `Project`, a `Decision`. Not a table row: a meaningful entity with an identity and a type in a shared vocabulary.

**Semantic Relations** connect concepts with named, directional meaning — `Person` *manages* `Project`, `Decision` *depends_on* `Constraint`. Unlike a foreign key, a relation carries intent: an agent reading the graph knows *why* two things are linked, not just *that* they are.

**Properties** describe the attributes of a concept — a `Person` has a `name`, a `role`, an `expertise_level`. Unlike a column, a property can be typed, optional, multivalued, or inherited from a parent concept.

***

### Axioms — The Rules Layer

Axioms are constraints that make the model self-enforcing:
- A `Decision` *must* have at least one `rationale`
- A `Person` *cannot* manage more than one `active Project` at a time
- A `Skill` *is a subtype of* `Capability`

This is where ontologies go beyond schemas. A SQL table can't express that two concepts are *subtypes* of a shared abstraction, or that a relation is *transitive*. An ontology can — and an AI agent can reason over those rules without being told explicitly.

***

### What This Solves for Developers

| Problem with tables | Ontology solution |
|---|---|
| Schema changes break existing queries | Concepts extend without breaking existing relations |
| Foreign keys carry no semantic meaning | Named relations express *why* things connect |
| No native support for inheritance | Concept hierarchies are first-class |
| Business rules live in application code | Axioms are declared in the model itself |
| AI agents see raw data, not meaning | Agents traverse a graph of typed, named, meaningful nodes |

The practical result: your data model becomes something an AI agent can navigate, query, and reason over — not just a flat surface it has to be told how to interpret every time.

***

## Concrete MindBrain Workflow

For a LlamaIndex audience, the important question is what happens after retrieval. mindBrain does not replace the document pipeline. It gives the retrieved evidence a structured destination.

```text
1. Model the domain
   -> ghostcrab_modeling_guidance or a domain loadout proposes entities
      such as obligation, document, task, owner, approval, and risk.

2. Verify the model
   -> ghostcrab_schema_list / ghostcrab_schema_inspect check the registered
      schema surface.
   -> ghostcrab_workspace_export_model exports the semantic contract for
      importers, generators, or tests.

3. Qualify and import data
   -> MindBrain Studio or a documented import path maps source documents,
      chunks, extracted entities, citations, relations, facets, and
      projection signals into the workspace model.

4. Query after import
   -> ghostcrab_search reads facet-indexed records such as obligation
      status, owner, jurisdiction, and workflow phase.
   -> ghostcrab_count answers shape-of-domain questions before synthesis.
   -> ghostcrab_facet_tree exposes the taxonomy of imported dimensions.
   -> ghostcrab_traverse follows document-validates-obligation or
      task-depends-on-approval edges.
   -> ghostcrab_coverage checks where the ontology or evidence graph is thin.
   -> ghostcrab_pack compresses the current task into FACT / GOAL / STEP /
      CONSTRAINT context.
```

This is why the import step is a qualification step, not just ingestion. A PDF chunk can remain evidence in LlamaIndex, while its extracted obligation, owner, approval gate, and citation link become queryable domain state in mindBrain. The local GhostCrab inventory lists separate Facets, Graph, and Workspace tool families, including search, count, facet trees, traverse, coverage, and workspace model export. [GhostCrab architecture inventory](../../README_ARCHITECTURE.md)

***

## Taxonomy Cost / Expected Gain

The cost of mindBrain is that a team must decide what the domain means before agents rely on it. A document corpus can be indexed quickly; a domain model needs entity types, relations, statuses, owners, lifecycle phases, evidence links, and projection rules.

That cost pays back when the same imported corpus drives repeated action. A compliance team does not only ask "what does the policy say?" It asks which obligations are uncovered, which documents validate them, who owns each remediation task, what is blocked, and what context the agent should see before drafting the next action. Facets make the narrowing deterministic, graph edges preserve dependencies, coverage exposes gaps, and projection packs keep the agent's context compact.

The cost does not pay back for simple corpus QA, exploratory reading, or a one-time synthesis over a small folder. In those cases, LlamaIndex is the lighter and often better first choice: index the documents, retrieve the chunks, cite the evidence, and avoid modeling work until the workflow starts needing state.

***

## Why Try MindBrain First

LlamaIndex is often the right first test when the question is "how do I retrieve the right document context?" mindBrain should be tested first when the question is "how do agents act on several kinds of structured meaning at once?" Documents can supply evidence, but projects, customers, obligations, endpoints, tasks, filings, and concepts need typed state and relations.

mindBrain lets multiple ontologies live in one workspace and then connects them through meta-ontologies. That means a legal corpus, SEC filings, CRM history, software tickets, PM milestones, and mental-model notes can each keep their native dimensions while still participating in one query. The agent can ask for a concept, the supporting evidence, the owner, the current project state, and the blocking dependency without rebuilding the domain from retrieved chunks.

MindBrain DDL is **Domain Definition Language**. It describes meaning, graph edges, lifecycle states, facet dimensions, and projections. SQL DDL tells the database how rows are stored; MindBrain DDL tells the agent what a row means and how it can be used. Projections then turn that semantic model into dashboard data, kanban columns, work queues, or knowledge graph views.

This is where deterministic performance changes the agent architecture. Instead of retrieving broad chunks and asking the model to sort them, facets can filter massive domains in milliseconds, while graph traversal follows exact dependencies. In a workspace with 10,000 MCP endpoints, the agent should find the four endpoints needed for email and scheduling through structure, not by spending tokens over endpoint descriptions. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: MindBrain vs LlamaIndex

| Dimension | LlamaIndex | mindBrain |
|---|---|---|
| Core abstraction | Documents, nodes, indexes, retrievers, query engines | Typed domain entities, facets, graphs, projections |
| Primary use case | Querying and reasoning over data sources | Navigating structured project/domain state |
| Memory model | Short-term chat history plus long-term memory blocks | Durable entity state plus projection packs |
| Storage | Vector stores, document stores, SQL/vector integrations | SQLite Personal or PostgreSQL Professional |
| Schema enforcement | Document metadata and application-level structure | Domain schemas, typed relations, lifecycle state |
| Retrieval | Vector, summary, graph, SQL, custom retrievers | Faceted filtering, directed graph traversal, packed context |
| Graph support | Available as index/query patterns | First-class directed operational graph |
| Token strategy | Token limits, flushing, memory block priority | Precomputed compact projections |
| Best fit | RAG, document QA, corpus agents | Project, workflow, CRM, compliance, operations |
| Weak fit | Deterministic workflow state without extra modeling | Document ingestion and corpus search by itself |
| Agent interface | LlamaIndex agents and workflows | MCP tools for existing agents |
| Design center | Context retrieval | Domain state navigation |

***

## Query Catalog

LlamaIndex-style questions:

```text
What does this document say about retention?
Find the most relevant policy sections for this user question.
Summarize these PDFs and cite the source chunks.
Retrieve similar past messages from memory.
```

mindBrain-style questions:

```text
ghostcrab_search: which obligations have status=blocked and jurisdiction=EU?
ghostcrab_count: how many obligations lack evidence, grouped by owner?
ghostcrab_traverse: which documents validate this workflow step?
ghostcrab_coverage: which ontology nodes or required evidence links are missing?
ghostcrab_pack: what compact facts, goals, steps, and constraints should the agent see now?
```

The first set retrieves knowledge. The second set navigates state.

***

## The Structural Difference in One Sentence

LlamaIndex makes external knowledge queryable for an LLM; mindBrain makes a working domain navigable for an agent.
