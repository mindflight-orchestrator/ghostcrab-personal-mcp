<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# https://www.ghostcrab.be/

GhostCrab MCP integration. Personal (SQLite) in the OpenClaw framework.

Do not explain what GhostCrab is (I build it, so I already know).

Explain the steps to integrate it officially with OpenClaw so it can be announced as a GitHub PR.

Here is the necessary information. Full procedure below.

## Integrating GhostCrab MCP with OpenClaw: procedure for an official PR

In OpenClaw, third-party integrations go through the **Skills** system published on **ClawHub** (`clawhub.ai`), not through a direct PR to the main repository [^1_1]. The procedure has two phases: build a valid Skill, then publish it on ClawHub.

***

## Phase 1: Build the GhostCrab Skill

### Folder structure

```
ghostcrab-mcp/
├── SKILL.md          ← required, with YAML frontmatter
├── README.md
└── scripts/          ← add if you need helper scripts
```


### `SKILL.md` — required frontmatter

The frontmatter must use the `clawdbot` field (not `openclaw`) [^1_2] :

```yaml
---
name: ghostcrab-mcp
version: 1.0.0
description: "MCP server for ontology-based structured database via GhostCrab"
homepage: https://github.com/ton-org/ghostcrab-mcp
requires:
  env:
    - GHOSTCRAB_URL
    - GHOSTCRAB_TOKEN        # optional if authentication is required
files:
  - scripts/
---
```


### `SKILL.md` body — required sections

ClawHub’s scanner checks these four sections [^1_2] :

- **External Endpoints** — table of every URL called and data sent
- **Security \& Privacy** — what leaves the machine, what does not
- **Model Invocation Note** — how the agent invokes the server autonomously
- **Trust Statement** — `"By using this skill, data is sent to ghostcrab.be. Only install if you trust this endpoint."`

***

## Phase 2: Register the MCP server in OpenClaw

In the `SKILL.md` body, include the MCP configuration the agent should load [^1_3] :

```json
{
  "mcp": {
    "servers": {
      "ghostcrab": {
        "url": "https://www.ghostcrab.be/mcp",
        "transport": "streamable-http",
        "headers": {
          "Authorization": "Bearer ${GHOSTCRAB_TOKEN}"
        }
      }
    }
  }
}
```

If GhostCrab exposes a stdio server (local binary), use the `command`/`args` form [^1_3] :

```json
{
  "command": "ghostcrab-mcp",
  "args": ["--db", "${GHOSTCRAB_DB_PATH}"]
}
```

For SQLite specifically — OpenClaw uses SQLite natively for its memory layer [^1_4]. OpenClaw `sqlite` config aligns with `command` plus path to the `.db` file.

***

## Phase 3: Publish on ClawHub and open the PR

### Publish the skill

```bash
npm i -g clawhub
clawhub login          # authentification GitHub requise (compte > 1 semaine)
clawhub skill publish ./ghostcrab-mcp \
  --slug ghostcrab-mcp \
  --name "GhostCrab MCP" \
  --version 1.0.0 \
  --changelog "Initial release"
```


### Add to `awesome-openclaw-skills` (community PR)

The `VoltAgent/awesome-openclaw-skills` repository is the list the community sees [^1_5]. To get listed :

1. Fork `github.com/VoltAgent/awesome-openclaw-skills`
2. Add an entry in the appropriate category (Database / Knowledge Graph) :

```
- [GhostCrab MCP](https://clawhub.ai/ton-slug/ghostcrab-mcp) — Ontology-based structured database MCP server ([GitHub](https://github.com/ton-org/ghostcrab-mcp))
```

3. Open a PR that includes **both** the ClawHub link and the GitHub link [^1_5]

> **Critical note**: the main `openclaw/openclaw` repository does not accept PRs for new features — those must stay third-party plugins [^1_1]. The real community entry point is ClawHub + `awesome-openclaw-skills`.

***

## Pre-submission checklist

- [ ] Frontmatter uses `clawdbot` (not `openclaw`)
- [ ] `requires.env` lists every environment variable in use
- [ ] All four required sections present in `SKILL.md`
- [ ] No hardcoded secrets in scripts
- [ ] Shell scripts use `set -euo pipefail` where applicable
- [ ] Run `clawhub skill rescan <slug>` if publication is pending scanner review [^1_6]
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://github.com/openclaw/openclaw/blob/main/CONTRIBUTING.md

[^1_2]: https://gist.github.com/adhishthite/0db995ecfe2f23e09d0b2d418491982c

