---
title: Hermes Agent memory vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - hermes-agent
  - agent-memory
---

## The Structural Difference in One Sentence

Hermes Agent memory is **agent-native cross-session recall**: its intelligence lives in persisted memory, session search, learned skills, and user modeling inside a self-improving agent runtime.

mindBrain is **cross-ontology structured state**: its intelligence lives in typed domain models, facets, directed relations, and pre-computed projections exposed through GhostCrab MCP. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## What Hermes Agent Memory Is

Hermes Agent is a self-improving agent by Nous Research. Its public docs describe a closed learning loop with agent-curated memory, periodic nudges, autonomous skill creation, skill self-improvement, FTS5 cross-session recall with LLM summarization, and Honcho user modeling. [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/)

The public documentation is useful but fast-moving, so this article separates three levels of evidence:

- Official docs describe Hermes as having persistent memory, skills, FTS5 recall, Honcho user modeling, MCP support, and many platform integrations. [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/)
- Official repository docs describe session storage in SQLite with FTS5 tables for full-text search across messages. [Hermes session storage](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/session-storage.md)
- A public GitHub feature issue describes the current memory limitations and proposes typed memory nodes, graph edges, vector search, decay, and memory bulletins. That issue should be read as roadmap/proposal evidence, not shipped-product evidence. [Hermes structured memory issue](https://github.com/NousResearch/hermes-agent/issues/346)

That makes the comparison precise: Hermes memory is about what the agent remembers across sessions and how it improves itself. mindBrain is about how an agent navigates structured state across domains.

***

## The Core Problem It Solves

Hermes solves the "agent starts from zero every time" problem. It is designed to preserve user preferences, environment knowledge, reusable procedures, and searchable conversation history across sessions. The official docs present memory, skills, session recall, and Honcho modeling as part of one closed learning loop. [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/)

The session storage docs show the concrete substrate for conversation recall: `~/.hermes/state.db` stores session metadata, full message history, model configuration, and FTS5 virtual tables over message content and tool data. [Hermes session storage](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/session-storage.md)

This is the right shape when the failure mode is:

- the agent forgets the user's preferences
- previous sessions contain useful context
- a solved workflow should become a reusable skill
- a user wants one agent reachable through CLI or messaging platforms
- the runtime should improve from experience

It is not the same as structured operational state:

- which tasks block a release
- which compliance obligations validate a submission
- which CRM opportunities share a legal dependency
- which ontology describes finance vs legal vs product work
- which facts, goals, steps, and constraints should be packed right now

Hermes remembers and improves. mindBrain models and navigates.

***

## Architecture

Hermes memory sits inside the agent runtime.

```text
+------------------------------+
| Hermes Agent                 |
| CLI / gateway / tools        |
+------------------------------+
| Closed Learning Loop         |
| memory + skills + nudges     |
+------------------------------+
| Session Storage              |
| SQLite state.db              |
| sessions, messages, FTS5     |
+------------------------------+
| Cross-Session Recall         |
| FTS5 search + summarization  |
+------------------------------+
| Optional User Modeling       |
| Honcho                       |
+------------------------------+
```

The session storage documentation lists `sessions`, `messages`, `messages_fts`, `messages_fts_trigram`, `state_meta`, and `schema_version` under `~/.hermes/state.db`. It also says `search_messages()` supports FTS5 query syntax with sanitization. [Hermes session storage](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/session-storage.md)

mindBrain sits outside the agent runtime as a structured MCP-accessible database:

```text
+------------------------------+
| Hermes / OpenClaw / Codex    |
| or another MCP-capable agent |
+------------------------------+
| GhostCrab MCP                |
+----------+----------+--------+
| Facets   | Graphs   | Packs  |
| find     | follow   | project|
+----------+----------+--------+
| mindBrain                    |
| SQLite Personal / Postgres   |
+------------------------------+
```

This repository's Nous-Hermes integration guide is careful: it says there is no single verified Nous-Hermes MCP config path in the repo, so GhostCrab should be treated as an adapter pattern for runtimes that can launch MCP servers. [local Nous-Hermes guide](../../installations/nous-hermes.md)

***

## Memory Model

Hermes public docs describe the learning loop at the product level. The repository docs show a concrete session database for conversation history. The structured-memory issue gives a useful snapshot of known gaps in the existing memory shape: flat `MEMORY.md` and `USER.md` entries, FTS5 over session transcripts, static per-session injection, no graph structure, no vector search, no importance scoring, and fixed capacity. [Hermes structured memory issue](https://github.com/NousResearch/hermes-agent/issues/346)

That gives the current documented model:

```text
Hermes memory and recall
  persistent user / agent memory
  session database
    sessions
    messages
    messages_fts
    messages_fts_trigram
  learned skills
  optional Honcho user modeling
```

The proposed richer model in the issue would add typed memories, graph edges, vector search, hybrid retrieval, decay, and memory bulletins. Because it is an open feature issue, it should not be treated as current shipped behavior. [Hermes structured memory issue](https://github.com/NousResearch/hermes-agent/issues/346)

mindBrain's model is already structural:

```text
workspace / ontology
  entity types
  facets
  directed relations
  statuses
  projections
```

The difference is concrete. Hermes can remember that a user prefers short answers or that a project uses a particular deployment workflow. mindBrain can model that a deployment task is blocked by a legal approval, that the approval validates a release gate, and that the current agent turn should see one fact, one goal, two steps, and a constraint.

***

## Signature Mechanism

Hermes Agent's signature mechanism is the **closed learning loop**: an agent that persists memory, recalls previous sessions, creates and improves skills, and builds a deeper model of the user over time. The official docs describe these as core features alongside multi-platform access, scheduled automations, subagents, MCP support, and tool use. [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/)

For memory specifically, the concrete recall path is built on the session database and FTS5 search:

```text
past sessions
  -> SQLite state.db
  -> messages + FTS5 tables
  -> search_messages()
  -> summarized recall into current context
```

mindBrain's signature mechanism is **structured navigation**:

```text
domain facts
  -> facet indexes
  -> directed graph edges
  -> projection packs
  -> compact context for the current task
```

One is centered on the agent's accumulated experience. The other is centered on the domain's explicit shape.

***

## Search / Retrieval / Reasoning Path

Hermes search is conversation-centric. Its session storage docs describe full message history in SQLite and FTS5 virtual tables for message search. That is a strong primitive for "what did we discuss?" and "find the previous session where this came up." [Hermes session storage](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/session-storage.md)

The open structured-memory issue explicitly calls out what this does not yet provide as current memory structure: no graph relations between memories, no vector search, no importance scoring, and no typed memory model. [Hermes structured memory issue](https://github.com/NousResearch/hermes-agent/issues/346)

mindBrain search is domain-centric:

```text
find:
  status = blocked
  country = BE
  phase = review

follow:
  task A BLOCKS task B
  document X VALIDATES requirement Y
  approval P REQUIRED_BY release R

pack:
  FACT / GOAL / STEP / CONSTRAINT
```

GhostCrab's architecture page describes this as find, follow, and pack: narrow the domain with Facettes, follow directed relationships with Graphes, and return compact Projections rather than transcript dumps. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Agent Integration

Hermes is itself an agent runtime. Its docs emphasize CLI, messaging platforms, tools, skills, MCP support, browser use, scheduled automations, and provider flexibility. [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/)

GhostCrab does not replace that runtime. In a Hermes-like setup, GhostCrab would be an external structured substrate the agent can call. The local integration guide in this repo says to validate by asking the runtime to list MCP tools and then create or inspect a GhostCrab workspace before relying on persistent memory. [local Nous-Hermes guide](../../installations/nous-hermes.md)

That produces a clean division of labor:

- Hermes handles the agent loop, tools, channels, skills, and self-improvement.
- mindBrain handles durable domain state, ontology structure, dependencies, and projection packs.

***

## Key Design Insight

Hermes memory is about continuity of the agent. It helps the agent carry preferences, past sessions, reusable procedures, and user modeling forward. That is valuable because agents are not useful if they relearn the same user and workflow every day.

mindBrain is about continuity of the domain. It helps the agent operate inside a structured model of tasks, people, documents, obligations, approvals, blockers, and dependencies. That is valuable because a remembered conversation is not the same thing as a navigable operational system.

The sharpest version of the comparison is this: **Hermes makes the agent less forgetful; mindBrain makes the work less ambiguous.**

***

## What MindBrain Is

mindBrain is the structured engine underneath GhostCrab. GhostCrab exposes it through an MCP surface with Facettes, Graphes, and Projections. The architecture page describes Facettes as the way an agent narrows a domain, Graphes as the way it follows dependencies and blockers, and Projections as compact working context bundles. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

GhostCrab also states that mindBrain has two deployment shapes: Personal backed by SQLite and Professional backed by PostgreSQL. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

That is why mindBrain should not be positioned as "Hermes memory but bigger." It is a different layer: not the agent's autobiographical memory, but the structured world the agent can inspect and update.

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

Hermes-style memory is valuable when the agent needs continuity across sessions. mindBrain should come first when the agent is expected to act inside a domain that has shared state, multiple systems of record, and repeatable procedures. The question is no longer "what did this agent learn?" It becomes "where is the work, what is blocked, which system owns the fact, and what must happen next?"

mindBrain's multi-ontology workspace is the reason this becomes practical. An agent team can keep separate ontologies for CRM, project delivery, HR ownership, legal constraints, software changes, and knowledge notes, then connect them through meta-ontologies. That makes cross-silo queries possible without asking the model to infer a global data model from chat history.

MindBrain DDL means **Domain Definition Language**: a semantic blueprint for things, states, dimensions, graph relations, and projections. Once that blueprint exists, projections can feed live dashboards, kanban boards, agent queues, and graph views. A project-management ontology can be projected into a concrete delivery instance where Project A is in phase B, task C is tied to PR 123, and Project B is blocked by a missing approval edge.

The practical gain for agent runtimes is deterministic selection. If an agent has access to 20 MCP servers and 10,000 registered endpoints, mindBrain can use facets and graph relations to select the four endpoints needed for an email-plus-calendar workflow in milliseconds. That saves the model from spending context on endpoint discovery and lets Hermes focus on reasoning, communication, and execution. [GhostCrab architecture](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: MindBrain vs Hermes Agent Memory

| Dimension | Hermes Agent memory | mindBrain |
|---|---|---|
| Core abstraction | Agent continuity and self-improvement | Structured domain state |
| Primary use case | Cross-session recall, preferences, skills | Cross-ontology project/workflow navigation |
| Storage | SQLite session DB, memory files/providers, skills | SQLite Personal or PostgreSQL Professional |
| Retrieval | FTS5 session search, summarization, memory injection | Faceted filtering, graph traversal, projection packs |
| Graph support | Proposed in public issue, not the cited current baseline | First-class directed graph layer |
| Memory types | Current public issue describes flat entries as baseline | Typed entities, statuses, relations, projections |
| Lifecycle behavior | Agent learns over sessions | Domain objects move through states and blockers |
| Multi-domain support | Profiles, skills, runtime configuration | Workspaces, ontologies, typed domain models |
| Agent interface | Hermes runtime itself | MCP tools callable from Hermes or other agents |
| Best fit | Personal assistant continuity and self-improving workflows | Operational state, compliance, CRM, project delivery |
| Weak fit | Deterministic cross-ontology joins by itself | Replacing Hermes' agent runtime, tools, or channels |

***

## Query Catalog

Hermes-style memory questions:

```text
What did we discuss about this deployment last week?
What does the user usually prefer?
Which solved workflow should become a skill?
Find the previous session where the agent handled this setup.
```

mindBrain-style structured-state questions:

```text
Which release blockers depend on legal approval?
Which compliance obligations are missing validation evidence?
Which CRM opportunities share the same stakeholder risk?
What projection pack should the agent see for this workspace right now?
```

Hermes recall can help the agent remember the story. mindBrain gives the agent the map.

***

## The Structural Difference in One Sentence

Hermes Agent memory preserves and improves the agent across sessions; mindBrain preserves and exposes the structured state of the domains that agent works in.
