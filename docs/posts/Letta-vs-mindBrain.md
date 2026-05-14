---
title: Letta vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - letta
  - ai-agents
  - ai-memory
---

## The Structural Difference in One Sentence

Letta is an agent operating system for stateful agents: its intelligence lives in agents managing memory blocks, context, tools, and long-running state through an explicit runtime. [Letta docs](https://docs.letta.com/guides/agents/memory)

MindBrain is a database-enforced structure for agents: its intelligence lives in typed ontologies, facets, directed graph relations, and projections that constrain what an agent can see and do. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

![[letta-vs-mindbrain.png]]

***

## What Letta Is

[Letta](https://www.letta.com/) is an open-source framework and platform for building stateful LLM agents. Its documentation frames agents as persistent objects with model configuration, tools, memory, and message history. [Letta agents docs](https://docs.letta.com/guides/agents/overview)

Letta's distinctive idea is that the agent is not a stateless prompt around an LLM call. The agent has durable state and can manage its own memory through tool calls. The docs describe memory blocks, core memory, archival memory, and agent tools for editing memory. [Letta memory docs](https://docs.letta.com/guides/agents/memory)

This places Letta closer to an agent runtime or operating system than to a simple memory API. It gives developers an environment where memory is part of the agent's behavior, not just a retrieval sidecar.

***

## The Core Problem It Solves

Most agents are stateless unless the developer wires state around them. The model sees a prompt, emits an answer, and loses the operating context unless the application saves it somewhere.

Letta solves this by making agents stateful. The agent can have persistent memory blocks, tool access, and a structured conversation history managed by the Letta runtime. Its memory docs distinguish editable memory blocks from archival memory and describe how agents can update memory through tools. [Letta memory docs](https://docs.letta.com/guides/agents/memory)

MindBrain solves a different failure mode: even a stateful agent can damage work if the domain model is implicit. If the agent controls memory freely, it still needs to know which states are valid, which dependencies are directional, which facts are canonical, and which context is the compact current working set. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Architecture

Letta's architecture is agent-first:

```text
Developer app or API client
        |
        v
Letta server / runtime
        |
        v
Stateful agent
  - model configuration
  - tools
  - memory blocks
  - messages
  - archival memory
        |
        v
Agent decides when to read, write, or update memory
```

The docs expose this directly: agents have memory, and memory is composed of blocks that can be attached and edited. [Letta memory docs](https://docs.letta.com/guides/agents/memory)

MindBrain's architecture is domain-first:

```text
Agent or coding assistant
        |
        v
GhostCrab MCP tools
        |
        v
MindBrain model
  - facets for filtering
  - typed graph relations
  - projections for compact context
  - workspace semantics and ontology
        |
        v
Database-enforced domain state
```

The difference is where control sits. Letta gives the agent a runtime for maintaining itself. MindBrain gives the agent a structured domain surface that can be validated and queried independently of the agent's self-management.

***

## Memory Model

Letta's memory model is built around blocks and agent-controlled updates. The docs describe memory blocks as labeled pieces of context that can be attached to agents, and they distinguish core memory from archival memory for longer-term storage. [Letta memory docs](https://docs.letta.com/guides/agents/memory)

A simplified Letta shape:

```text
agent
  id
  model
  tools
  memory blocks
  message history

memory block
  label
  value
  description
  limit

archival memory
  long-term stored context
```

Letta's bet is that the agent should have agency over memory. It can decide what to keep, revise, recall, or archive according to the tools and policies the developer gives it.

MindBrain's model is stricter:

```text
workspace
  ontology
  tables / schemas / facets

entity
  type
  lifecycle state
  structured facets
  canonical source

relation
  typed directed edge
  semantic label

projection
  compact working context
  fact | goal | step | constraint
```

MindBrain's bet is that agents should not be trusted to invent the domain model while acting inside it. The database should carry the structure, and the agent should query or update that structure through constrained tools. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Signature Mechanism: Agent-Controlled Memory

Letta's signature mechanism is agent-controlled memory. The agent is not merely given retrieved context; it can manage memory through tools, including editing memory blocks that shape future behavior. [Letta memory docs](https://docs.letta.com/guides/agents/memory)

That makes Letta powerful for long-running assistants. A support agent can retain user preferences. A research agent can preserve its task framing. A coding agent can remember project notes. The runtime gives the agent continuity.

The tradeoff is that memory correctness depends on the agent's behavior and the surrounding tool policy. If the agent writes a vague memory, overgeneralizes a preference, or fails to preserve provenance, the runtime will persist that state unless the application adds guardrails.

MindBrain's signature mechanism is database-enforced structure. A blocker is a typed relation, not a sentence the agent happened to write. A workflow status is a lifecycle value, not a paragraph in memory. A projection is generated from current modeled state, not assembled only from the agent's private notes.

***

## Search / Retrieval / Reasoning Path

Letta retrieval is agent-context retrieval. The agent has a context window, memory blocks, archival memory, and tools that let it manage what should enter or leave its active state. [Letta memory docs](https://docs.letta.com/guides/agents/memory)

MindBrain retrieval is domain-state retrieval:

```text
1. Use ghostcrab_count or ghostcrab_facet_tree to inspect the workspace shape.
2. Use ghostcrab_search to find the relevant facet-indexed subset.
3. Use ghostcrab_traverse to follow dependencies, blockers, and validation edges.
4. Use ghostcrab_coverage to check whether the model is complete enough.
5. Use ghostcrab_projection_get or ghostcrab_pack for the smallest useful working context.
6. Keep evidence and state outside the model's private memory.
```

This distinction becomes important in operational systems. Letta can remember that a user likes concise updates. MindBrain can determine that a deployment cannot proceed because a required approval edge is missing, the release checklist is in `blocking` state, and the compliance projection has an unresolved constraint.

***

## Agent Integration

Letta provides an agent platform, SDK/API surface, and runtime concepts for creating and managing persistent agents. Its docs focus on agents, memory, tools, and runtime behavior. [Letta agents docs](https://docs.letta.com/guides/agents/overview)

MindBrain provides GhostCrab MCP tools that can be used by external agents, including coding assistants and agent runtimes. The agent is not replaced by MindBrain; it is given a structured database surface to query and update. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

These tools can complement each other. A Letta agent could own its persona, dialogue state, and tool policy while using MindBrain as the durable structured state for a project or domain. The comparison is therefore not "runtime vs runtime." It is agent-managed memory vs database-enforced domain structure.

***

## Key Design Insight

Letta trusts the agent as an active memory manager. That is the right bet when the agent itself is the product: a persistent assistant, researcher, operator, or worker with continuity across sessions.

MindBrain trusts the domain model more than the agent's private memory. That is the right bet when the work has rules: onboarding flows, compliance checks, project dependencies, incident response, CRM state, software delivery, or any setting where "what is true" and "what is allowed next" should be queryable outside the model.

The philosophical split is sharp. Letta makes the agent more stateful. MindBrain makes the world the agent acts on more structured.

***

## What MindBrain Is

MindBrain is a structured agentic database exposed through GhostCrab MCP. Its public architecture describes facets, graphs, and projections as the core primitives. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

Facets let the agent find the right slice. Directed graph edges let it follow dependencies, blockers, and semantic relations. Projections give it compact current context so it does not need to load the entire domain into the context window.

MindBrain is strongest when the memory question is really a state question:

```text
What is blocked?
What is required?
What changed state?
What evidence validates this?
What should happen next?
Which ontology does this record belong to?
```

Those questions are awkward if everything is an editable memory block. They become straightforward when the structure is in the database.

***

## MindBrain Workflow Proof

MindBrain is not just a policy that tells agents to be careful. The workflow moves structure out of the agent's private memory and into an inspectable model. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

```text
1. Model the domain
   ghostcrab_modeling_guidance or ghostcrab_loadout_suggest
   -> entity types, relation labels, facets, lifecycle states, projection needs

2. Register or verify the model
   ghostcrab_schema_list / ghostcrab_schema_inspect
   ontology registration for stable entities and relations
   ghostcrab_ddl_propose where table-backed structures are needed
   ghostcrab_workspace_export_model to inspect workspace semantics

3. Import or qualify data
   MindBrain Studio or an import path maps project notes, tickets,
   tool catalogs, emails, documents, or runtime events into typed records,
   chunks, entities, relations, facets, evidence, and projection signals.

4. Query after import
   ghostcrab_count / ghostcrab_facet_tree for shape-of-data questions
   ghostcrab_search for facet-indexed records
   ghostcrab_traverse for blockers, dependencies, and validation paths
   ghostcrab_coverage for missing domain coverage
   ghostcrab_projection_get / ghostcrab_pack for agent-ready context
```

A Letta agent can remember a project note because the runtime gives it durable state. A MindBrain-backed agent can import that note as evidence, attach it to a typed project, mark the relevant requirement as `blocking`, link it to the missing approval, and expose a projection that tells any compatible agent what to do next.

This is why the two systems can complement each other. Letta can own the agent's memory, persona, and long-running behavior. MindBrain can own the external operating surface: the shared project state that should be queryable even if the acting agent changes.

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

MindBrain asks for more up-front modeling than Letta memory blocks. A team has to decide the stable nouns and verbs of the domain: entities, lifecycle states, relation labels, facet dimensions, ownership rules, evidence rules, and projection shapes.

That work pays back when the same state must be shared by multiple agents, audited, filtered, traversed, and projected into dashboards or work queues. The database can say "this release is blocked by an unapproved compliance requirement" without depending on one agent's private memory summary.

Taxonomy work is worth it when the domain will be queried repeatedly, the agent must act rather than merely recall, valid transitions matter, evidence and owners matter, or coverage checks are needed before autonomous work.

It is probably not worth it when the product is mainly a persistent assistant, researcher, or operator whose job is to manage its own context. In that case, Letta's agent-controlled memory is the more direct abstraction.

***

## Why Try MindBrain First

Letta is a strong first test when the product thesis is that agents should manage their own memory over time. MindBrain is the stronger first test when the product thesis is that agents should operate over shared domain structure. In that setting, autonomy is not enough; the agent needs to know which ontology owns a fact, which state transition is valid, and which relation blocks the next action.

MindBrain can keep multiple ontologies in one workspace: CRM, ERP, project delivery, HR, legal, software, finance, knowledge, or any custom domain. Meta-ontologies then connect them without erasing their local meaning. That is how an agent can join a warm CRM contact, an overdue invoice, a blocked project phase, and a legal constraint in one deterministic query.

MindBrain DDL means **Domain Definition Language**. It is the semantic blueprint for the agent's world: entity types, lifecycle states, facet dimensions, graph relations, and projections. A project-management DDL can be projected into a concrete audit, software delivery, web build, or credit-scoring workflow that agent teams can execute and monitor.

The practical advantage appears when the agent has too many possible things to inspect. With 10,000 MCP endpoints across 20 active servers, a memory block can remind the agent that email and calendar tools exist. Facets and graph relations can select the four endpoints needed for the actual email-and-meeting workflow in milliseconds, without consuming a huge context budget. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: MindBrain vs Letta

| Dimension | Letta | MindBrain |
|---|---|---|
| Core abstraction | Stateful agent runtime | Structured agentic database |
| Primary use case | Persistent agents that manage memory and tools | Agents operating over typed domain state |
| Natural unit | Agent, memory block, message, archival memory | Entity, facet, typed relation, projection |
| Control model | Agent can read/write/update memory through tools | Database schema constrains domain structure |
| Schema enforcement | Defined by agent design, tools, and runtime policy | Explicit ontology, facets, and relation semantics |
| Retrieval | Active context, memory blocks, archival memory | Facet search, graph traversal, projection packing |
| Graph support | Not the primary public abstraction | Core primitive for typed dependencies |
| Temporal/lifecycle behavior | Agent state and message history persist | Lifecycle state and current-state records are modeled domain data |
| Agent interface | Letta platform, API, SDK, tools | GhostCrab MCP tools |
| Best fit | Persistent assistants and autonomous agents | Operational domains with state, rules, blockers, and procedures |
| Weak fit | Deterministic domain governance without additional structure | Agent persona and self-managed memory runtime |

***

## Public Information Limits

Letta's public docs are strong on agent concepts, memory blocks, tools, and runtime usage. They are less specific about every production deployment detail, database layout, or the exact persistence internals of managed Letta Cloud. This article therefore compares the documented model rather than assuming undocumented internals. [Letta memory docs](https://docs.letta.com/guides/agents/memory)

MindBrain's public material is strongest on the GhostCrab architecture and its core primitives. Implementation details can differ between Personal and Professional deployments, so the comparison focuses on the stable structural claim: facets, graph, projections, and typed domain modeling. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## The Structural Difference in One Sentence

Letta gives an agent durable self-management; MindBrain gives an agent a durable structured world to act on.