[^1_3]: https://docs.openclaw.ai/cli/mcp

[^1_4]: https://www.clawbot.blog/blog/openclaw-the-open-source-ai-agent-framework-complete-setup-guide/

[^1_5]: https://github.com/VoltAgent/awesome-openclaw-skills

[^1_6]: https://docs.openclaw.ai/clawhub

[^1_7]: https://www.youtube.com/watch?v=78a6YL3EX8s

[^1_8]: https://github.com/freema/openclaw-mcp

[^1_9]: https://clawtank.dev/blog/openclaw-mcp-server-integration

[^1_10]: https://fast.io/resources/openclaw-mcp-setup/

[^1_11]: https://www.openclawplaybook.ai/guides/how-to-use-openclaw-with-mcp-servers/

[^1_12]: https://github.com/openclaw/openclaw/pulls

[^1_13]: https://www.clawbot.blog/blog/what-is-openclaw-the-ai-agent-framework-explained/

[^1_14]: https://github.com/freema/openclaw-mcp/blob/main/README.md

[^1_15]: https://github.com/freema/openclaw-mcp/pkgs/container/openclaw-mcp

[^1_16]: https://skywork.ai/skypage/en/openclaw-mcp-server-configuration/2037085105109602304

[^1_17]: https://composio.dev/toolkits/github/framework/openclaw

[^1_18]: https://www.freecodecamp.org/news/how-to-build-and-secure-a-personal-ai-agent-with-openclaw/

[^1_19]: https://github.com/freema/openclaw-mcp/blob/main/docs/configuration.md

[^1_20]: https://github.com/openclaw/openclaw/issues/12535

[^1_21]: https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md

[^1_22]: https://www.tencentcloud.com/techpedia/141210

[^1_23]: https://samterminal.com/docs/openclaw-skills

[^1_24]: https://github.com/openclaw/openclaw

[^1_25]: https://www.meta-intelligence.tech/en/insight-openclaw-skills

[^1_26]: https://www.tencentcloud.com/techpedia/139672

[^1_27]: https://www.pulsemcp.com/posts/newsletter-openclaw-goes-viral-mcp-apps-release-agentic-coding-accelerating

[^1_28]: https://www.datacamp.com/es/tutorial/building-open-claw-skills

[^1_29]: https://github.com/openclaw/clawhub


---

# For SQLite specifically — OpenClaw uses SQLite natively for its memory layer [^2_2]. OpenClaw `sqlite` config aligns with `command` plus path to the `.db` file.

How to explain that GhostCrab MCP uses MindBrain on SQLite and can replace OpenClaw’s local SQLite memory?

Everything needed below. OpenClaw’s memory context is well documented — here is how to position GhostCrab as a replacement.

## Positioning GhostCrab MCP as an alternative memory backend

The pitch rests on one architectural fact: OpenClaw exposes a **memory plugin slot** (`plugins.slots.memory`) that can accept any backend, and the default engine is SQLite [^2_1]. GhostCrab therefore does not attach as “one more tool” but as a **direct replacement** for that backend.

***

## What OpenClaw does by default

OpenClaw stores memory in two layers: Markdown files (`MEMORY.md`, `memory/YYYY-MM-DD.md`) as human-readable source of truth, and a **per-agent SQLite index** at `~/.openclaw/memory/<agentId>.sqlite` for search [^2_2]. That SQLite supports FTS5 (BM25), vector search via `sqlite-vec`, and hybrid retrieval [^2_2]. It works, but it is flat — an index, not a structured graph.

***

## Replacement argument

**What MindBrain adds that native SQLite does not:**

- **Faceted memory** — memories are tagged and filterable by facets (project, entity, timeline), whereas raw SQLite is only indexed text
- **Relationship graph** — stored entities link via `pg_dgraph`, enabling queries like *“all decisions tied to this project, by whom and when”* — impossible with a flat index
- **Structured cross-agent persistence** — memory is no longer siloed in `agentId.sqlite` but shareable across agents under one ontology schema

Straightforward wording for your `SKILL.md`:

> *GhostCrab MCP provides a drop-in replacement for OpenClaw's built-in SQLite memory slot. Instead of a flat keyword/vector index, agents read and write to a structured ontology backend (MindBrain) that supports faceted recall, entity graphs, and cross-agent memory sharing — without leaving your local stack.*

***

## Practical configuration in OpenClaw

OpenClaw lets you disable the native memory slot and load an external one [^2_1] :

