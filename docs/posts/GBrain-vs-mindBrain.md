---
title: GBrain vs mindBrain
date: YYYY-MM-DD
tags:
  - ghostcrab
  - mindbrain
---
## The Structural Difference in One Sentence

GBrain is a **self-wiring personal knowledge graph** that gets smarter as you sleep — its intelligence lives in accumulated ingest, entity propagation, and nightly repair cycles. 

MindBrain is a **structured agentic database** that makes any domain navigable in real time — its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time. [ghostcrab](https://www.ghostcrab.be/architecture.html)
***

## What GBrain Is

[GBrain](https://github.com/garrytan/gbrain) is an open-source, self-wiring knowledge graph released under MIT by Garry Tan, CEO of Y Combinator, in April 2026. Its core purpose: give AI agents persistent, structured long-term memory across sessions, something most agent frameworks treat as an afterthought. The entire system is built in 12 days and powers Tan's personal OpenClaw and Hermes agent deployments — currently holding 17,888 pages, 4,383 enriched people profiles, and 723 company graphs. [lucaberton](https://lucaberton.com/blog/garry-tan-gbrain-ai-agent-knowledge-graph-2026/)

***

## The Core Problem It Solves

LLM agents forget everything between sessions. Pure vector RAG can retrieve semantically similar chunks, but it fails at relational queries like "**who works at Company X**?" or "**what did this investor fund this quarter?**". GBrain inverts the standard RAG approach: instead of sophisticated retrieval over a poorly-defined corpus, it does **simple retrieval over a strongly-defined corpus**. [linkedin](https://www.linkedin.com/pulse/what-we-found-reading-every-line-gbrain-fast-code-nntcc)

***

## Architecture

GBrain runs on **PGLite**, an embedded PostgreSQL instance that starts in under 2 seconds with no server process. The full stack: [lucaberton](https://lucaberton.com/blog/garry-tan-gbrain-ai-agent-knowledge-graph-2026/)

```
┌─────────────────────────────┐
│ AI Agent (OpenClaw/Hermes)  │
├─────────────────────────────┤
│  MCP Tools (30+ exposed)    │
├─────────────────────────────┤
│     Hybrid Search Engine    │
│  ├── Vector (embeddings)    │
│  ├── BM25 (keyword)         │
│  └── Graph (entity links)   │
├─────────────────────────────┤
│  PGLite (embedded Postgres) │
└─────────────────────────────┘
```

The brain-agent loop runs like this: [youtube](https://www.youtube.com/watch?v=Hsi1hr2zI9I)

```
Input (meeting/email/tweet/voice)
        │
        ▼
  Entity Extraction (pattern matching, no LLM)
        │
        ▼
  Page Write  ──────► Typed graph links wired
  (compiled truth + timeline)   │
        │              (works_at, founded,
        ▼               invested_in, advises)
  Hybrid Search Index            │
  (vector + BM25 + graph) ◄──────┘
        │
        ▼
  Dream Cycle (nightly)
  (repair + consolidate + enrich)
        │
        ▼
  Agent wakes up to a smarter brain
```

***

## Data Schema

GBrain enforces a strict **one page per entity** discipline, typed by category. There is no schema validator — the rules live in a 1,300-line markdown file called `GBRAIN_SKILLPACK.md` that gets injected into the agent's system prompt. [linkedin](https://www.linkedin.com/pulse/what-we-found-reading-every-line-gbrain-fast-code-nntcc)

**Page structure (every entity):**

```
# [Entity Name]
type: person | company | deal | concept | event

[Compiled Truth]
Current best understanding — rewritten when evidence changes.
Every fact carries an inline [Source: who, where, when] citation.

──────────────────────────────────────
[Timeline]
Append-only log of every signal ever received about this entity.
Each entry is dated and sourced.
```

**Core tables (PGLite/Postgres):**

```
pages
  ├── id          (uuid)
  ├── title       (text)
  ├── type        (person | company | deal | concept | event)
  ├── compiled_truth  (text)
  ├── embedding   (vector via pgvector)
  ├── search_vector   (tsvector, BM25)
  └── updated_at  (timestamptz)

timeline_entries
  ├── id          (uuid)
  ├── page_id     (fk → pages.id)
  ├── content     (text)
  ├── source      (text)
  └── created_at  (timestamptz)

entity_links
  ├── from_page_id  (fk → pages.id)
  ├── to_page_id    (fk → pages.id)
  ├── relation      (works_at | founded | invested_in |
  │                  advises | attended)
  └── created_at    (timestamptz)
```

A Postgres `AFTER` trigger on `timeline_entries` fires upward to the parent `pages` row, which then rebuilds the weighted `tsvector` using `setweight()` over title, compiled truth, and aggregated child timeline text. Entity propagation is strict: if Alice met Bob at Acme, the event lands on Alice's page, Bob's page, **and** Acme's page. [linkedin](https://www.linkedin.com/pulse/what-we-found-reading-every-line-gbrain-fast-code-nntcc)

***

## The Dream Cycle

The dream cycle is a nightly autonomous maintenance loop that runs while the user sleeps. It is the mechanism that makes the knowledge graph self-healing rather than merely append-only. [github](https://github.com/garrytan/gbrain)

```
DREAM CYCLE (nightly)
┌────────────────────────────────────────────┐
│  1. INGEST                                 │
│     Scan day's conversations, emails,      │
│     transcripts                            │
│                                            │
│  2. SYNTHESIZE                             │
│     Rewrite compiled_truth per page        │
│     with new evidence                      │
│                                            │
│  3. CITATION REPAIR                        │
│     Fix broken [Source:] links             │
│                                            │
│  4. ENTITY ENRICHMENT                      │
│     Research + expand person/company       │
│     profiles                               │
│                                            │
│  5. MEMORY CONSOLIDATION                   │
│     Merge duplicates, resolve conflicts    │
│                                            │
│  6. PATTERNS                               │
│     Overnight transcripts become           │
│     reflections, originals, and            │
│     25-year projections                    │
└────────────────────────────────────────────┘
```

Tan runs 21 cron jobs against this cycle on his personal deployment. The result: "you wake up and the brain is smarter than when you went to bed". [lucaberton](https://lucaberton.com/blog/garry-tan-gbrain-ai-agent-knowledge-graph-2026/)

***

## Hybrid Search Performance

GBrain benchmarked against a 240-page Opus-generated corpus: [lucaberton](https://lucaberton.com/blog/garry-tan-gbrain-ai-agent-knowledge-graph-2026/)

| Method | Precision@5 | Recall@5 |
|---|---|---|
| GBrain (graph + vector + BM25) | **49.1%** | **97.9%** |
| GBrain (graph disabled) | 17.7% | — |
| ripgrep-BM25 + vector-only RAG | ~18% | — |

The graph layer alone accounts for a **+31.4 point improvement** in precision. The retrieval uses standard Reciprocal Rank Fusion (RRF, k=60) to merge the three signal sources. [linkedin](https://www.linkedin.com/pulse/what-we-found-reading-every-line-gbrain-fast-code-nntcc)

***

## MCP Integration

GBrain exposes 30+ tools via the Model Context Protocol, making it plug-and-play for any MCP-compatible agent — Claude Code, Cursor, OpenClaw, Hermes. Configuration is one JSON block: [lucaberton](https://lucaberton.com/blog/garry-tan-gbrain-ai-agent-knowledge-graph-2026/)

```json
{
  "mcpServers": {
    "gbrain": { "command": "gbrain", "args": ["serve"] }
  }
}
```

For team deployments, `gbrain serve --http` starts an OAuth 2.1 server with an admin dashboard — no external infrastructure required. [lucaberton](https://lucaberton.com/blog/garry-tan-gbrain-ai-agent-knowledge-graph-2026/)

***

## Key Design Insight

The most honest read of GBrain: it is a **markdown-shaped Postgres database driven by a 1,300-line system prompt**. The "Iron Law of Back-Linking," entity propagation rules, and compiled-truth discipline are not enforced by the schema — they are enforced by the agent reading the skillpack. This means the protocol *is* the product. Schema packs for domain-specific use cases (beyond personal CRM) are already in progress. [x](https://x.com/garrytan/status/2050925599909458168)

> "Installing GBrain gives you a database. What Garry has is years of disciplined entity propagation, source attribution, and dream cycles, built up one meeting at a time." — [linkedin](https://www.linkedin.com/pulse/what-we-found-reading-every-line-gbrain-fast-code-nntcc)

Here is the complete definition of MindBrain and GhostCrab, structured as a direct parallel to the GBrain breakdown from the first prompt.

***
## What MindBrain Is
MindBrain is a **structured agentic database** designed to give AI agents a durable, navigable model of a project, domain, or knowledge corpus. It is not a memory layer, not a vector store, and not a workflow wrapper — it is the structured foundation underneath an agent's working context, available in two deployment tiers: **MindBrain Personal** (SQLite, single-file, zero infrastructure) and **MindBrain Professional** (PostgreSQL, enterprise-grade, high-throughput). [ghostcrab](https://www.ghostcrab.be/architecture.html)

Where GBrain centers on personal knowledge accumulation — a self-wiring graph built from one person's continuous ingest of meetings, emails, and tweets — MindBrain is a **domain modeling engine**: it represents the structured state of any project, organization, or domain as entities, states, procedures, rules, dependencies, and constraints that an agent can navigate and act on. [ghostcrab](https://www.ghostcrab.be)

***
## The Core Problem It Solves
Most agent failures come from the same structural pattern: too much raw context, too little structure, no explicit dependencies, no separation between source data and working context, and no durable project state the agent can navigate. Chat history preserves words — it does not preserve structure. A real project contains entities, states, rules, blockers, and evolving context. If all of that lives only in prose, the agent has to reconstruct the project on every turn — wasteful, brittle, and easy to break. [ghostcrab](https://www.ghostcrab.be/architecture.html)


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
## Architecture
MindBrain exposes **three capabilities** through a single coherent stack: [ghostcrab](https://www.ghostcrab.be)

```
┌──────────────────────────────────────────┐
│         AI Agent (Claude / Cursor        │
│         / OpenClaw / Codex)              │
├──────────────────────────────────────────┤
│              GhostCrab MCP               │
│   (MCP server — the working interface)   │
├──────────┬───────────────┬───────────────┤
│ FACETTES │    GRAPHES    │  PROJECTIONS  │
│ Find     │    Follow     │   Pack        │
├──────────┴───────────────┴───────────────┤
│           mindBrain engine               │
│  Personal: SQLite (zero infra)           │
│  Professional: PostgreSQL + extensions   │
│  Roaring Bitmaps · pgvector · BM25       │
└──────────────────────────────────────────┘
```

**Facettes** — how the agent finds the right slice of a domain. Roaring bitmap indexes + hybrid BM25 + embeddings. Millisecond filtering on tens of millions of documents. Filter by status, owner, country, phase, priority, role — any facet dimension. Designed for ~4.3 billion documents per table on 32-bit IDs (Professional tier). [ghostcrab](https://www.ghostcrab.be/architecture.html)

**Graphes** — how the agent understands dependencies, blockers, and missing knowledge. Typed, directed edges: `REQUIRES`, `BLOCKS`, `VALIDATES`, `DEPENDS_ON`. Direction matters — `A → B` is not the same as `B → A`. The graph tells the agent what must happen first, what is blocking what, what can be skipped, and what is still missing from the current model. [ghostcrab](https://www.ghostcrab.be/architecture.html)

**Projections** — how the agent gets a compact working context for the current task. Not a transcript. Not a raw graph dump. A pre-ranked bundle of `FACT · GOAL · STEP · CONSTRAINT` with provenance attached, typically 80–200 tokens. Even a perfectly modeled project cannot be dumped wholesale into a context window — projections give the agent a usable reasoning surface for the current turn. [ghostcrab](https://www.ghostcrab.be/architecture.html)

***
## Data Schema
MindBrain structures a domain around typed entities and canonical sources:

```
entities
  ├── id          (uuid)
  ├── type        (person | task | document | procedure |
  │                constraint | goal | event | company | ...)
  ├── label       (text)
  ├── status      (typed FSM value per ontology)
  ├── facets      (roaring bitmap index, multi-dimensional)
  ├── embedding   (vector via pgvector — Professional)
  ├── search_vec  (tsvector for BM25 — Professional)
  └── updated_at  (timestamptz)

relations
  ├── from_id     (fk → entities.id)
  ├── to_id       (fk → entities.id)
  ├── type        (REQUIRES | BLOCKS | VALIDATES |
  │                DEPENDS_ON | ASSIGNED_TO | ...)
  ├── weight      (float, optional)
  └── created_at  (timestamptz)

projections
  ├── id          (uuid)
  ├── name        (text — named projection definition)
  ├── query_ddl   (text — SQL or graph traversal spec)
  ├── output_type (FACT | GOAL | STEP | CONSTRAINT)
  └── provenance  (jsonb — source entity refs)

ontologies
  ├── id          (uuid)
  ├── name        (text — e.g. CRM, DealFlow, Compliance)
  ├── facet_dims  (jsonb — dimension definitions)
  ├── edge_types  (jsonb — allowed relation types)
  └── fsm_states  (jsonb — valid state transitions)
```

Multiple ontologies coexist on the same MindBrain instance. Cross-ontology joins are native — a query can simultaneously intersect `CRM.warmth` facets, `DealFlow.stage` facets, and a `Knowledge.thesis_supports` graph edge without any LLM in the loop. [ghostcrab](https://www.ghostcrab.be/architecture.html)

***
## GhostCrab — The MCP Server
GhostCrab is the open-source MCP server that sits between your agent and MindBrain. It translates agent tool calls into structured MindBrain operations, exposing the three capabilities (Facettes, Graphes, Projections) as MCP tools any compatible agent can call. It is not a reasoning layer — the agent reasons, GhostCrab provides the structured environment the agent reasons inside. [ghostcrab](https://www.ghostcrab.be/architecture.html)

```
Agent intent
     │
     ▼
GhostCrab MCP tool call
  ├── facettes_filter(domain, facet_map)
  │       └── returns: typed entity subset
  ├── graph_traverse(from, edge_types, max_hops)
  │       └── returns: directed dependency path
  └── projection_pack(projection_name, params)
          └── returns: FACT·GOAL·STEP·CONSTRAINT bundle
```

GhostCrab is open-source and free. It requires no new agent interface — it extends Claude Code, Cursor, OpenClaw, Codex, or any MCP-compatible agent already in use. [ghostcrab](https://www.ghostcrab.be)

***
## Concrete MindBrain / GhostCrab Workflow

The MindBrain path is not "put everything in a graph and hope retrieval works." It is a qualification workflow: model the domain, register or verify the model, import data into that model, then expose deterministic query surfaces to the agent.

```text
1. Model the domain
   ghostcrab_modeling_guidance or ghostcrab_loadout_suggest
   -> entity types, relations, facet dimensions, lifecycle states

2. Verify the model
   ghostcrab_schema_list / ghostcrab_schema_inspect,
   ontology registration tools, ghostcrab_ddl_propose,
   and ghostcrab_workspace_export_model
   -> the agent can see what the workspace means before acting

3. Qualify imported data
   MindBrain Studio or an import path maps source material into records,
   chunks, entities, relations, facets, and projection signals

4. Query after import
   ghostcrab_count / ghostcrab_search / ghostcrab_facet_tree narrow records
   ghostcrab_marketplace / ghostcrab_traverse follow graph structure
   ghostcrab_coverage checks model gaps
   ghostcrab_projection_get / ghostcrab_pack returns compact task context
```

That import step is the concrete difference from a personal brain that compounds from lived experience. GBrain's discipline is entity propagation over time. MindBrain's discipline is data qualification: a meeting note, CRM export, GitHub issue, policy PDF, or endpoint catalog becomes useful only after it is mapped into the workspace ontology with provenance, facets, and graph edges. Once that qualification has happened, the agent does not need to rediscover the shape of the data from prose. It can count, filter, traverse, check coverage, and ask for a projection. [ghostcrab](https://www.ghostcrab.be/architecture.html)

***
## Taxonomy Cost and Expected Gain

The taxonomy cost pays off when imported data becomes a reusable operating surface: filtered, joined, checked for gaps, projected into agent context, and used repeatedly across workflows. It is worth the effort when the domain has durable entities, owners, states, blockers, permissions, valid transitions, or dashboards that need to come from the same source of truth.

It is probably not worth it for a one-off question over a small corpus, or when fuzzy semantic recall is enough. If the user only wants to ask three questions over a folder of documents, a lighter memory or search tool will be faster to set up. MindBrain becomes more attractive when the same imported data must drive repeated action: CRM follow-up, deal review, compliance evidence, incident response, software delivery, legal obligations, or cross-domain agent work.

***
## Why Try MindBrain First
The strongest reason to test MindBrain before a personal memory graph is that many agent problems are not memory problems. They are cross-domain structure problems. A CRM contact, an ERP invoice, a project task, an HR owner, a legal clause, a GitHub PR, an email, and a SEC filing should not all collapse into one remembered note. They belong to different ontologies with different states, dimensions, and relations.

MindBrain can keep those ontologies in one workspace and connect them through meta-ontologies. That makes it possible to ask questions that are usually impossible across application silos: which warm customer is tied to a blocked implementation project, an overdue invoice, an unresolved legal constraint, and a pending engineering PR? The point is not only better retrieval. It is access to relationships that standard app APIs, vector stores, and personal graphs rarely expose as one deterministic query.

MindBrain DDL means **Domain Definition Language**. SQL DDL defines physical storage: tables, columns, and types. MindBrain DDL defines what things mean and how they relate: entity types, facet dimensions, lifecycle states, graph edges, and projections that drive `pg_facets`, `pg_dgraph`, and the rest of the MindBrain stack.

That semantic blueprint can be projected into concrete operating surfaces. A model for SEO audit, financial credit scoring, web delivery, software development, compliance review, or incident response can become an instance used by teams of AI agents. The same projection can feed a dashboard, a kanban board, a graph view, or a compact work queue: Project A is at phase B, task C is attached to PR 123, and Project B is blocked at phase D.

The performance case is equally important. Facet dimensions let MindBrain sort large information spaces in milliseconds. If 10,000 endpoints are registered across 20 MCP servers, the agent should find the four endpoints needed to send an email and schedule a meeting without spending tens of thousands of tokens reading a tool catalog. In the Professional tier, the bitmap architecture is designed for roughly 4.3 billion addressable objects per table. [ghostcrab](https://www.ghostcrab.be/architecture.html)

***
## Head-to-Head: MindBrain vs GBrain
| Dimension | GBrain | MindBrain |
|---|---|---|
| **Core abstraction** | Personal knowledge graph (pages per entity) | Structured domain model (entities, states, ontologies) |
| **Primary use case** | Personal CRM + notes + network memory | Any domain: projects, compliance, CRM, R&D, operations |
| **Storage engine** | PGLite (embedded Postgres, single user) | SQLite (Personal) or PostgreSQL (Professional) |
| **Schema enforcement** | 1,300-line markdown skillpack injected into agent prompt | Typed ontology definitions enforced at DB layer |
| **Memory model** | Compiled truth + append-only timeline per entity | Entities + FSM states + directed relations + projections |
| **Retrieval** | Hybrid: vector + BM25 + backlink-boosted graph | Hybrid: roaring bitmaps + BM25 + pgvector + graph traversal |
| **Graph edges** | 5 types (works_at, founded, invested_in, advises, attended) | Unlimited typed edges per ontology (REQUIRES, BLOCKS, VALIDATES, DEPENDS_ON, …) |
| **Multi-ontology** | Single knowledge plane | Multiple parallel ontologies, cross-domain joins native |
| **Autonomous cycle** | Dream cycle (nightly: ingest, repair, enrich, consolidate) | Projections (pre-computed, query-time — no nightly cycle) |
| **Agent interface** | 30+ MCP tools | GhostCrab MCP (Find · Follow · Pack) |
| **Target user** | Individual power user (Garry Tan's personal brain) | Teams, enterprises, any structured domain |
| **Schema disciplinarian** | Agent reads the skillpack markdown | Database layer + ontology definitions |
| **Open source** | MIT, GitHub | GhostCrab open-source; MindBrain Personal free |

***
## The Structural Difference in One Sentence
GBrain is a **self-wiring personal knowledge graph** that gets smarter as you sleep — its intelligence lives in accumulated ingest, entity propagation, and nightly repair cycles. MindBrain is a **structured agentic database** that makes any domain navigable in real time — its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time. [ghostcrab](https://www.ghostcrab.be/architecture.html)



***

# MindBrain Query Catalog — Garry Tan Agent Queries
## Natural language queries for OpenClaw & Hermes-Agent → MindBrain projections, kanban views, and cross-ontology joins

***

## How It Works

Each query below maps to a named MindBrain resolution path. The agent parses the natural language intent, selects the appropriate projection or query strategy, applies dynamic filter parameters, and returns a typed result set. No chain-of-thought inference at query time — PostgreSQL bitmap intersection + graph traversal, fully deterministic.

**note** that DDL projections could be used as stream of JSON to replace or enhance the heartbeat in OpenClaw.

***

## PART 1 — Report Projections (DDL)

### Portfolio & Deal Reports

**Query 1**
> *"Give me a full portfolio health snapshot. Flag any CEO I haven't talked to in more than 60 days."*

- Ontologies: `DealFlow` × `CRM.warmth`
- Projection: `project_portfolio_health(cold_threshold_days := 60)`
- Returns: `company, ceo_entity, last_contact_date, days_cold, open_action_items, co_investor_activity, last_valuation_signal`

***

**Query 2**
> *"What deals moved stage this week? Who introduced each one?"*

- Ontologies: `DealFlow.fsm` × `Graph.introduced_by`
- Projection: `project_deal_funnel_delta(since := current_date - 7)`
- Returns: `company, from_stage, to_stage, trigger_event, introducer_entity, sector_facets, batch_facet`

***

**Query 3**
> *"List every AI infrastructure deal in diligence right now with check size under $2M, sorted by intro date."*

- Ontologies: `DealFlow` + facets: `sector + stage + check_size`
- Projection: `project_pipeline`
- Returns: `company, stage, check_size, intro_date, sector_facets, assigned_partner`
- SQL: `WHERE stage = 'in_diligence' AND sector_facets @> ARRAY['ai_infra'] AND check_size_max < 2000000 ORDER BY intro_date ASC`

***

**Query 4**
> *"Show me every company where Sequoia is a co-investor that I've also touched, with deal status."*

- Ontologies: `DealFlow` × `Graph.co_invested_with`
- Projection: `project_coinvestor_overlap(firm := 'Sequoia Capital')`
- Returns: `company, garry_status, sequoia_round, shared_deal_count, co_intro_path`

***

### Network & Relationship Reports

**Query 5**
> *"Who were warm contacts 90 days ago that are now cold? Rank by influence score."*

- Ontologies: `CRM.warmth` × `Influence.score`
- Projection: `project_network_decay(snapshot_days_ago := 90) ORDER BY influence_score DESC`
- Returns: `person, warmth_then, warmth_now, days_cold, twitter_reach, last_interaction_type`

***

**Query 6**
> *"Give me a co-investor affinity matrix — which firms consistently show up next to my checks?"*

- Ontologies: `DealFlow` × `Graph.co_invested_with`
- Projection: `project_syndicate_affinity ORDER BY shared_deal_count DESC`
- Returns: `firm, shared_deals, sector_overlap_facets, avg_check_size, last_co_deal_date`

***

**Query 7**
> *"Who in my network advises more than two of my portfolio companies but isn't formally on any cap table?"*

- Ontologies: `CRM` × `Graph.advised_by` × `Graph.invested_in`
- Projection: `project_shadow_advisors(min_portfolio_advises := 2)`
- Returns: `person, advised_companies[], cap_table_presence, warmth_facet, intro_path`

***

### Knowledge & Thesis Reports

**Query 8**
> *"Trace how the 'AI-native ERP' thesis developed. Which meeting seeded it, who reinforced it, which companies validated or killed it?"*

- Ontologies: `Knowledge` × `Graph.thesis_supports`
- Projection: `project_thesis_genealogy(thesis_slug := 'ai-native-erp')`
- Returns: `origin_event, reinforcing_persons[], validating_companies[], contradicting_evidence[], timeline_asc`

***

**Query 9**
> *"Which of my active thesis notes contradict each other? Show tension weight."*

- Ontologies: `Knowledge` × `Graph.contradicts`
- Projection: `project_thesis_tensions ORDER BY tension_weight DESC`
- Returns: `idea_a, idea_b, tension_weight, shared_entities[], last_updated`

***

## PART 2 — Kanban Views

### Deal Pipeline Kanban

> *"Show me my deal pipeline as a kanban. I want to see what's moving."*

- Ontologies: `DealFlow.fsm`
- Projection: `project_pipeline` grouped by FSM stage
- Columns mapped to facet values:

| Column | Stage value | Filter example |
|---|---|---|
| Sourced | `sourced` | All sectors |
| Intro Pending | `intro_pending` | With introducer entity |
| In Diligence | `in_diligence` | With check_size + sector |
| Term Sheet | `term_sheet` | With co-investor refs |
| Closed / Passed | `closed` or `passed` | With close_date + outcome |

Each card surfaces: `company, sector_facets, batch_facet, check_size, warmth of founder, intro path`.

***

### Relationship Warmth Kanban

> *"Give me my network as a warmth kanban. Focus on founders and investors."*

- Ontologies: `CRM.warmth` × `Influence.score`
- Projection: `project_warmth_kanban(role_filter := ['founder','investor'])`
- Columns mapped to warmth facets:

| Column | Warmth value | Threshold |
|---|---|---|
| Warm | `warm` | Last contact < 30 days |
| Lukewarm | `lukewarm` | 30–90 days |
| Cold | `cold` | 90–365 days, ranked by influence |
| Dormant | `dormant` | > 1 year |

***

### YC Batch Density Kanban

> *"Show me my YC batch coverage as a kanban — one column per batch, current and last 4."*

- Ontologies: `DealFlow` × `CRM` × `Graph.batch_peer`
- Projection: `project_batch_density(batches := ['W24','S24','W25','S25','W26'])`
- Each card: `founder, company, stage, warmth_facet, invested_or_not`
- Column header metrics: `total_known / total_batch / invested_count`

***

### Portfolio Action Queue Kanban

> *"Give me a CEO action queue — who needs attention, what's the next step, what's blocking."*

- Ontologies: `DealFlow.portfolio` × `CRM.warmth` × `Events.action_items`
- Projection: `project_ceo_action_queue`
- Columns: `No Action Needed` / `Ping Due` / `Intro to Make` / `Update Overdue` / `Escalate`
- Card fields: `ceo_entity, company, days_cold, open_action_items[], last_valuation_signal`

***

## PART 3 — CRM Ontology Queries (Facets + Graph)

**Query 1**
> *"Who are the top 10 warm investors I should reconnect with this week, ranked by YC batch overlap?"*

- Resolution: `bitmap(warmth IN [warm, lukewarm]) AND bitmap(role=investor)` → rank by `batch_peer` edge count → top 10

***

**Query 2**
> *"Find everyone who worked at Google before founding a company and who I haven't talked to in over 2 months."*

- Resolution: `graph.traverse(org='Google', edge='works_at', historical=true)` INTERSECT `bitmap(role=founder)` INTERSECT `bitmap(warmth=cold)`

***

**Query 3**
> *"Show me all advisors in my network who advised a company that later got acquired. Include the acquirer."*

- Resolution: `graph.traverse(edge='advised_by')` JOIN `project_portfolio WHERE portfolio_status='acquired'` → include acquirer entity via M&A event

***

**Query 4**
> *"Who introduced the most people into my network this year who later became warm contacts?"*

- Resolution: `COUNT(graph.introduced_by) WHERE introduced_entity.warmth IN ('warm','lukewarm') AND intro_date >= current_year GROUP BY introducer ORDER BY count DESC`

***

**Query 5**
> *"Which portfolio CEOs are warm but haven't been on my calendar in the last 30 days?"*

- Resolution: `bitmap(role=portfolio_ceo) AND bitmap(warmth=warm)` MINUS `entities_in(event_type=meeting, event_date >= now()-30d)`

***

**Query 6**
> *"List all founders in my network who are at Series A or later and who I originally met in a YC batch context."*

- Resolution: `bitmap(role=founder) AND bitmap(stage IN [series_a, growth])` INTERSECT `graph.batch_peer(garry_node)` → filter `first_meeting_context='yc_batch'`

***

## PART 4 — DealFlow Ontology Queries

**Query 1**
> *"What did I invest in this quarter? Group by sector and show co-investors."*

- Resolution: `project_pipeline WHERE stage='closed' AND close_date >= date_trunc('quarter', now()) GROUP BY sector_facets` WITH co_investor edges

***

**Query 2**
> *"Which sourced companies have been stuck in sourced for more than 3 weeks without an intro being made?"*

- Resolution: `project_pipeline WHERE stage='sourced' AND stage_since < now()-21d AND NOT EXISTS(intro_event)`

***

**Query 3**
> *"Show all defense tech deals regardless of stage, with founder backgrounds and who in my network knows them."*

- Resolution: `bitmap(sector=defense_tech)` → JOIN founder entities → `graph.shortest_path(garry, founder, max_hops=2)`

***

**Query 4**
> *"Which passed deals from last year turned out to be big wins for other investors? Flag the ones I should re-evaluate."*

- Resolution: `project_pipeline WHERE stage='passed' AND passed_date >= now()-365d` JOIN `press_coverage_events WHERE sentiment='positive' AND valuation_signal='up'`

***

**Query 5**
> *"Which YC W25 companies haven't received a check from me but have 2+ mutual connections I'm warm with?"*

- Resolution: `bitmap(batch=W25)` MINUS `entities_in(invested_in, garry)` → filter `COUNT(shared_warm_connections) >= 2`

***

**Query 6**
> *"Give me the full history of how Ferrum AI moved through my pipeline — every event, email, meeting, tweet that touched it."*

- Resolution: `event_ledger WHERE entity_refs @> ARRAY['ferrum_ai'] ORDER BY event_date ASC` → include `graph.sourced_from` + FSM transitions

***

**Query 7**
> *"What's my check size distribution this year across sectors? Am I over- or under-indexed vs my stated thesis?"*

- Resolution: `project_deal_distribution(year := current_year)` JOIN `knowledge.thesis_weights` → compute delta per sector

***

## PART 5 — Influence Ontology Queries

**Query 1**
> *"Who are the 20 highest-reach people in my cold or dormant contacts that I should reactivate for a YC announcement?"*

- Resolution: `bitmap(warmth IN [cold, dormant])` → rank by `influence_score DESC` → top 20 → enrich with `preferred_channel`

***

**Query 2**
> *"Which portfolio founders have more than 100K Twitter followers but haven't tweeted about YC in the last 6 months?"*

- Resolution: `bitmap(role=portfolio_ceo) AND bitmap(twitter_reach > 100000)` MINUS `entities_mentioned_in(event_type=tweet, topic='yc', date >= now()-180d)`

***

**Query 3**
> *"Show me the shortest warm path from me to a specific founder I want to reach."*

- Resolution: `graph.shortest_path(source=garry, target=:founder, edge_filter=warmth IN ['warm','lukewarm'], max_hops=3)` → return path with intro context

***

**Query 4**
> *"Which portfolio companies have the lowest press coverage relative to their funding stage?"*

- Resolution: `project_portfolio` JOIN `COUNT(graph.press_covered)` → normalize by `stage_median_press_count` → bottom quartile

***

**Query 5**
> *"Who in my network co-amplified my posts this year but isn't currently warm?"*

- Resolution: `entities_in(event_type IN [retweet, quote_tweet], source=garry, date >= current_year)` INTERSECT `bitmap(warmth IN [cold, dormant])` → sort by `amplification_count DESC`

***

## PART 6 — Knowledge Ontology Queries

**Query 1**
> *"Which investment theses have the most validating companies right now, and which have the most contradiction signals?"*

- Resolution: `SELECT thesis, COUNT(validating_companies), COUNT(contradicting_evidence) FROM project_thesis_scoreboard ORDER BY validation_strength DESC`

***

**Query 2**
> *"What ideas did I generate from meetings this quarter? Link each one to the person who sparked it."*

- Resolution: `event_ledger WHERE event_type='meeting' AND date >= quarter_start` → JOIN `knowledge.fact_store WHERE origin_event_id = event.id` → enrich with person entity

***

**Query 3**
> *"Show me all ideas I've written that reference both 'AI agents' and 'enterprise software' — group by recency."*

- Resolution: `knowledge.fact_store WHERE entity_refs @> ARRAY['ai_agents', 'enterprise_software'] ORDER BY created_at DESC` → group by month

***

**Query 4**
> *"Which of my written frameworks have never been tested against a real portfolio company?"*

- Resolution: `knowledge.entity_registry WHERE type='framework'` MINUS `frameworks_with_outgoing(graph.thesis_supports)` → label as `untested_hypothesis`

***

**Query 5**
> *"Which people contributed the most to my written ideas — via meetings, voice calls, or emails?"*

- Resolution: `knowledge.fact_store GROUP BY origin_person_entity` → `COUNT(idea_attributions)` JOIN `crm.warmth` → `ORDER BY attribution_count DESC`

***

## PART 7 — Cross-Ontology Joins

These queries are structurally unreachable by GBrain in a single pass. Each requires bitmap intersection + graph traversal across two or more disjoint ontology schemas. Zero LLM inference at query time — fully deterministic PostgreSQL.

### 2-Ontology Joins

| Natural query | Ontologies | Resolution |
|---|---|---|
| *"Find all seed-stage AI infra founders who are currently cold contacts."* | DealFlow × CRM | `bitmap(sector=ai_infra, stage=seed, role=founder) AND bitmap(warmth=cold)` |
| *"Which active portfolio CEOs appear in my personal knowledge notes as examples of a specific thesis?"* | DealFlow × Knowledge | `bitmap(status=active_portfolio)` INTERSECT `knowledge.fact_store.entity_refs` |
| *"Who are my warm contacts who also co-invested in any of my existing portfolio companies?"* | CRM × DealFlow | `bitmap(warmth IN [warm,lukewarm])` INTERSECT `graph.co_invested_with(portfolio_companies)` |
| *"Show me all my theses that predict a sector where I haven't yet invested."* | Knowledge × DealFlow | `knowledge.thesis.predicted_sectors` MINUS `dealflow.invested_sector_facets` |
| *"Which high-influence people in my network have never been connected to any deal I've looked at?"* | Influence × DealFlow | `bitmap(influence_score > 7.0)` MINUS `entities_in(dealflow.any_event)` → sort by influence DESC |

***

### 3-Ontology Joins

| Natural query | Ontologies | Resolution |
|---|---|---|
| *"Find AI infra seed founders who are cold contacts AND were mentioned in a meeting this quarter."* | DealFlow × CRM × Events | `bitmap(sector=ai_infra, stage=seed, role=founder, warmth=cold)` INTERSECT `entities_mentioned_in(meetings, this_quarter)` |
| *"Which portfolio companies are validated by one of my theses AND have a founder who is currently cold?"* | DealFlow × Knowledge × CRM | `portfolio WITH graph.thesis_supports` JOIN `founder_entity WHERE warmth_facet=cold` |
| *"Show me high-influence cold founders in defense or biotech that a warm contact introduced within the last 18 months."* | Influence × CRM × DealFlow | `bitmap(sector IN [defense,biotech]) AND bitmap(warmth=cold) AND bitmap(influence_score>6)` INTERSECT `graph.introduced_by WHERE intro_date >= now()-18mo AND introducer.warmth IN ['warm','lukewarm']` |
| *"Who is 2 hops from me via co-investment and also advises a defense company I haven't looked at yet?"* | DealFlow × CRM × Graph | `graph.traverse(co_invested_with, hops=2)` INTERSECT `graph.advised_by(sector=defense)` MINUS `bitmap(touched_by_garry)` |
| *"Which of my personal idea notes were generated from a meeting with someone who later became a portfolio CEO?"* | Knowledge × Events × DealFlow | `knowledge.fact_store JOIN origin_event(type=meeting) JOIN person_entity WHERE person later has role_facet=portfolio_ceo` |


## Closing Thoughts

The comparison between GBrain and MindBrain ultimately converges on a practical question: how hard is it to go from zero to a working structured agent environment?

For GBrain, the answer is: install the tool, then spend months building disciplined habits — one entity at a time, one meeting at a time, one dream cycle at a time. The intelligence accumulates gradually and personally. That is its strength and its constraint.

For MindBrain, the answer is more explicit. Modeling a domain as a set of typed ontologies — CRM, DealFlow, Knowledge, Compliance, or any custom domain — should not require writing schema from scratch or reverse-engineering the right structure by trial and error. GhostCrab gives the agent modeling and inspection surfaces: `ghostcrab_modeling_guidance`, `ghostcrab_loadout_suggest`, `ghostcrab_schema_inspect`, `ghostcrab_ddl_propose`, and `ghostcrab_workspace_export_model`. You describe the domain, entities, relationships, reporting needs, and import sources; the workflow turns that into ontology definitions, edge catalogs, facet dimensions, lifecycle states, and projection definitions ready to qualify data into MindBrain.

The implication is straightforward. The hard part of structured agentic databases has never been the database — it has been the ontology design: knowing which entity types to define, which facet dimensions matter, which graph edges are worth modeling, which projections to precompute. GhostCrab turns that design process into a collaborative agent conversation rather than a blank-page architecture exercise.

GBrain gives you a brain that wires itself from lived experience. MindBrain gives you a brain that is structured from day one, then made useful through Studio or import qualification and queried through GhostCrab's facet, graph, coverage, and projection surfaces.
