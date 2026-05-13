---
title: Zep vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - zep
  - graphiti
  - ai-memory
---

## The Structural Difference in One Sentence

Zep is a temporal knowledge graph memory system: its intelligence lives in extracting facts from sessions, preserving how those facts change over time, and retrieving temporally relevant context for agents. [Zep docs](https://help.getzep.com/graphiti/getting-started/overview)

MindBrain is a typed ontology plus projection engine: its intelligence lives in schema enforcement, explicit relations, and precomputed working context over a modeled domain. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## What Zep Is

[Zep](https://www.getzep.com/) is an agent memory platform built around a temporal knowledge graph. Its open-source graph layer, Graphiti, is documented as a framework for building and querying temporally aware knowledge graphs from changing information. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

Graphiti's public documentation emphasizes three ideas: episodes as incoming data, entities and relationships as extracted graph objects, and time as a first-class part of the graph. It is not merely "store this chat transcript and run vector search later." Its core claim is that facts change, and memory systems should preserve that change rather than flatten it away. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

The managed Zep platform and the open Graphiti project are related but not identical public surfaces. Zep exposes an agent memory product; Graphiti exposes a graph construction and retrieval framework. Some production service internals are not fully public, so this comparison sticks to the documented architecture and APIs.

***

## The Core Problem It Solves

Agent memory breaks when the world changes.

A user can change jobs. A customer can move from trial to paid. A policy can be revised. A bug can be fixed, reopened, and fixed again. Flat RAG tends to retrieve semantically similar text even if it is stale. Simple long-term memory can remember a fact but lose the moment when it stopped being true.

Zep solves this with temporal graph memory. Graphiti's docs describe a temporally aware graph that can track episodes, entities, relationships, and changes over time. That is directly useful for agents that need current facts without erasing historical evidence. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

MindBrain solves a neighboring but different problem: agents need to operate inside explicit domain structure. If the task is "what changed about this customer last week?", Zep's temporal graph is a natural fit. If the task is "which compliance steps are blocked because this document is missing a validated owner?", MindBrain's typed ontology and projections are the stronger abstraction. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Architecture

Zep's public graph architecture can be understood as a temporal extraction and retrieval pipeline:

```text
Conversation, document, event, or other episode
        |
        v
Graphiti ingestion
        |
        v
Entity and relationship extraction
        |
        v
Temporal knowledge graph
        |
        v
Hybrid / graph-aware retrieval for agent context
```

The important architectural decision is that time is attached to knowledge, not only to raw logs. Graphiti's docs describe temporal edges and the ability to model how facts evolve as new episodes arrive. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

MindBrain's architecture starts from a different assumption:

```text
Modeled workspace or domain
        |
        v
Typed ontology: entities, states, relations, constraints
        |
        v
Facet indexes + directed graph
        |
        v
Precomputed projections
        |
        v
Agent working context through GhostCrab MCP
```

MindBrain does not make time the central abstraction. Time can be a facet, a lifecycle transition, an event, or evidence provenance. The center is the domain model: what exists, what state it is in, what it depends on, and what compact view the agent should use now. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Memory Model

Zep's memory model is graph-temporal. Graphiti documentation describes episodes as incoming observations that create or update entities and edges. Those edges can carry temporal information, which lets the graph reason about facts that were true during different intervals. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

A simplified Zep/Graphiti shape looks like this:

```text
episode
  source text or message
  timestamp
  group / context

entity
  name
  type
  attributes

edge
  source entity
  target entity
  relationship
  valid time / observed time
  supporting episode
```

MindBrain's model is ontology-operational:

```text
entity
  type: task | account | requirement | incident | procedure | document
  facets: status, owner, phase, priority, workspace, jurisdiction
  lifecycle state
  canonical source

relation
  label: REQUIRES | BLOCKS | VALIDATES | DEPENDS_ON | OWNS
  direction
  weight or confidence

projection
  FACT | GOAL | STEP | CONSTRAINT
  status: active | resolved | blocking | expired
```

The difference is not "graph vs no graph." Both systems use graph ideas. The difference is what the graph is for. Zep's graph is primarily a memory of changing facts. MindBrain's graph is primarily an operational map of a typed domain.

***

## Signature Mechanism: Temporal Knowledge Graph

Zep's signature mechanism is temporal knowledge graph memory. Graphiti explicitly positions itself around dynamic data and temporal edges rather than static document indexing. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

This is a strong design for agents that need to answer questions like:

```text
What does the user currently prefer?
When did this preference change?
Which account relationship is current?
What was true when this support ticket was opened?
Which fact superseded an older fact?
```

That is more precise than ordinary vector recall. A vector store can retrieve an old paragraph that sounds relevant. A temporal graph can represent that the paragraph was once true and later superseded.

MindBrain's signature mechanism is projection. It assumes the domain model is already explicit enough that the agent should not assemble a working state by traversing raw evidence each time. The system precomputes compact task context from facts, goals, steps, and constraints. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Search / Retrieval / Reasoning Path

Zep retrieval is time-aware memory retrieval. The agent asks for context, and the system can use graph structure plus temporal information to avoid returning stale or disconnected facts. The Graphiti docs describe hybrid search over graph data and support for dynamic, changing information. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

MindBrain retrieval is deterministic domain navigation:

```text
1. Count or facet-tree the imported workspace shape.
2. Search facet-indexed records by status, owner, phase, jurisdiction, or risk.
3. Traverse typed directed edges such as BLOCKS, REQUIRES, OWNS, or VALIDATES.
4. Check coverage and pack a projection for the current task.
5. Return compact context with provenance.
```

The reasoning path is therefore different. Zep improves recall by making memory historically aware. MindBrain improves action by making the work surface structurally explicit.

Example:

```text
Question: "What should the agent do next on this onboarding account?"

Zep:
  Retrieve recent and current facts about the account,
  its user, and prior conversations.

MindBrain:
  Find active onboarding account,
  follow BLOCKS / REQUIRES relations,
  inspect missing validated documents,
  return the next STEP projection.
```

Both answers may be useful. They are not interchangeable.

***

## Agent Integration

Zep is built for agent memory integration. The product is an API/service, and Graphiti is available as an open-source graph memory framework. Public docs show a developer-facing architecture for adding episodes and querying graph memory. [Graphiti docs](https://help.getzep.com/graphiti/getting-started/overview)

MindBrain is exposed through GhostCrab MCP. The agent interface is not only "remember this" or "search memory." It includes tools for workspace modeling, facet search, graph traversal, projections, ontology inspection, and current-state updates. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

This changes the operational role of the agent. With Zep, the agent gets a better memory of what has happened and what is currently true. With MindBrain, the agent gets a structured map of what the domain permits, requires, blocks, or prioritizes.

***

## Key Design Insight

Zep makes a very good architectural bet: memory should be temporal because reality is temporal. A memory system that cannot distinguish current facts from superseded facts will eventually mislead the agent.

MindBrain makes a different bet: work is typed. A domain is not just a stream of changing facts; it has roles, allowed states, dependencies, procedures, constraints, and projections. If those are left implicit, the agent has to infer the operating model on every turn.

The clean comparison is therefore not "Zep has a graph and MindBrain has a graph." It is temporal memory graph vs typed operational ontology.

***

## What MindBrain Is

MindBrain is a structured agentic database for making domains navigable by agents. Its public architecture is organized around three capabilities: facets, graphs, and projections. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

Facets let agents filter large domains quickly by structured dimensions. Graphs let agents follow typed dependencies and blockers. Projections turn the relevant slice into compact working context so the model does not have to ingest the whole domain.

This makes MindBrain especially suited to workflow tracking, project delivery, software delivery, CRM state, compliance procedures, incident response, and knowledge-base operations. In these settings, "what changed?" matters, but "what is allowed, blocked, required, or next?" matters just as much.

***

## MindBrain Workflow Proof

A fair comparison to Zep has to show what happens after data is imported, not only that MindBrain is "schema-first." The MindBrain path is model, qualify, query. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

```text
1. Model the domain
   ghostcrab_modeling_guidance or ghostcrab_loadout_suggest
   -> entity types, relation labels, facets, lifecycle states, coverage questions

2. Register or verify the model
   ghostcrab_schema_list / ghostcrab_schema_inspect
   ontology registration where needed
   ghostcrab_ddl_propose for table-backed workspace structures
   ghostcrab_workspace_export_model to inspect the semantic contract

3. Import or qualify data
   MindBrain Studio or an import path maps episodes, documents, tickets,
   messages, or API records into typed records, chunks, entities,
   relations, facet values, evidence links, and projection signals.

4. Query after import
   ghostcrab_count / ghostcrab_facet_tree to understand the dataset shape
   ghostcrab_search for facet-indexed records
   ghostcrab_traverse for typed dependencies and evidence paths
   ghostcrab_coverage for missing ontology coverage
   ghostcrab_projection_get / ghostcrab_pack for agent working context
```

Zep's ingestion path is strongest when incoming episodes change the graph of what is currently true. MindBrain's import path is strongest when source data must be qualified into an operating model before an agent acts: a document becomes evidence for a requirement, a customer event changes a lifecycle state, a conversation creates a blocker, and an imported edge says exactly which procedure validates the next step.

That distinction matters after import. In Zep, the agent asks memory for temporally relevant facts. In MindBrain, the agent can first ask for the count of active blocked accounts, then search only that facet slice, then traverse from an account to its missing evidence, then request a projection containing the next unblocked step.

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

## The Cost and Payoff of Taxonomy

MindBrain's taxonomic work has a cost: someone must decide which entity types, relation labels, lifecycle states, facet dimensions, and projection rules are stable enough to model. That is heavier than adding episodes to a temporal graph and letting extraction create candidate facts.

The payoff is deterministic reuse. Once imported data is qualified, the same model can drive dashboards, kanban boards, compliance checks, project queues, and agent context packs. The agent no longer has to infer whether a relation is a blocker, a dependency, evidence, ownership, or merely semantic proximity.

Taxonomy pays back when the domain is queried repeatedly, the data must drive action, states and owners matter, coverage gaps must be checked before autonomous work, or several domains need to stay distinct while still answering cross-domain questions.

It may not pay back when the job is only temporal recall: "what did the customer say before?", "which preference changed?", or "what was true last month?" For that class of memory, Zep's temporal graph is the cleaner first test.

***

## Why Try MindBrain First

Zep is compelling when temporal memory is the central requirement: facts change, and the agent needs to retrieve the right version. MindBrain should be tested first when the bigger requirement is cross-domain operation. The question is not only "what did we know then?" but "which ontology owns this fact, what does it block, what system does it connect to, and what projection should the agent use now?"

MindBrain can manage multiple ontologies in a single workspace and connect them through meta-ontologies. That gives agents a way to query across silos such as CRM, ERP, PM, HR, legal, email, SEC filings, and knowledge notes. Temporal facts remain useful evidence, but they become part of a wider typed model rather than the whole model.

MindBrain DDL is **Domain Definition Language**. SQL DDL defines physical storage; MindBrain DDL defines meaning, lifecycle states, facets, graph relations, and projections. A project-management ontology can be projected into a specific project instance for an AI team; a compliance ontology can be projected into an audit dashboard; a deal ontology can be projected into a kanban pipeline.

The deterministic performance case is simple. If an agent has to choose among thousands of records or endpoints, facets and graph edges should narrow the candidate set in milliseconds. In a workspace with 10,000 MCP endpoints across 20 servers, the agent should find the four endpoints required for email and scheduling through structure, not by spending tokens over the whole tool surface. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: MindBrain vs Zep

| Dimension | Zep | MindBrain |
|---|---|---|
| Core abstraction | Temporal knowledge graph memory | Typed agentic database |
| Primary use case | Remember changing facts from conversations and episodes | Navigate structured operational state |
| Natural unit | Episode, entity, temporal edge | Typed entity, relation, projection |
| Schema posture | Extracted graph structure from incoming data | Explicit ontology and lifecycle model |
| Time model | Central abstraction; facts evolve over time | Represented through facets, events, states, provenance, or lifecycle transitions |
| Retrieval | Hybrid and graph-aware memory search | Facet filtering, typed graph traversal, projection packing |
| Graph support | Temporal knowledge graph | Directed ontology graph |
| Agent interface | Memory API / Graphiti framework | GhostCrab MCP tools |
| Best fit | Conversational agents, user memory, changing facts, customer context | Project state, workflow operations, typed dependencies, deterministic next actions |
| Weak fit | Domains needing strict schema enforcement before ingestion | Lightweight temporal recall without domain modeling |

***

## Query Catalog

Zep-style questions:

```text
What does this user currently prefer?
When did the account owner change?
Which fact superseded the old contract status?
What did we know about this customer before the escalation?
```

MindBrain-style questions:

```text
ghostcrab_count:
  How many active onboarding accounts are blocked by missing documents?

ghostcrab_search:
  Which high-priority incidents are active, owned by platform, and missing evidence?

ghostcrab_traverse:
  Which procedure validates this compliance requirement?

ghostcrab_coverage:
  Is the incident-response ontology complete enough for autonomous escalation?

ghostcrab_projection_get / ghostcrab_pack:
  What is the next unblocked step for this incident?
```

The first set is temporal memory. The second set is typed operations.

***

## The Structural Difference in One Sentence

Zep remembers how facts change over time; MindBrain models how a domain is structured so an agent can act inside it without rebuilding the operating logic from raw memory.
