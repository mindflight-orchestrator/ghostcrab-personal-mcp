---
title: Hindsight vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - hindsight
  - agent-memory
---

## The Structural Difference in One Sentence

Hindsight is a **learning-oriented agent memory system**: its intelligence lives in retaining facts, recalling them through multiple retrieval strategies, and reflecting over memory banks with missions, directives, observations, and mental models. [Hindsight docs](https://docs.hindsight.vectorize.io/)

mindBrain is a **structured agentic database**: its intelligence lives in typed domain state, facets, directed graph relations, and projections that make an operational world navigable without reconstructing it from memories each turn. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

![[hindsight-vs-mindbrain.png]]

***

## Evidence Limits

Public information on Hindsight is stronger than a teaser page but still thinner than a mature database product with stable internals. The comparison below uses Hindsight's official docs, its public GitHub README, its March 2026 MCP memory blog post, and the public arXiv paper. [Hindsight GitHub](https://github.com/vectorize-io/hindsight) [Hindsight MCP blog](https://hindsight.vectorize.io/blog/2026/03/04/mcp-agent-memory) [Hindsight paper](https://arxiv.org/abs/2512.12818)

The limits matter:

- Hindsight's benchmark claims are public, but they are largely from its own paper and project materials.
- The docs describe behavior and concepts clearly, but not every storage-level implementation detail is exposed.
- The product has both open-source and cloud-facing documentation surfaces, so deployment details may vary by version.

For that reason, this article compares the visible architecture and public contract, not hidden internals.

***

## What Hindsight Is

Hindsight is an agent memory system from Vectorize that aims to make agents learn over time, not merely recall chat history. Its docs describe three core operations: `retain` stores information in memory banks, `recall` searches memories through multiple strategies, and `reflect` reasons over memories using a bank's mission, directives, and disposition traits. [Hindsight docs](https://docs.hindsight.vectorize.io/)

The GitHub README frames Hindsight as an agent memory system for creating smarter agents that learn over time and provides client examples in Node.js and Python. [Hindsight GitHub](https://github.com/vectorize-io/hindsight) The March 2026 blog post presents it as an open-source MCP memory server with persistent structured memory, Docker deployment, and three operations: retain, recall, reflect. [Hindsight MCP blog](https://hindsight.vectorize.io/blog/2026/03/04/mcp-agent-memory)

Hindsight is not just "vector search with a nicer API." Its docs describe memory banks with stored memories, entity relationships, graph connections, missions, directives, disposition traits, and search indices. [Hindsight docs](https://docs.hindsight.vectorize.io/)

***

## The Core Problem It Solves

Agents forget between sessions. More subtly, they fail to learn from repeated interactions: user preferences, past decisions, project context, and observed patterns disappear unless they are copied back into the prompt. Hindsight is built to retain those facts, retrieve relevant memory, and synthesize what has been learned. [Hindsight MCP blog](https://hindsight.vectorize.io/blog/2026/03/04/mcp-agent-memory)

The public paper describes a broader research problem: many memory systems store snippets in vector or graph stores, but blur evidence and inference, struggle over long horizons, and provide limited support for explaining reasoning. Hindsight's proposed answer is a structured memory substrate with retain, recall, and reflect operations over multiple logical memory networks. [Hindsight paper](https://arxiv.org/abs/2512.12818)

mindBrain targets a different failure mode. It is not primarily trying to make an agent personally adaptive. It is trying to stop the agent from treating a real domain as a pile of prose. Projects, workflows, compliance processes, incidents, and sales pipelines have states, dependencies, blockers, owners, and rules. GhostCrab frames its role as giving agents a structured world to work in. [GhostCrab home](https://www.ghostcrab.be/)

***

## Architecture

Hindsight's public blog describes an MCP-connected stack:

```text
MCP Client
  Claude / Cursor / VS Code / agent runtime
    |
    v
Hindsight API
    |
    +-- Memory engine
    |     retain / recall / reflect
    |
    +-- Fact extraction + entity resolution
    |
    +-- Embeddings + cross-encoder reranking
    |
    +-- Knowledge graph traversal
    |
    v
PostgreSQL + pgvector
```

The same blog says recall uses semantic search, BM25 keyword matching, entity graph traversal, and temporal filtering in parallel, then reranks results with a cross-encoder. [Hindsight MCP blog](https://hindsight.vectorize.io/blog/2026/03/04/mcp-agent-memory)

The documentation adds the memory-bank layer:

```text
Memory Bank
  |
  +-- world facts
  +-- experience facts
  +-- observations
  +-- mental models
  +-- mission / directives / disposition traits
  +-- entity relationships and graph connections
```

Each memory bank is a dedicated memory space for an agent or context, with its own stored memories, graph connections, reasoning settings, and search indices. [Hindsight docs](https://docs.hindsight.vectorize.io/)

mindBrain's visible architecture is:

```text
Agent
  |
  v
GhostCrab MCP
  |
  +-- Facets: filter typed domain slices
  +-- Graphs: follow directed blockers and dependencies
  +-- Projections: pack compact working context
  |
  v
mindBrain
  Personal: SQLite
  Professional: PostgreSQL
```

The difference is that Hindsight's center is a memory bank; mindBrain's center is a modeled domain.

***

## Memory Model

Hindsight's docs name four memory levels:

```text
World Facts
  objective facts from external sources

Experience Facts
  the agent's own actions and interactions

Observations
  synthesized knowledge consolidated from facts

Mental Models
  curated, pre-computed summaries for common queries
```

During reasoning, the docs say Hindsight checks sources in priority order: mental models, observations, then raw facts. [Hindsight docs](https://docs.hindsight.vectorize.io/) Mental models are saved reflect responses that can be curated and reused for consistent answers. [Hindsight mental models](https://hindsight.vectorize.io/developer/api/mental-models)

The retain path extracts and categorizes memories automatically. Hindsight describes stored outputs as structured facts, unified entities, a knowledge graph with entity, temporal, semantic, and causal links, temporal grounding, and optional tags for filtering. [Hindsight retain docs](https://hindsight.vectorize.io/developer/retain)

mindBrain's model is less psychological and more operational:

```text
Entity
  customer, task, document, requirement, incident, procedure

Facet
  status, owner, phase, country, priority, role

Directed relation
  REQUIRES, BLOCKS, VALIDATES, DEPENDS_ON

Projection
  FACT, GOAL, STEP, CONSTRAINT
```

That makes mindBrain less of a "learning memory" and more of a domain runtime. It remembers, but its useful structure is not only accumulated experience; it is the typed model the agent navigates.

***

## Signature Mechanism

Hindsight's signature mechanism is **retain, recall, reflect**.

```text
retain
  store content, extract facts, resolve entities, update observations

recall
  retrieve structured facts through multi-strategy search

reflect
  reason over memories, observations, mental models, mission, directives
```

The `recall` API returns structured fact results rather than raw documents; result fields include text, type, context, metadata, tags, entities, and event timestamps. [Hindsight recall docs](https://hindsight.vectorize.io/developer/api/recall)

The `reflect` operation is where Hindsight becomes more than retrieval. It synthesizes information from memories and mental models, influenced by the memory bank's mission and disposition traits, and returns an answer with cited support. [Hindsight reflect docs](https://docs.hindsight.vectorize.io/reflect)

mindBrain's signature mechanism is **find, follow, pack**:

```text
find
  facet filter the domain

follow
  traverse directed dependencies, blockers, validations

pack
  generate compact projections for the current task
```

The distinction is subtle but important. Hindsight asks: "What has this agent learned, and how should it reason over that memory?" mindBrain asks: "What is the current state of this domain, and what structured context does the agent need to act?"

***

## Search / Retrieval / Reasoning Path

Hindsight recall runs multiple retrieval strategies in parallel: semantic similarity, BM25 keyword search, graph traversal, and temporal retrieval, then fuses and reranks the results into a ranked list. [Hindsight recall docs](https://hindsight.vectorize.io/developer/api/recall) The blog version adds that a cross-encoder performs reranking. [Hindsight MCP blog](https://hindsight.vectorize.io/blog/2026/03/04/mcp-agent-memory)

This makes Hindsight strong for questions like:

- "What does this user usually prefer?"
- "What did we learn from past interactions?"
- "How are Alice and Bob connected?"
- "What patterns have emerged over time?"

mindBrain's retrieval path is stronger for operational questions:

- "Which tasks are blocked by an unresolved dependency?"
- "Which procedures validate this state transition?"
- "Which documents are relevant to this phase and owner?"
- "What compact bundle of facts, goals, steps, and constraints should the agent use now?"

GhostCrab's architecture explicitly separates the need to find a subset, follow relationships, and pack compact working context. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Agent Integration

Hindsight has an MCP story and client SDKs. The public blog shows a Docker command that starts the API server, PostgreSQL-backed storage, local embedding models, and MCP endpoints. [Hindsight MCP blog](https://hindsight.vectorize.io/blog/2026/03/04/mcp-agent-memory) The GitHub README shows Node.js and Python client usage for retaining and recalling memories. [Hindsight GitHub](https://github.com/vectorize-io/hindsight)

It also supports bank templates: JSON manifests that can preconfigure a memory bank's configuration overrides, mental models, directives, extraction mode, entity label vocabulary, and related settings. [Hindsight bank templates](https://hindsight.vectorize.io/developer/api/bank-templates)

GhostCrab's integration is narrower but more domain-oriented: the agent connects to GhostCrab MCP to query structured project state on mindBrain Personal or Professional. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Key Design Insight

Hindsight's strongest idea is that **agent memory should be a learning substrate, not a passive transcript archive**. It separates raw facts, experiences, observations, and curated mental models, then lets `reflect` synthesize answers through a configured bank identity.

mindBrain's strongest idea is that **agent work needs a domain substrate, not only a learning substrate**. A memory bank can tell an agent what it has learned. A domain model can tell the agent what state exists, which relation is directional, what blocks what, and which constraints belong in the current working context.

Given the evidence limits, the cautious conclusion is: Hindsight looks strongest where the agent must learn from accumulated interaction; mindBrain looks stronger where the agent must operate inside an explicit, typed domain.

***

## What MindBrain Is

mindBrain is the durable structured storage layer behind GhostCrab. GhostCrab describes itself as an MCP-friendly server layer that lets an existing agent work with structured project state on mindBrain Personal, backed by SQLite, or mindBrain Professional, backed by PostgreSQL. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

Its recurring primitives are facets, graphs, and projections. Facets find the relevant domain slice. Graphs represent directed dependencies and blockers. Projections pack compact working context for the current task. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

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

## Concrete MindBrain Workflow After Import

Because public Hindsight implementation detail is still limited, the safest comparison is at the contract level. Hindsight exposes retain, recall, and reflect over memory banks. The MindBrain path is a modeled workspace where import qualifies data before agents query it:

```text
1. Model the domain
   ghostcrab_modeling_guidance or loadout suggestion
     -> entities, relation types, facet dimensions, lifecycle states

2. Verify the contract
   ghostcrab_schema_list / ghostcrab_schema_inspect
   ghostcrab_workspace_export_model
     -> the workspace semantics the import must satisfy

3. Qualify imported data
   MindBrain Studio or an import path maps source material into:
     source records
     chunks and evidence
     typed entities
     directed relations
     facet values
     projection signals

4. Query the qualified workspace
   ghostcrab_count / ghostcrab_search / ghostcrab_facet_tree
     -> facet-indexed records and typed navigation

   ghostcrab_traverse / graph entity tools
     -> dependencies, blockers, prerequisites, evidence paths

   ghostcrab_coverage
     -> ontology gaps before autonomous action

   ghostcrab_projection_get / ghostcrab_pack
     -> compact working context for the agent
```

If Hindsight data is exported or mirrored into MindBrain, the import should not flatten it into one generic memory table. World facts, experience facts, observations, and mental models would need to be mapped into the target workspace only where the semantics are clear: a fact can become evidence, an observed dependency can become a typed edge, a mission directive can become a constraint, and a recurring action pattern can become a projection signal. Where the mapping is unclear, the honest answer is to preserve the source as evidence rather than overstate structure.

That is also the boundary between the two systems. Hindsight's `recall` and `reflect` surfaces are built for learning from memory banks. MindBrain's GhostCrab surfaces are built for querying qualified domain state: `ghostcrab_search` for facet-backed records, graph traversal for explicit dependencies, `ghostcrab_coverage` for missing model coverage, and projections or packs for compact working context. The public evidence supports comparing those contracts; it does not support claiming that Hindsight's hidden internals are weaker or stronger than MindBrain's storage internals.

***

## Taxonomy Cost / Expected Gain

MindBrain asks for more modeling discipline than a learning memory layer. The team has to name the domain objects, choose relation labels, define facet dimensions, and decide which states are valid. That work is overhead if the goal is only to remember preferences, summarize past interactions, or let an agent reflect over accumulated experience.

The cost pays back when the agent must act inside a repeatable operating domain. If obligations, project phases, owners, blockers, approvals, incident states, evidence links, or valid transitions matter, taxonomy turns memory into a queryable contract. The expected gain is deterministic retrieval, explicit graph paths, coverage checks before action, and projection packs that compress the current task into `FACT`, `GOAL`, `STEP`, and `CONSTRAINT` instead of re-reading a long memory bank.

The cost does not pay back when the task is exploratory, personal, or mostly adaptive. If the primary question is "what has this agent learned about the user?" Hindsight is the more natural first test. If the question is "which state transition is valid, which dependency blocks it, and what evidence supports the next step?" MindBrain is the more natural test.

***

## Why Try MindBrain First

Hindsight is interesting because it treats memory as something an agent can retain, recall, and reflect on. mindBrain should be tested first when the use case is less about introspective memory and more about operational truth across silos. Laws, policies, emails, SEC filings, project plans, model notes, CRM records, and infrastructure inventories need different semantic shapes; they should not all be flattened into one memory bank.

mindBrain's bet is that multiple ontologies can coexist in the same workspace. A legal ontology can model obligations, a finance ontology can model filings and metrics, a CRM ontology can model relationships, and a delivery ontology can model phases and blockers. Meta-ontologies then connect those domains so an agent can ask cross-cutting questions: which customer commitments are contradicted by legal constraints, or which financial risks affect active project milestones?

MindBrain DDL is **Domain Definition Language**. It defines what things mean, how they relate, which dimensions can be faceted, and which projections should be materialized for agent work. Those projections are not summaries. They are operational surfaces: dashboard rows, kanban cards, graph positions, and compact `FACT`, `GOAL`, `STEP`, `CONSTRAINT` bundles.

The strongest trial case is one where token-based recall is visibly wasteful. Give the agent a large tool or document universe, such as 10,000 endpoints across 20 MCP servers or thousands of legal and financial records, then ask it for a specific action path. mindBrain's facets and graphs should narrow the domain deterministically in milliseconds, while the model spends its context on judgment rather than search. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: MindBrain vs Hindsight

| Dimension | Hindsight | mindBrain |
|---|---|---|
| Core abstraction | Memory bank | Structured domain state |
| Primary use case | Agents that learn from accumulated facts and interactions | Agents that navigate workflows, dependencies, and project state |
| Main operations | Retain, recall, reflect | Find, follow, pack |
| Memory model | World facts, experience facts, observations, mental models | Entities, facets, directed relations, projections |
| Retrieval | Semantic, BM25, graph, temporal, reranking | Facet filtering, graph traversal, projection packing |
| Reasoning layer | Reflect over memories with mission, directives, disposition traits | Agent reasons over typed domain state exposed through MCP |
| Graph role | Links memory by entity, time, semantics, causality | Encodes domain dependencies, blockers, validation, prerequisites |
| Temporal behavior | Temporal grounding and observations over time | Lifecycle state and domain transitions when modeled |
| Agent interface | MCP, API clients, SDKs, Docker/open-source path | GhostCrab MCP |
| Evidence maturity | Public docs, GitHub, blog, paper; implementation detail still partly opaque | Public GhostCrab architecture and product docs |
| Best fit | Adaptive agents, personalization, long-horizon memory | Operational systems with explicit state and constraints |
| Weak fit | Replacing a typed workflow database | Replacing a learning memory layer for personal adaptation |

***

## The Structural Difference in One Sentence

Hindsight is strongest when the agent needs to **learn from what happened before**.

mindBrain is strongest when the agent needs to **act inside a structured world whose states, dependencies, and constraints are explicit**.
