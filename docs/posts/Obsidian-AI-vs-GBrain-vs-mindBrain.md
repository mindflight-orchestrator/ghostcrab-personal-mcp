---
title: Obsidian AI vs GBrain vs mindBrain
date: 2026-05-12
tags:
  - ghostcrab
  - mindbrain
  - obsidian
  - gbrain
  - pkm
---

## The Structural Difference in One Sentence

Obsidian plus AI plugins is a **human-authored PKM workspace**: its intelligence lives in Markdown files, links, properties, search, and optional third-party AI layers over the vault. [Obsidian](https://help.obsidian.md/data-storage)

GBrain is a **self-wiring personal knowledge graph**: its intelligence lives in accumulated ingest, entity pages, typed links, hybrid search, and autonomous skill-driven maintenance around a personal brain repo. [GBrain](https://github.com/garrytan/gbrain)

MindBrain is a **structured agentic database**: its intelligence lives in schema enforcement, typed ontologies, directed relations, faceted retrieval, and precomputed working-context projections exposed through GhostCrab MCP. [GhostCrab](https://www.ghostcrab.be/architecture.html)

***

## What Obsidian Plus AI Is

[Obsidian](https://obsidian.md) is a local-first note-taking and personal knowledge management application. Its basic storage model is deliberately simple: a vault is a folder on the local file system, notes are Markdown-formatted plain text files, and Obsidian keeps its application cache synchronized with those files. [Obsidian](https://help.obsidian.md/data-storage)

The core product is not an AI memory system. It is an extensible writing and linking environment. Obsidian's official core plugins include Backlinks, Graph view, Search, Properties view, Canvas, Bases, Sync, Publish, and other note-workflow features. [Obsidian](https://help.obsidian.md/plugins)

The "AI Obsidian" layer usually comes from community plugins or adjacent tools. Smart Connections positions itself as a third-party local-first AI workflow layer for Obsidian that surfaces related notes, builds context, and adds Smart Chat around a vault. [Smart Connections](https://smartconnections.app/) Copilot for Obsidian describes itself as an AI assistant inside Obsidian with context-aware actions and model integrations. [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot) Text Generator focuses on generating, transforming, and templating text inside notes using AI providers. [Text Generator](https://text-gen.com/)

That makes Obsidian plus AI plugins a strong human knowledge workspace with optional AI assistance, not a database-enforced runtime for agents.

***

## The Core Problem It Solves

Obsidian solves the personal knowledge problem of capturing, linking, searching, and revisiting notes without locking the user into a proprietary data model. Internal links create a network of knowledge between notes, and Obsidian can update internal links when files are renamed. [Obsidian](https://help.obsidian.md/links)

Its Graph view visualizes relationships between notes: nodes are notes, lines are internal links, and local graph mode can show notes connected to the active note. [Obsidian](https://help.obsidian.md/plugins/graph) Its Search plugin gives the user file and content search operators over the vault. [Obsidian](https://help.obsidian.md/plugins/search) Properties add YAML metadata for small, human- and machine-readable values. [Obsidian](https://help.obsidian.md/properties)

The AI plugin layer addresses a different pain: once a vault grows large, the user wants semantic lookup, summarization, chat over notes, and writing assistance. Smart Connections explicitly frames the vault as a shared workspace between the user and AI. [Smart Connections](https://smartconnections.app/)

What Obsidian does not solve by default is agentic state management: typed domain transitions, enforced dependency edges, canonical lifecycle states, or deterministic context packs for a task-specific agent call.

***

## Architecture

Obsidian's architecture is file-centered:

```text
Human writer
     |
     v
Obsidian app
  |-- Core plugins
  |     |-- Links / Backlinks
  |     |-- Graph view
  |     |-- Search
  |     |-- Properties / Bases
  |
  |-- Community AI plugins
  |     |-- Semantic related notes
  |     |-- Chat over selected context
  |     |-- Text generation
  |
  v
Local vault
  |-- Markdown files
  |-- YAML properties
  |-- Attachments
  |-- .obsidian configuration
```

Obsidian Sync, Dropbox, iCloud, OneDrive, Git, and other sync methods move the vault across devices, but the durable unit remains the local folder and files. [Obsidian](https://help.obsidian.md/data-storage)

GBrain moves one level closer to agent memory. Its public README describes a brain repo where Markdown files are the source of truth, while GBrain provides Postgres/PGLite-backed retrieval, pgvector embeddings, keyword search, reciprocal-rank fusion, typed links, and MCP-facing commands. [GBrain](https://github.com/garrytan/gbrain)

MindBrain moves the center of gravity again: GhostCrab sits between an AI agent and PostgreSQL, exposing `pg_facets` for finding, `pg_dgraph` for following dependencies, and `pg_pragma` for packing compact working context. [GhostCrab](https://www.ghostcrab.be/architecture.html)

```text
Obsidian + AI             GBrain                    MindBrain / GhostCrab
-----------------         ------------------        -------------------------
Markdown vault            Brain repo                PostgreSQL domain model
Human links               Entity pages              Typed ontologies
Community AI plugins      Auto-linked graph          Directed relations
Vault chat / lookup       MCP brain tools            MCP Find / Follow / Pack
```

***

## Memory Model

Obsidian's memory model is note-shaped. A note can contain prose, links, embeds, tags, and YAML properties. Obsidian supports Markdown files, `.base` files, JSON Canvas, images, audio, video, PDFs, and other accepted file formats. [Obsidian](https://help.obsidian.md/file-formats)

```text
vault/
  Project Alpha.md
  People/Alice.md
  Meetings/2026-05-12.md
  .obsidian/
    plugins/
    themes/
    workspace state
```

Links are explicit textual references. Properties are YAML key-value metadata. Backlinks and unlinked mentions are interface affordances over the files. [Obsidian](https://help.obsidian.md/plugins/backlinks)

AI plugins add derived indexes and chat surfaces, but the core truth remains whatever the human wrote into the vault. That is a strength for personal ownership and portability. It is a weakness when an agent must know that `Deal.stage = diligence` is a legal state, `KYC review BLOCKS onboarding` is a typed dependency, or `invoice approved -> payment scheduled` is a constrained lifecycle transition.

GBrain's memory model is entity-page centered. Its README says every page write extracts entity references and creates typed links such as `attended`, `works_at`, `invested_in`, `founded`, and `advises` without LLM calls. [GBrain](https://github.com/garrytan/gbrain)

MindBrain's memory model is domain-ontology centered:

```text
entities
  id
  type
  label
  status
  facets

relations
  source
  target
  relation_type
  direction
  provenance

projections
  FACT | GOAL | STEP | CONSTRAINT
  source_refs
  rank
  compact_context
```

The difference is not "notes versus database" in the abstract. The difference is where invariants live. In Obsidian, they live in the user's habits. In GBrain, they live partly in skills and typed extraction. In MindBrain, they live in the modeled substrate exposed to the agent.

***

## Signature Mechanism

Obsidian's signature mechanism is the bidirectional note graph. The user creates links between notes; Obsidian surfaces incoming links, outgoing links, graph neighborhoods, unlinked mentions, properties, search, and visual canvases around those files. [Obsidian](https://help.obsidian.md/plugins)

The AI plugin signature is retrieval over the vault. Smart Connections focuses on related notes, reusable context, and chat attached to notes. [Smart Connections](https://smartconnections.app/) Copilot focuses on AI-assisted note editing, chat, and tool integration inside the Obsidian workflow. [Obsidian Copilot](https://github.com/logancyang/obsidian-copilot)

GBrain's signature mechanism is autonomous compounding. It describes signal detection, brain-first lookup, entity extraction, typed relationship creation, sync, enrichment tiers, and background jobs that make the brain improve over time. [GBrain](https://github.com/garrytan/gbrain)

MindBrain's signature mechanism is the `Find -> Follow -> Pack` loop. GhostCrab narrows the domain with facets, traverses directed relationships, then returns a compact bundle of facts, goals, steps, and constraints for the current task. [GhostCrab](https://www.ghostcrab.be/architecture.html)

***

## Search / Retrieval / Reasoning Path

Obsidian retrieval starts from files: keyword search, path filters, tags, properties, internal links, backlinks, and graph navigation. [Obsidian](https://help.obsidian.md/plugins/search)

AI plugins extend that with embeddings, semantic lookup, chat, provider routing, and context assembly. That path is useful for "what did I write about X?" and "draft from these notes." It is weaker for deterministic operational questions like:

```text
Which compliance task is blocked by an unsigned document?
Which customer renewal has a missing owner and a deadline inside 14 days?
Which thesis note contradicts this decision record?
```

GBrain answers relational personal-memory questions by combining vector, keyword, and graph retrieval over its brain repo. Its README describes hybrid search and backlink-boosted ranking, with benchmarks against graph-disabled and vector-only variants. [GBrain](https://github.com/garrytan/gbrain)

MindBrain treats retrieval as a database operation. `pg_facets` filters by dimensions like status, owner, country, regulation, phase, priority, customer, or role; `pg_dgraph` follows edges such as `REQUIRES`, `BLOCKS`, `OWNED_BY`, `VALIDATES`, and `DEPENDS_ON`; `pg_pragma` returns pre-packed working context so the model does not reread the whole project. [GhostCrab](https://www.ghostcrab.be/architecture.html)

***

## Agent Integration

Obsidian can be used by agents indirectly through files, plugins, local scripts, or vault-aware AI plugins. That is flexible, but the agent interface is not the main product contract. Community plugins can be powerful, but Obsidian's own glossary distinguishes core plugins from third-party community plugins that must be installed separately. [Obsidian](https://help.obsidian.md/glossary)

GBrain is explicitly agent-facing. Its README describes MCP, CLI, skillpacks, query/search calls, and a bridge to OpenClaw/Hermes-style agents. [GBrain](https://github.com/garrytan/gbrain)

GhostCrab is also explicitly agent-facing, but with a different philosophy: it does not try to become the agent. It provides the structured working surface while the agent remains the reasoning and conversational layer. [GhostCrab](https://www.ghostcrab.be/architecture.html)

***

## Key Design Insight

The honest architectural read: Obsidian plus AI is still **human-first memory**. The human decides the note boundary, link shape, metadata discipline, naming convention, folder taxonomy, and review cycle. AI plugins help retrieve and transform that material, but they inherit the structure the human actually maintained.

GBrain is **personal-agent memory**. It accepts that a power user does not want to manually wire every entity relation, so it lets a brain system ingest, link, enrich, and repair knowledge around one person's operational context.

MindBrain is **domain-agent state**. It assumes the agent should not infer the operational model from prose on every turn. The domain should already have entities, states, dependencies, rules, and compact projections that can be queried directly.

***

## What MindBrain Is

MindBrain is a structured agentic database that makes any domain navigable in real time; its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time.

GhostCrab is the MCP server layer that exposes that structure to agents. It sits between the agent and PostgreSQL, giving the agent three practical capabilities: find the right subset, follow relationships and blockers, and pack a compact working context for the current task. [GhostCrab](https://www.ghostcrab.be/architecture.html)

## Why Try MindBrain First

Obsidian is a superb human workspace, and GBrain is a strong personal graph pattern. MindBrain should be tested first when the goal is not only to remember or write notes, but to make teams of AI agents operate across structured domains. Notes, emails, posts, legal texts, financial filings, project boards, and API catalogs can all be meaningful at the same time, but not in the same way.

MindBrain supports multiple ontologies inside one workspace. A note ontology can model ideas, a legal ontology can model obligations, a finance ontology can model SEC filings and metrics, a CRM ontology can model people and accounts, and a project ontology can model phases, tasks, blockers, and PRs. Meta-ontologies then connect them, so agents can ask questions that are impossible in a pure note graph: which legal clause affects a blocked project tied to a high-value customer, or which mental model contradicts a claim in a board memo?

MindBrain DDL means **Domain Definition Language**. Instead of only storing Markdown properties, it defines what things mean, how they relate, and which projections should be available. Those projections can become dashboards, kanban boards, agent queues, or graph views of real work: Project A is in phase B, task C maps to PR 123, and Project B is blocked by dependency D.

The performance difference matters because agent workspaces quickly become too large for context-window browsing. If 10,000 endpoints are registered across 20 MCP servers, the agent should not reread every tool description to book a meeting. Facets and graph relations should narrow the endpoint universe in milliseconds, while the model spends tokens on the message and the decision. [GhostCrab](https://www.ghostcrab.be/architecture.html)

***

## Head-to-Head: Obsidian AI vs GBrain vs MindBrain

| Dimension | Obsidian + AI plugins | GBrain | MindBrain |
|---|---|---|---|
| Core abstraction | Vault of Markdown notes | Personal brain repo with entity pages | Structured domain model |
| Primary user | Human knowledge worker | Individual power user with agents | Practitioner or team using agents over stateful domains |
| Source of truth | Local files | Markdown brain repo plus database indexes | PostgreSQL-backed structured state |
| Schema enforcement | Light YAML properties and human convention | Skill discipline plus typed extraction | Typed ontologies and database-backed structure |
| Graph model | Note links and backlinks | Typed entity graph | Directed, typed domain relations |
| AI layer | Community plugins and provider integrations | Agent-facing brain skills and MCP tools | GhostCrab MCP Find / Follow / Pack |
| Retrieval | Keyword, links, graph view, plugin embeddings | Hybrid vector + keyword + graph | Facets + graph traversal + projections |
| Lifecycle behavior | Manual note maintenance | Autonomous ingest, enrichment, sync, jobs | Durable project states, dependencies, constraints |
| Best fit | Writing, research notes, personal sensemaking | Personal long-term agent memory | Operational domains with states and blockers |
| Weak fit | Deterministic workflow state for agents | Multi-domain governed operations | Free-form creative note-taking |

***

## The Structural Difference in One Sentence

Obsidian plus AI makes a human vault more searchable and generative; GBrain makes a personal graph compound around an agent; MindBrain makes a typed domain directly navigable by agents through deterministic retrieval, dependency traversal, and compact context packs.
