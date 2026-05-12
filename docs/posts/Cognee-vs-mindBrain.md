---
title: Cognee vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - cognee
  - knowledge-graph
---

## The Structural Difference in One Sentence

Cognee is a **graph-emergent memory system**: its intelligence lives in turning raw data into chunks, summaries, embeddings, nodes, and edges that can be searched through vector and graph retrieval. [Cognee overview](https://docs.cognee.ai/core-concepts/overview)

mindBrain is a **schema-first domain modeling system**: its intelligence lives in typed ontologies, facets, directed graph relations, and projections that define the domain before the agent uses it. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## What Cognee Is

Cognee is an open-source memory framework and platform for AI agents. The official docs describe it as a system that transforms raw data into searchable memory by combining vector search with graph databases, so information is both semantically searchable and connected by relationships. [Cognee overview](https://docs.cognee.ai/core-concepts/overview)

The public product framing is "model your agent's world": Cognee can plug into runtimes such as Claude Code, Codex, Cursor, LangGraph, CrewAI, Hermes, OpenClaw, and MCP-compatible agents. [Cognee website](https://www.cognee.ai/) The GitHub repository presents it as a memory control plane for AI agents. [Cognee GitHub](https://github.com/topoteretes/cognee)

Cognee is structurally closer to mindBrain than a simple vector memory layer because it treats graph structure as a first-class part of retrieval. The important difference is timing: Cognee usually derives graph structure from ingested data; mindBrain uses explicit domain structure as the substrate the agent works inside.

***

## The Core Problem It Solves

Flat RAG can find semantically similar text, but it struggles with relationships. A document chunk can mention a company, product, person, and requirement, yet the retrieval system may not know how those objects relate. Cognee's core move is to transform raw data into a graph-backed memory where retrieval can use both similarity and structure. [Cognee search docs](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/search)

This is especially useful for teams with large document sets, warehouses, APIs, or knowledge bases that were not originally written as agent-ready domain models. Cognee provides a path from messy input toward a searchable world model.

mindBrain starts from the other side of the same pain. Instead of asking "how do we infer a useful graph from data?", it asks "what domain model should the agent be constrained by?" That makes the comparison less about whether graphs matter and more about where the graph comes from.

***

## Architecture

Cognee's official overview names three complementary storage systems:

- a relational store for documents, chunks, provenance, and links;
- a vector store for embeddings and semantic similarity;
- a graph store for entities and relationships. [Cognee overview](https://docs.cognee.ai/core-concepts/overview)

The practical flow looks like this:

```text
Raw data
  |
  v
Cognee operations
  remember / recall / improve / forget
  legacy: add + cognify + search
  |
  v
Processing pipeline
  documents -> chunks -> entities -> relationships -> summaries
  |
  v
Stores
  relational provenance
  vector embeddings
  graph nodes and edges
  |
  v
Agent retrieval
  vector + graph + LLM completion
```

The legacy `cognify()` pipeline is still useful for understanding the mechanism: it classifies documents, checks permissions, extracts chunks, extracts graph entities and relationships, summarizes text, embeds nodes and summaries, and writes graph edges. [Cognee cognify docs](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/cognify)

mindBrain exposes a smaller agent-facing mental model:

```text
GhostCrab MCP
  |
  +-- Find   -> facets
  +-- Follow -> directed graphs
  +-- Pack   -> projections
  |
  v
mindBrain domain state
  typed entities
  typed relations
  schemas / ontologies
  compact working projections
```

GhostCrab's architecture page is explicit that facets narrow the domain, graphs represent blockers and prerequisites, and projections give the agent a compact working bundle rather than a raw dump. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Data Schema

Cognee's atomic unit is the `DataPoint`. The docs define DataPoints as structured Pydantic models that carry content, metadata, provenance, versioning, and indexing hints. They become graph nodes and edges and can also be embedded for semantic search. [Cognee DataPoints](https://docs.cognee.ai/core-concepts/building-blocks/datapoints)

The visible model is roughly:

```text
Dataset
  owns data items and processing status

Document / DocumentChunk
  source content and chunked text

DataPoint
  Pydantic object with content, metadata, index fields

Entity / EntityType
  named graph objects

Edge
  relation between DataPoints

Triplet embedding
  subject -> predicate -> object as semantic retrieval unit
```

Cognee can also embed graph triplets as text strings, which allows relationship patterns to be retrieved through vector similarity, not only graph traversal. [Cognee DataPoints](https://docs.cognee.ai/core-concepts/building-blocks/datapoints)

mindBrain's data model is more operational. The point is not only to store nodes and edges, but to make the agent work against declared domain objects:

```text
Entity
  task, customer, requirement, regulation, incident, document

Facet
  status, owner, country, phase, priority, role

Relation
  REQUIRES, BLOCKS, VALIDATES, DEPENDS_ON

Projection
  FACT, GOAL, STEP, CONSTRAINT
```

That structure is narrower but more deterministic. A Cognee graph can emerge from a corpus. A mindBrain graph is meant to encode the domain contract an agent should respect.

***

## Signature Mechanism

Cognee's signature mechanism is **graph generation from data pipelines**.

The important step is the move from documents to graph:

```text
document
  -> chunk
  -> entity extraction
  -> relationship extraction
  -> graph nodes and edges
  -> summaries and embeddings
  -> graph-aware retrieval
```

The docs say graph extraction uses LLMs to identify entities and relationships, deduplicates nodes and edges, and commits them to the graph database. [Cognee cognify docs](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/cognify) This makes Cognee well suited to corpora where structure exists implicitly in text but has not been formally modeled.

Cognee also supports optional RDF/OWL ontologies. The ontology acts as a reference vocabulary: extracted entity types and mentions can be checked against canonical concepts; if a match is found, nodes can be marked `ontology_valid`, and inherited class or object-property links can be attached. [Cognee ontologies](https://docs.cognee.ai/core-concepts/further-concepts/ontologies)

mindBrain's signature mechanism is **schema-first work context**. It does not wait for a corpus to imply that `A BLOCKS B` or that a `legal_review` state exists. Those are part of the domain model, and the agent's retrieval and action path are built around them.

***

## Search / Retrieval / Reasoning Path

Cognee search blends vector similarity, graph structure, and LLM reasoning. The docs describe search types such as graph-aware completion, RAG completion, chunks, summaries, triplets, temporal retrieval, Cypher, and natural language retrieval. [Cognee search docs](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/search)

The default graph-aware path can be understood as:

```text
query
  -> vector hints
  -> relevant graph triplets
  -> graph context
  -> LLM-composed answer
```

That is strong for discovery: "what relationships are present in this knowledge base?", "which concepts connect these documents?", "what does the graph imply about this question?"

mindBrain retrieval is stronger when the question is operational: "which tasks are blocked by an unresolved prerequisite?", "which onboarding cases are active in Belgium?", "what facts, goals, steps, and constraints should the agent use for this exact turn?" GhostCrab frames facets, graphs, and projections as the three operations an agent uses to find, follow, and pack context. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Agent Integration

Cognee exposes local and cloud paths. Its site emphasizes local quickstarts, connectors, production deployment, first-party integrations, and an MCP server for agent runtimes. [Cognee website](https://www.cognee.ai/) The developer workflow can be as small as adding documents, remembering them, and recalling from them; deeper control comes through custom tasks, pipelines, DataPoints, and graph models. [Cognee pipelines](https://docs.cognee.ai/core-concepts/building-blocks/pipelines)

mindBrain integrates through GhostCrab MCP. Rather than exposing a generic memory framework, GhostCrab exposes domain operations: search by facets, traverse directed graph relations, and build projections. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

The integration choice reflects the product philosophy. Cognee is comfortable being a memory framework in a broader agent stack. mindBrain is designed as the structured state layer underneath the agent's work.

***

## Key Design Insight

Cognee's strongest idea is that **memory should become a graph, not stay a pile of chunks**. Its pipeline architecture gives teams a way to convert raw data into a graph-backed, vector-searchable memory without hand-modeling every entity first.

mindBrain's strongest idea is that **some domains should not be inferred at query time**. If a workflow has legal prerequisites, compliance states, ownership rules, or directed blockers, the graph is not merely a helpful retrieval artifact. It is the contract the agent must obey.

The honest tradeoff is flexibility versus determinism. Cognee can discover structure from data. mindBrain asks the builder to model structure so the agent can act against it reliably.

***

## What MindBrain Is

mindBrain is a structured agentic database exposed through GhostCrab MCP. GhostCrab describes the stack as a working layer that lets existing agents use structured project state on mindBrain Personal, backed by SQLite, or mindBrain Professional, backed by PostgreSQL. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

The domain is not hidden inside embeddings. It is navigable as entities, stages, relationships, procedures, constraints, dependencies, and project state. [GhostCrab home](https://www.ghostcrab.be/)

## Why Try MindBrain First

If the goal is to discover a graph from a corpus, Cognee is the natural first test. If the goal is to make agents operate across several business domains, mindBrain deserves to be tested first because it can hold multiple ontologies in one workspace and connect them through meta-ontologies. A CRM ontology, a project ontology, a compliance ontology, and a knowledge ontology do not have to collapse into one vague graph. They can remain distinct while still supporting joins across facets and typed edges.

That is the unusual part. Most memory and graph tools help retrieve what was said or infer relations from documents. mindBrain lets a team define what the relations mean before the agent acts: customer warmth, invoice status, project phase, legal obligation, owner, blocker, evidence, and next step can live in separate ontologies but still answer one operational query.

MindBrain DDL is best read as **Domain Definition Language**. SQL DDL defines physical storage; MindBrain DDL defines semantic structure: entity types, facet dimensions, graph relations, lifecycle states, and projections that drive `pg_facets`, `pg_dgraph`, and the projection layer. That makes it possible to project a reusable project model, such as an SEO audit, credit-scoring audit, web build, or software delivery process, into an instance that a team of AI agents can execute.

The performance argument is not just speed for its own sake. Faceted dimensions let the agent narrow large domains deterministically in milliseconds. If a project exposes 10,000 endpoints across 20 active MCP servers, the agent should find the four endpoints needed to send an email and schedule a meeting through facets and graph relations, not by burning tens of thousands of tokens rereading a tool catalog. The Professional tier is designed around bitmap-scale tables of roughly 4.3 billion addressable objects per table. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: MindBrain vs Cognee

| Dimension | Cognee | mindBrain |
|---|---|---|
| Core abstraction | Graph-backed AI memory | Structured agentic database |
| Primary use case | Turn raw data into searchable graph memory | Make a domain navigable and actionable for agents |
| Graph origin | Emerges from ingestion and LLM extraction | Declared through typed domain modeling |
| Storage model | Relational store, vector store, graph store | SQLite or PostgreSQL-backed domain state |
| Schema enforcement | DataPoints, optional RDF/OWL grounding, custom graph models | Typed schemas, ontologies, relation types, facets |
| Retrieval | Vector + graph + LLM, multiple search modes | Facets + graph traversal + projections |
| Best question | "What structure can we extract from this corpus?" | "What state and dependencies govern this domain?" |
| Agent interface | SDKs, pipelines, integrations, MCP | GhostCrab MCP |
| Best fit | Knowledge graph memory over existing data | Operational domains with explicit states and constraints |
| Weak fit | Deterministic workflow enforcement from day one | Automatic graph discovery from large unmodeled corpora |

***

## The Structural Difference in One Sentence

Cognee is strongest when you want a corpus to **become** a graph-backed memory.

mindBrain is strongest when you already know the domain needs a graph-shaped contract and you want the agent to work inside it.
