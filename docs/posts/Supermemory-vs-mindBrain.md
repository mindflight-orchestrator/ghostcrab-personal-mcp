---
title: Supermemory vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - supermemory
  - agent-memory
---

## The Structural Difference in One Sentence

Supermemory is a **universal memory and context API**: its intelligence lives in accepting many forms of raw context, extracting useful memories, and retrieving the most relevant snippets or facts for an agent. [Supermemory docs](https://supermemory.ai/docs/intro)

mindBrain is a **structured agentic database**: its intelligence lives in schema enforcement, typed ontologies, directed relations, facets, and pre-computed projections that make a modeled domain navigable at query time. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## What Supermemory Is

Supermemory positions itself as long-term and short-term memory infrastructure for AI agents: developers send it text, files, chats, URLs, documents, images, and even video URLs, then Supermemory indexes and extracts context so models can retrieve only the relevant pieces later. [Supermemory overview](https://supermemory.ai/docs/intro) [Ingesting context](https://supermemory.ai/docs/add-memories)

It is primarily an API product and developer platform. The official docs describe three adjacent surfaces: agent memory, content extraction, connectors and syncing, and managed RAG. That makes Supermemory closest to a "context substrate" for product teams that want user memory, document search, and connector-backed ingestion without building their own extraction and retrieval stack. [Supermemory overview](https://supermemory.ai/docs/intro)

The GitHub repository describes Supermemory as a memory engine and app for the AI era, but the operational interface exposed in the docs is API-first: add memory, sync sources, search memories, and filter results by user or project container. [Supermemory GitHub](https://github.com/supermemoryai/supermemory)

***

## The Core Problem It Solves

AI agents often fail because their useful context is scattered across conversations, documents, files, websites, and SaaS systems. Supermemory solves the ingestion and recall side of that problem: send raw content in, let the service process it, and retrieve memories or chunks through one search interface. [Ingesting context](https://supermemory.ai/docs/add-memories)

The important axis is breadth. Supermemory is built for teams that do not want every application to maintain its own parser, connector, chunker, memory extractor, and search endpoint. It gives the agent a consistent context API over heterogeneous content.

That is not the same as modeling a domain. A memory API can remember that a customer prefers annual billing, that a document contains a clause, or that a user asked about a feature. A modeled domain state also represents whether the account is blocked, which legal review is prerequisite, which workflow stage is active, and which transition is allowed next.

***

## Architecture

Supermemory's public architecture is exposed through API behavior rather than a full database schema. The visible shape is:

```text
Agent / App
    |
    v
Supermemory API
    |
    +-- Add raw context
    |     text, chats, files, URLs, HTML, markdown
    |
    +-- Connectors
    |     Google Drive, Notion, OneDrive, Web Crawler
    |
    +-- Processing
    |     extraction, indexing, memory building
    |
    +-- Search
          hybrid memory + chunk retrieval,
          metadata filters, optional rerank
```

The docs say `containerTag` groups context by user or project and improves search performance; metadata is a key-value object used for filtering. [Add memory parameters](https://supermemory.ai/docs/add-memories) Connectors can sync external sources such as Google Drive, Notion, OneDrive, and Web Crawler, with webhook or scheduled sync depending on the provider. [Connectors overview](https://supermemory.ai/docs/memory-api/connectors/overview)

mindBrain's architecture is more explicit about operational structure:

```text
Agent
  |
  v
GhostCrab MCP
  |
  +-- Facets: find the relevant slice
  +-- Graphs: follow dependencies and blockers
  +-- Projections: pack compact working context
  |
  v
mindBrain
  Personal: SQLite
  Professional: PostgreSQL
```

GhostCrab's own architecture page frames those three operations as Find, Follow, and Pack: facets narrow a project or domain, directed graphs model relationships and blockers, and projections provide compact bundles instead of transcript dumps. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Memory Model

Supermemory's memory model is centered on containers, raw content, extracted memories, document chunks, and metadata:

```text
containerTag
  user_123 / project_alpha / organization_x

raw content
  text, conversation, document, URL, HTML, markdown, file

memory
  extracted fact or learned context

chunk
  document content returned by hybrid search

metadata
  source, category, tags, filters
```

The `add` flow accepts arbitrary string formats for conversations, supports `customId` for updates and deduplication, and can upload PDFs, images, documents, spreadsheets, and video URLs. [Ingesting context](https://supermemory.ai/docs/add-memories) Search results in hybrid mode can contain either a `memory` field for extracted facts or a `chunk` field for document content. [Supermemory search](https://supermemory.ai/docs/search)

That model is intentionally permissive. The API wants content to be easy to add. The schema is mostly at the boundary: `content`, `containerTag`, `customId`, and `metadata`.

mindBrain starts one layer lower: it models the domain itself. The important objects are not just memories and chunks, but typed entities, allowed states, relation types, and task-specific projections. GhostCrab describes this as a structured world made of entities, stages, relationships, procedures, constraints, dependencies, and project state. [GhostCrab home](https://www.ghostcrab.be/)

***

## Signature Mechanism

Supermemory's signature mechanism is **universal context ingestion plus memory retrieval**.

The developer does not have to decide up front whether the source is a note, conversation, webpage, PDF, spreadsheet, or external connector. The API normalizes the intake path, extracts memories, and makes both learned memories and source chunks available for search. [Supermemory overview](https://supermemory.ai/docs/intro)

The mechanism is powerful because it is low friction:

```text
send content
    |
    v
extract / index / group by container
    |
    v
search memories and chunks
    |
    v
pass relevant context to the model
```

mindBrain's signature mechanism is **modeled state plus zero-inference projections**. The agent does not ask "what text is similar to this query?" first. It can ask "which open onboarding cases in Belgium are blocked?" or "which deal has no legal review yet?" because the domain has facets and graph relations that can be queried directly. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Search / Retrieval / Reasoning Path

Supermemory search is optimized around relevance over memories and documents. Its v4 search endpoint supports `searchMode: "hybrid"` to search both extracted memories and document chunks; parameters include `containerTag`, `limit`, `threshold`, `rerank`, and metadata `filters`. [Supermemory search](https://supermemory.ai/docs/search)

The docs also describe user profiles, static and dynamic facts, and learned user context that can evolve over time. [Supermemory overview](https://supermemory.ai/docs/intro) That makes it strong for personalization and context carry-over: "what does this user prefer?", "what did this project document say?", "which memory is relevant to this message?"

mindBrain retrieval is not just a relevance problem. It has three retrieval surfaces:

- **Facets** answer "which subset of the domain matches these typed conditions?"
- **Graphs** answer "what depends on what, what blocks what, and what is missing?"
- **Projections** answer "what compact working bundle should the agent see now?"

The difference matters for agents that must act. If the next step is merely to answer with relevant context, Supermemory fits naturally. If the next step is to choose a valid workflow transition, respect a prerequisite, or explain why an operation is blocked, a modeled state system gives the agent a stronger substrate.

***

## Agent Integration

Supermemory is designed to be used through SDKs and API calls. The docs show TypeScript, Python, and cURL examples for adding content and searching memories, with `containerTag` acting as the main scoping primitive. [Ingesting context](https://supermemory.ai/docs/add-memories) [Supermemory search](https://supermemory.ai/docs/search)

Its connector surface is useful for applications whose value depends on continuously syncing user data. Google Drive and Notion are described as instant-sync sources, while OAuth sources can also sync every four hours and web crawlers use scheduled recrawling. [Connectors overview](https://supermemory.ai/docs/memory-api/connectors/overview)

GhostCrab integrates through MCP, so the agent uses tools for memory and structure instead of calling a generic search endpoint. The public site describes GhostCrab as an MCP-friendly layer that lets existing agents work with structured project state on mindBrain Personal or Professional. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Key Design Insight

Supermemory's honest architectural bet is that most teams need a **memory API before they need a domain model**. They have unstructured inputs, fragmented tools, and personalization requirements. A universal context endpoint lowers the cost of giving agents continuity.

mindBrain's bet is the inverse: once an agent is responsible for real work, **remembering context is not enough**. The agent needs a typed map of the world it is operating in: state, rules, dependencies, blockers, and compact projections. A universal memory API can retrieve what was said; a modeled domain can tell the agent what is true, what is pending, what is blocked, and what must happen next.

***

## What MindBrain Is

mindBrain is the structured storage layer underneath GhostCrab. It is available as mindBrain Personal on SQLite and mindBrain Professional on PostgreSQL, with GhostCrab exposing the agent-facing MCP layer. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

Its core abstraction is not a memory item. It is a navigable domain: entities, facets, directed graph relations, schemas, ontologies, and projections. The agent still reasons and converses, but GhostCrab gives it a structured world to operate in. [GhostCrab home](https://www.ghostcrab.be/)

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

## Why Try MindBrain First

Supermemory is attractive when the immediate need is "give my app memory quickly." mindBrain is the better first test when the application has several domains that must stay distinct but query together. A customer, an invoice, an email, a policy, a meeting, a project phase, and an API endpoint should not all be reduced to context snippets.

mindBrain can keep multiple ontologies inside one workspace and connect them through meta-ontologies. That makes it possible to ask cross-silo questions over ERP, CRM, PM, HR, legal, email, and knowledge data without forcing every record into one generic memory schema. The agent is not only recalling; it is navigating a structured operating environment.

MindBrain DDL is **Domain Definition Language**. It defines the meaning of objects, the facet dimensions that make them sortable, the graph relations that make them traversable, and the projections that make them usable by agents. Those projections can drive real-time dashboards, kanban boards, work queues, and graph views of project state.

The deterministic facet layer is the buying argument. If a project has 10,000 MCP endpoints across 20 active servers, a universal memory API may retrieve relevant descriptions. mindBrain should identify the four endpoints needed to send an email and schedule a meeting in milliseconds, without spending the model's context budget on search. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: MindBrain vs Supermemory

| Dimension | Supermemory | mindBrain |
|---|---|---|
| Core abstraction | Memory and context API | Structured agentic database |
| Primary use case | Ingest heterogeneous context and retrieve relevant memories | Model domain state, dependencies, and working context |
| Input model | Text, chats, files, URLs, documents, connector data | Typed entities, facets, graph edges, projections |
| Schema enforcement | Light API schema plus metadata conventions | Explicit schemas, typed ontologies, directed relations |
| Retrieval | Hybrid memories + chunks, filters, optional rerank | Facet filtering, graph traversal, projection packing |
| Graph role | Semantic understanding graph around entities, according to docs | Domain graph for blockers, dependencies, validation, prerequisites |
| Lifecycle behavior | Content updates via `customId`, profile evolution, connector sync | State transitions, durable project state, projections |
| Agent interface | API and SDK calls | MCP tools over mindBrain |
| Best fit | Personalization, product memory, connector-backed context | Operational domains where agents must act within structure |
| Weak fit | Deterministic workflow state and typed dependency management | Generic "store anything and search it later" ingestion |

***

## The Structural Difference in One Sentence

Supermemory is the better fit when the problem is **make all my context searchable and useful to an agent**.

mindBrain is the better fit when the problem is **make a domain structured enough that an agent can navigate, constrain, and act inside it**.
