---
title: GBrain vs Mem0 vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - gbrain
  - mem0
  - ai-memory
---

## The Structural Difference in One Sentence

GBrain is a self-wiring personal knowledge graph: its intelligence lives in entity pages, backlinks, timelines, and maintenance routines around a personal corpus. [GBrain GitHub](https://github.com/garrytan/gbrain)

Mem0 is an agent memory layer: its intelligence lives in extracting, updating, and retrieving memories through a compact API that agents can call from products and frameworks. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart)

MindBrain is a structured agentic database: its intelligence lives in schema enforcement, typed ontologies, facets, directed graphs, and precomputed projections that cost zero inference at query time. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## What GBrain Is

[GBrain](https://github.com/garrytan/gbrain) is an open-source personal knowledge graph and MCP server by Garry Tan. Its public repository frames it as a "memory layer for AI agents" with installable integrations and agent-facing tools. [GBrain GitHub](https://github.com/garrytan/gbrain)

The important word is personal. GBrain is not primarily a generic database abstraction. It is a disciplined memory environment around people, companies, events, concepts, and source-backed pages. Its public documentation emphasizes a knowledge-graph workflow, MCP access, and local-first setup. [GBrain GitHub](https://github.com/garrytan/gbrain)

Public information is strongest on the product shape and repository-level architecture. Claims about any individual private GBrain deployment, corpus size, or internal operating cadence should be treated as deployment-specific unless the repository or maintainer documentation states them directly.

***

## What Mem0 Is

[Mem0](https://mem0.ai/) is a memory infrastructure layer for AI applications. Its open-source docs center on two operations: add memories from messages or text, then search memories later with structured filters such as a user scope. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart)

Mem0 is available as open source and as a hosted platform. The public docs show Python and TypeScript SDKs, self-hosting options, hosted platform usage, and framework integrations. [Mem0 OSS overview](https://docs.mem0.ai/open-source/overview)

Architecturally, Mem0 is closer to a memory API than a domain model. It is designed to be adopted quickly inside an agent or application: when a user says something durable, call `add`; when the agent needs context, call `search`. The docs also describe graph memory features, entity extraction, entity relationships, and entity-centric retrieval, but the managed service and open-source package expose different levels of internal detail. [Mem0 graph memory](https://docs.mem0.ai/open-source/graph_memory/overview)

***

## The Core Problem They Solve

GBrain and Mem0 both start from the same agent failure: ordinary LLM sessions do not persist enough useful structure. Chat history preserves dialogue, but not durable facts, changing relationships, or stable user preferences.

GBrain solves this by making the memory corpus graph-shaped. It tries to turn lived context into entity pages and relationship-aware recall, so an agent can ask about a person, company, or event without rediscovering the whole context. [GBrain GitHub](https://github.com/garrytan/gbrain)

Mem0 solves it by making memory easy to add to any agent. The developer does not have to design a full ontology first. The application writes memories, and later retrieval can be scoped with filters such as the user identifier shown in the quickstart. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart)

MindBrain solves a different layer of the same problem. It assumes the agent needs to navigate not only memories about a user, but a typed operational domain: tasks, states, procedures, blockers, compliance rules, source records, owners, and dependencies. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Architecture

The three systems sit at different layers:

```
GBrain
Agent / MCP client
        |
GBrain MCP tools
        |
Personal graph memory
        |
Entity pages, links, sources, search indexes

Mem0
Agent / app / framework
        |
Mem0 SDK or API
        |
Memory extraction + update pipeline
        |
Vector, metadata, and optional graph-backed retrieval

MindBrain
Agent / Codex / Claude / OpenClaw / MCP client
        |
GhostCrab MCP
        |
Facets + directed graph + projections
        |
Typed ontology over SQLite or PostgreSQL
```

GBrain's architecture is opinionated around a personal graph and MCP access. The public repo positions it as a local memory server that agents can call directly. [GBrain GitHub](https://github.com/garrytan/gbrain)

Mem0's architecture is deliberately product-embeddable. The quickstart shows a small developer surface: initialize a memory client, add messages, and search later with a user scope. That is the right design for teams adding memory to an existing application. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart)

MindBrain's architecture is database-first. GhostCrab exposes a structured model to the agent: facets for filtering, graph edges for dependencies, and projections for compact working context. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Memory Model

GBrain's memory model is entity-centered. Its natural unit is a page or node about a person, company, event, concept, or other named thing. That page can accumulate source-backed facts and links to other pages. [GBrain GitHub](https://github.com/garrytan/gbrain)

Mem0's memory model is event-to-memory. The input is usually a conversation message or text payload; Mem0 turns that into memory records and later retrieves them for the right user or agent context. The docs show memory writes with `messages` plus scoping fields, then search queries against the same scope. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart)

MindBrain's model is ontology-to-state. The unit is not just a remembered fact, but a typed record inside a modeled domain:

```text
entity
  id
  type: task | account | procedure | document | constraint | event | ...
  facets: owner, status, priority, workspace, country, phase, ...
  state: typed lifecycle value
  source: canonical evidence

relation
  source_entity
  target_entity
  label: BLOCKS | REQUIRES | VALIDATES | DEPENDS_ON | OWNS | ...

projection
  FACT | GOAL | STEP | CONSTRAINT
  ranked for the current agent task
```

That schema-first posture matters. GBrain and Mem0 can remember useful things without a complete domain model. MindBrain is strongest when the agent must work inside a domain whose states and dependencies matter.

***

## Signature Mechanism

GBrain's signature mechanism is the self-wiring personal graph. The agent's memory improves when new information is attached to the right entity pages and connected through the right relationships. Its public positioning is close to a personal operating memory for agents. [GBrain GitHub](https://github.com/garrytan/gbrain)

Mem0's signature mechanism is memory extraction and update behind a simple API. Its docs show `add` calls that accept conversation messages, then later `search` calls that retrieve relevant memories for the same user or context. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart)

Mem0's graph memory documentation adds another layer: entities and relationships can be extracted so retrieval can use relationship-aware context, not only vector similarity. The exact internals differ between open-source and hosted paths, and the public docs do not expose every production implementation detail. [Mem0 graph memory](https://docs.mem0.ai/open-source/graph_memory/overview)

MindBrain's signature mechanism is projection. It does not ask the agent to load the whole graph or replay all memory. It precomputes compact working context from modeled facts, goals, steps, and constraints so the agent gets the relevant operational slice at query time. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Search / Retrieval / Reasoning Path

GBrain retrieval is graph-aware personal search. The agent is expected to find an entity, follow links, inspect source-backed context, and use the graph as memory scaffolding. [GBrain GitHub](https://github.com/garrytan/gbrain)

Mem0 retrieval is memory search. The developer asks for relevant memories by query and scope. The docs demonstrate search against a `user_id`; platform and graph documentation describe richer retrieval paths around entity relationships and filters. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart) [Mem0 graph memory](https://docs.mem0.ai/open-source/graph_memory/overview)

MindBrain retrieval is structured navigation:

1. Facets narrow the domain slice: status, owner, phase, product, workspace, country.
2. Directed graph edges expose dependency order: `A BLOCKS B` is not the same as `B BLOCKS A`.
3. Projections package the current working context into a small task-specific surface.

This is why MindBrain is less like "agent memory" and more like "agent-readable operational state." [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Agent Integration

GBrain integrates through MCP, which makes it a natural companion for MCP-capable coding agents, local assistants, and personal automation stacks. [GBrain GitHub](https://github.com/garrytan/gbrain)

Mem0 integrates through SDKs, APIs, and framework adapters. Its docs include direct Python and JavaScript usage, with a product surface that fits application teams building memory into agents or chat products. [Mem0 Python quickstart](https://docs.mem0.ai/open-source/python-quickstart)

MindBrain integrates through GhostCrab MCP. The agent does not just ask for text memories; it can query modeled state, traverse typed dependencies, inspect workspace semantics, and request a compact projection for the current task. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Key Design Insight

GBrain, Mem0, and MindBrain are not three versions of the same product. They answer three different structural questions.

GBrain asks: how can one person's accumulated context become a navigable graph for their agents?

Mem0 asks: how can any AI app get durable memory without building a memory system from scratch?

MindBrain asks: how can an agent operate inside a typed domain where state, constraints, dependencies, and projections must be deterministic?

That is the real axis. GBrain is strongest when personal context is the corpus. Mem0 is strongest when product memory must be added quickly. MindBrain is strongest when the agent needs a database-enforced model of work.

***

## What MindBrain Is

MindBrain is a structured agentic database exposed through GhostCrab MCP. It models a domain as facets, typed graph relations, and projections rather than treating memory as only retrieved text. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

Facets answer "which records are in scope?" Graphs answer "what depends on what?" Projections answer "what compact context should the agent use right now?" Together, they move memory from recall into operational navigation.

MindBrain is therefore not a replacement for every GBrain or Mem0 use case. A personal graph can remain the right interface for a founder, investor, or researcher. A memory API can remain the right choice for a SaaS agent that needs user preferences and conversation continuity. MindBrain becomes the better fit when a domain has rules, lifecycle state, and dependency order that should not be reconstructed by the model on every turn.

## Why Try MindBrain First

The strongest reason to test MindBrain before a memory API is that many "memory" problems are really ontology problems. A customer record, an invoice, an email, a legal clause, a project task, a pull request, and a meeting note should not all become the same kind of remembered snippet. They belong to different ontologies with different states, dimensions, owners, and graph relations.

MindBrain can keep those ontologies side by side inside one workspace, then introduce meta-ontologies that connect them. That is what unlocks queries that are structurally awkward for GBrain or Mem0: "show open project blockers owned by people with cold CRM warmth and unresolved legal constraints", or "find SEC risk factors that contradict a sales note attached to an active deal." The value is not just better recall. It is access to relationships that normally live across ERP, CRM, project management, HR, email, legal, and finance silos.

MindBrain DDL, or **Domain Definition Language**, is the lever. SQL DDL says how data is stored physically. MindBrain DDL says what things mean and how they relate, so `pg_facets`, `pg_dgraph`, and projections can give the agent a deterministic operating surface. The same DDL can feed a dashboard, a kanban board, a work queue, or a graph projection of live project state: Project A is in phase B, task C is tied to PR 123, and Project B is blocked in phase D.

This is also why the performance story matters. Facet dimensions let MindBrain reduce huge search spaces in milliseconds instead of asking the model to rediscover structure from prose. In a workspace with 10,000 MCP endpoints across 20 servers, the useful behavior is not "remember that email exists"; it is "select the four endpoints needed to send a message and book a meeting" without spending a large token budget on tool browsing. The Professional tier is designed for bitmap-scale tables of roughly 4.3 billion addressable objects per table. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: GBrain vs Mem0 vs MindBrain

| Dimension | GBrain | Mem0 | MindBrain |
|---|---|---|---|
| Core abstraction | Personal knowledge graph | Memory API / memory layer | Structured agentic database |
| Primary use case | Persistent personal graph for agents | Add long-term memory to AI apps | Operate over typed domain state |
| Natural unit | Entity page or graph node | Memory record extracted from interaction | Typed entity, relation, projection |
| Schema posture | Graph discipline and conventions | Flexible memory records with scopes and metadata | Explicit ontology and lifecycle semantics |
| Retrieval | Entity and graph-aware recall | Search memories by query and scope; graph memory where configured | Facet filtering, graph traversal, projection packing |
| Graph support | Central to the product shape | Available through graph memory features | Typed directed graph is part of the core model |
| Temporal behavior | Timeline/source accumulation where modeled | Memory updates and scoped recall | Lifecycle states, current-state records, and projections |
| Agent interface | MCP server | SDKs, APIs, framework integrations | GhostCrab MCP tools |
| Best fit | Personal operating memory | Product memory and user personalization | Project, workflow, CRM, compliance, software delivery, and knowledge-base state |
| Weak fit | Generic multi-tenant product memory without custom discipline | Deterministic domain operations with strict dependency semantics | Lightweight preference memory where a simple API is enough |

***

## The Structural Difference in One Sentence

GBrain turns personal context into a graph, Mem0 turns application interactions into retrievable memories, and MindBrain turns a domain into a typed operational surface an agent can navigate without re-inferring the structure each time.