```json
{
  "plugins": {
    "slots": {
      "memory": "none"
    }
  },
  "mcp": {
    "servers": {
      "ghostcrab": {
        "url": "http://localhost:PORT/mcp",
        "transport": "streamable-http"
      }
    }
  }
}
```

The agent loses native `memory_search` and `memory_get` but gains GhostCrab’s MCP tools — which should cover the same primitives (`search`, `get`, `write`) so the Skill stays transparent [^2_3].

***

## What to include in the Skill

For OpenClaw to accept GhostCrab as a transparent backend, `SKILL.md` must document that GhostCrab exposes **at minimum** MCP tools equivalent to the native primitives :


| Native OpenClaw tool | GhostCrab MCP equivalent |
| :-- | :-- |
| `memory_search` | `ghostcrab_search` (faceted + vector) |
| `memory_get` | `ghostcrab_get` (by entity/path) |
| *(implicit writes)* | `ghostcrab_write` (with ontology) |

Announcement-ready value proposition: **"structured memory backend for OpenClaw — replaces the flat SQLite index with a faceted ontology store while keeping the agent's local-first posture"** [^2_2][^2_1].
<span style="display:none">[^2_10][^2_4][^2_5][^2_6][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://onepagecode.substack.com/p/openclaw-cli-commands-the-complete

[^2_2]: https://docs.openclaw.ai/fr/concepts/memory-builtin

[^2_3]: https://docs.openclaw.ai/fr/concepts/memory

[^2_4]: https://www.pingcap.com/blog/local-first-rag-using-sqlite-ai-agent-memory-openclaw/

[^2_5]: https://flypix.ai/fr/openclaw-what-is-it/

[^2_6]: https://www.volteyr.com/ressources/insights/openclaw-agent-ia-open-source

[^2_7]: https://repovive.com/roadmaps/openclaw/skills-memory-automation/vector-search-with-sqlite-vec

[^2_8]: https://www.cometapi.com/fr/moltbot-clawdbot--setup-guide-api-hosting-tutorial/

[^2_9]: https://lobehub.com/fr/mcp/spences10-mcp-memory-sqlite

[^2_10]: https://www.datacamp.com/fr/tutorial/openclaw-ollama-tutorial


---

# What to cover in the Skill

For OpenClaw to accept GhostCrab as a transparent backend, `SKILL.md` must document that GhostCrab exposes at minimum MCP tools equivalent to the native primitives :

Task : write full skills ensuring replacement of OpenClaw internal memory with MindBrain SQLite via GhostCrab.

The file is ready. Below is what was produced and why each section exists.

## Structure of the produced `SKILL.md`

### YAML frontmatter

The `---` block has the mandatory fields for ClawHub [^3_1], with two critical additions for memory replacement :

```yaml
openclaw:
  memoryBackend: external
  disablesBuiltin:
    - memory-core
  slots:
    memory: ghostcrab
```

`disablesBuiltin: [memory-core]` explicitly tells OpenClaw this Skill **disables** the native plugin [^3_2].

### The four mandatory ClawHub sections

All present and written precisely [^3_1] :

- **External Endpoints** — URL / transport / data / notes table
- **Security \& Privacy** — what leaves (nothing by default), what stays local
- **Model Invocation Note** — the three tools the agent calls autonomously
- **Trust Statement** — required canonical wording


### Tool mapping table

The **Tool Mapping** section is the core of positioning [^3_2] :


| Native OpenClaw | GhostCrab MCP | Notes |
| :-- | :-- | :-- |
| `memory_search` | `ghostcrab_search` | + `facets`, `entity`, `project` filters |
| `memory_get` | `ghostcrab_get` | by path or UUID |
| *(implicit flush)* | `ghostcrab_write` | called during dreaming |

### Complete OpenClaw config

`plugins.slots.memory: "none"` turns off the native SQLite backend [^3_3]. The `mcp.servers.ghostcrab` block registers GhostCrab as an MCP server with streamable-http transport [^3_4].

### Dreaming integration

The **Dreaming Phase Integration** section covers consolidation of long-term memory overnight [^3_2] — `ghostcrab_write` with `long_term: true` lets MindBrain apply its own ontology promotion rules alongside OpenClaw scoring.

***

**Before publishing:** replace `<your-org>` in `repository:` and add MindBrain docs + ClawHub listing links at the bottom of the file.

<div align="center">⁂</div>

[^3_1]: https://gist.github.com/adhishthite/0db995ecfe2f23e09d0b2d418491982c

[^3_2]: https://docs.openclaw.ai/fr/concepts/memory

[^3_3]: https://docs.openclaw.ai/fr/concepts/memory-builtin

[^3_4]: https://docs.openclaw.ai/cli/mcp


---

# Draft OpenClaw `Skill.md` ghostcrab-architect for Claude Code and Codex. American English. Goal: create an ontology via GhostCrab MCP onboarding.

451 lines, no empty placeholders. Logic of each block below.

## What this `SKILL.md` does

### Six-phase protocol

The core is **Agent Instructions — Ontology Onboarding Protocol**. It encodes the flow from ghostcrab.be: the agent does not receive a finished schema — it runs a structured interview phase by phase, one question at a time. MCP calls fire on each user confirmation, not in batch.[^4_1][^4_2]


| Phase | What happens | Primary MCP tool |
| :-- | :-- | :-- |
| 0 — Init | Plain-English description → suggested schema | `ghostcrab_schema_suggest` |
| 1 — Entities | Fields, required, facets | `ghostcrab_entity_define` |
| 2 — Stages | Lifecycle, transitions, entry/exit criteria | `ghostcrab_stage_define` |
| 3 — Relationships | Dependencies, ownership, escalations | `ghostcrab_edge_define` |
| 4 — Constraints | Conditional rules, blockers vs warnings | (properties on transitions) |
| 5 — Procedures | Multi-step workflows | `ghostcrab_procedure_define` |
| 6 — Finalization | Validation, gaps, lock | `ghostcrab_schema_validate` + `ghostcrab_schema_apply` |

### Three integrations

- **Claude Code**: `.mcp.json` config + optional slash command in `.claude/commands/`[^4_3]
- **Codex**: `type: "mcp"` block for OpenAI Responses API with exhaustive `allowed_tools` and system prompt addendum
- **OpenClaw**: standard `mcp.servers` in `config.json` + `openclaw skill install`


### Still to customize

Two intentional placeholders: `<your-org>` in `repository:`, and your MindBrain documentation link in **Links**.

<div align="center">⁂</div>

[^4_1]: https://docs.openclaw.ai/fr/concepts/memory-builtin

[^4_2]: https://flypix.ai/fr/openclaw-what-is-it/

[^4_3]: https://composio.dev/toolkits/github/framework/openclaw


---

# Now write a general-purpose `skill.md` for OpenClaw agent activity — e.g. project management or knowledge graph implementation — where agents record and manage status on item progress; where the OpenClaw orchestrator uses PG_Pragma projections to organize and steer agents, know when to restart them, stop them, or move to the next project phase, etc. ghostcrab-runtime

456 lines. What structures the file.

## What this `SKILL.md` covers

### Orchestrator / sub-agent split

`role: both` in frontmatter tells OpenClaw this Skill installs on both sides. It is not two separate Skills — tools are grouped by usage profile in the docs, but every agent loads the same Skill and uses the tools that match its role.[^5_1]

### pg_pragma signals as coordination vocabulary

The **pg_pragma Signal Reference** table is central for the orchestrator. Eight signals cover the coordination states that matter:[^5_2]


| Signal | Trigger | Orchestrator action |
| :-- | :-- | :-- |
| `BLOCKER_RAISED` | New blocker on an entity | Route unblock work |
| `PHASE_EXIT_READY` | All exit criteria met | `ghostcrab_phase_advance` |
| `AGENT_STALLED` | Sub-agent idle N minutes | Restart or retire |
| `MISSING_INFO` | Required field still null | Route to correct sub-agent |
| `DEPENDENCY_CYCLE` | Cycle detected in graph | Escalate or remove an edge |
| `ENTITY_COMPLETED` | Entity in terminal stage | Unblock waiting entities |
| `PHASE_STALLED` | Phase without progress | Inspect or rollback |

### Heartbeat protocol

The five-step protocol defines exactly what the orchestrator does each tick — in order: read urgent signals, check phase progress, build a projection, act, log. Operational in OpenClaw via `heartbeat.enabled: true` and `intervalSeconds`.[^5_2]

### What this Skill does NOT do

Unlike the earlier `ghostcrab-memory` Skill, `ghostcrab-runtime` **does not** disable OpenClaw’s native memory engine. Both layers coexist: OpenClaw keeps `MEMORY.md` for conversational context; GhostCrab holds structured project state. The **Rollback** section states this explicitly.[^5_3]

<div align="center">⁂</div>

[^5_1]: https://flypix.ai/fr/openclaw-what-is-it/

[^5_2]: https://docs.openclaw.ai/fr/concepts/memory-builtin

[^5_3]: https://docs.openclaw.ai/fr/concepts/memory

