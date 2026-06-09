# GhostCrab Skills

`ghostcrab-skills` is the integration repo for GhostCrab clients.

This repository contains:

- Claude Code starter packs
- Claude Code on-demand skills
- Cursor selectable skill references
- OpenClaw skill and agent profiles
- shared design rules and portable demo seed data
- pointers to the GhostCrab Personal StarterKit for clonable SOPs and templates
- Personal operator catalog: [docs/reference/operator-catalog.md](../docs/reference/operator-catalog.md)
- Ten cross-IDE skills (five general + five operational) synced via `gcp brain setup`

This repository does not contain:

- the GhostCrab MCP server runtime
- SQLite schema (product repo)
- Docker images
- npm package code

Those live in the separate `ghostcrab` product repository. In this embedded workspace, that product repo root is [`..`](..).

## Repository Split

- `ghostcrab` = product runtime, MCP tools, Docker fallback, migrations, bootstrap
- `ghostcrab-skills` = client-facing configuration, prompts, hooks, templates, examples
- `starter-kit-ghostcrab-perso` = clonable SOPs, project templates, and source-import compiler references

This split keeps the public product client-agnostic while still shipping opinionated integrations for different agent environments.

Canonical starterkit clone URL:

```bash
git clone https://gitlab.com/webigniter/starter-kit-ghostcrab-perso.git
```

## V1 Focus

GhostCrab V1 is intentionally narrow.

This repo currently prioritizes:

- first-turn onboarding quality
- product-language answers instead of schema-first answers
- coherent behavior across Codex, Claude Code, Cursor, and OpenClaw
- compact recovery after a pause

It does not try to solve every domain or every modeling edge case in this first public test pass.

## Layout

```text
ghostcrab-skills/
├── skills/                         # canonical editable SKILL.md sources (10 skills)
│   ├── ghostcrab-memory/
│   ├── ghostcrab-prompt-guide/
│   ├── ghostcrab-data-architect/
│   ├── ghostcrab-integration-sop-editor/
│   ├── mindbrain-comparison-writer/
│   ├── ghostcrab-operator/
│   ├── ghostcrab-evidence-discovery/
│   ├── ghostcrab-projection-reviewer/
│   ├── ghostcrab-gap-auditor/
│   └── ghostcrab-json-answer-builder/
├── codex/
│   └── <skill> -> ../skills/<skill>
├── claude-code/
│   ├── README.md
│   ├── skills/
│   │   └── <skill> -> ../../skills/<skill>
│   ├── self-memory/
│   └── data-architect/
├── cursor/
│   ├── README.md
│   └── skills/<skill> -> ../../skills/<skill>
├── generated/
│   ├── cursor -> ../../bin/ide-skills/cursor/skills
│   ├── codex -> ../../bin/ide-skills/codex/skills
│   └── claude-code -> ../../bin/ide-skills/claude-code/skills
├── openclaw/
│   ├── README.md
│   ├── ghostcrab-memory/
│   ├── ghostcrab-epistemic-agent/
│   └── scenarios/
├── shared/
│   ├── ONBOARDING_CONTRACT.md
│   ├── SCHEMA_DESIGN.md
│   ├── QUERY_PATTERNS.md
│   ├── APP_PATTERNS.md
│   ├── DEMO_CHOOSER.md
│   ├── ARTIFACT_KINDS.md
│   ├── RUNTIME_QUERY_PIPELINE.md
│   ├── MCP_VS_GCP_ROUTING.md
│   ├── IMPORT_CLOSURE_GATES.md
│   ├── GAP_TAXONOMY.md
│   ├── SKILL_ROUTE_MAP_ESSENTIALS.md
│   ├── demo-profiles/
│   └── bootstrap_seed.jsonl
├── CAPABILITIES.md
├── SERVER_INSTRUCTIONS.md
├── MCP_TOOL_DESCRIPTION_PATCHES.md
└── GHOSTCRAB_INTEGRATION.md
```

Edit only `ghostcrab-skills/skills/<skill>/SKILL.md` for all ten GhostCrab skills. The editor-specific paths are symlinks for discoverability, and `bin/ide-skills/` is regenerated from those canonical sources by `pnpm run sync:ide-skills`.

## Ten skills (cross-IDE)

| # | Skill | Category | Install name |
| --- | --- | --- | --- |
| 1 | ghostcrab-memory | General | `ghostcrab-memory` |
| 2 | ghostcrab-prompt-guide | General | `ghostcrab-prompt-guide` |
| 3 | ghostcrab-data-architect | General | `ghostcrab-data-architect` |
| 4 | ghostcrab-integration-sop-editor | General | `ghostcrab-integration-sop-editor` |
| 5 | mindbrain-comparison-writer | General | `mindbrain-comparison-writer` |
| 6 | ghostcrab-operator | Operational | `ghostcrab-operator` |
| 7 | ghostcrab-evidence-discovery | Operational | `ghostcrab-evidence-discovery` |
| 8 | ghostcrab-projection-reviewer | Operational | `ghostcrab-projection-reviewer` |
| 9 | ghostcrab-gap-auditor | Operational | `ghostcrab-gap-auditor` |
| 10 | ghostcrab-json-answer-builder | Operational | `ghostcrab-json-answer-builder` |

**Canonical install:** `gcp brain setup cursor|claude|codex|generic --yes` copies the same ten skills plus shared stubs into `ghostcrab-shared/` next to each skill.

Each skill is **autonomous** at runtime: workflows, guardrails, and output shapes are inline in `SKILL.md`, with links to installed `ghostcrab-shared/` stubs (not repo `docs/`). Operational skills may optionally reference starter-kit delivery SOPs via backtick paths when the user runs a phased import project.

**Out of scope for `gcp brain setup`:** `ghostcrab-projection-visual-report`, `ai-act-projection-interpreter`, OpenClaw agents.

## Quick Start

1. Start a GhostCrab server from the product repo root. In this embedded workspace, that is [`..`](..).
2. Pick one integration entrypoint:
   - **Codex (MCP + skills):** [codex/README.md](./codex/README.md)
   - **Claude Code (skills + starters):** [claude-code/README.md](./claude-code/README.md)
   - **Cursor (MCP + skills):** [cursor/README.md](./cursor/README.md)
   - **OpenClaw (MCP + skills + scenarios):** [openclaw/README.md](./openclaw/README.md)
   - `skills/<skill>/` for common editable skills
   - `openclaw/ghostcrab-memory/`
   - `claude-code/self-memory/`
   - `claude-code/data-architect/`
   - `generated/<editor>/` for symlinked references to generated install bundles
3. Apply the client-specific config files.
4. Pick one demo profile from `shared/demo-profiles/`.
5. Use `shared/bootstrap_seed.jsonl` only when you want the aggregate view of all demo entries.

To inspect the choices quickly from the terminal:

```bash
npm run demo:choose
```

## What Ships First

This initial pass includes:

- Ten identical skills on Cursor, Claude Code, Codex, and generic via `gcp brain setup`
- Shared operational stubs (`ARTIFACT_KINDS`, `RUNTIME_QUERY_PIPELINE`, …) installed as `ghostcrab-shared/`
- Codex-facing skill mirrors with the V1 onboarding contract
- Claude Code on-demand skill mirrors for all ten skills
- Cursor selectable skill mirrors for all ten skills
- a minimal OpenClaw memory skill
- a fuller OpenClaw epistemic agent profile
- a Claude Code self-memory starter
- a Claude Code data-architect starter
- shared schema and query guidance
- portable demo seed profiles for:
  - compliance-audit
  - crm-pipeline
  - knowledge-base
  - project-delivery
  - incident-response
  - software-delivery

The current integration direction also treats these as first-class long-running scenarios:

- multi-phase delivery projects
- external API integration
- external database integration
- environment-specific deployment and recovery

Across all surfaces, the shared V1 onboarding contract is:

1. one short intent hypothesis
2. 2 to 4 clarification questions
3. one likely compact-view recommendation
4. one explicit prompt-help offer

without a first-turn default to:

- `ghostcrab_status`
- `ghostcrab_schema_list`
- schema registration
- file-first fallbacks
- alternate storage proposals
- GhostCrab writes

## Demo Seed Philosophy

The demo seeds in this repo are:

- portable
- profile-driven
- client-neutral
- intentionally small

They are meant to be loaded by GhostCrab tooling later, not treated as part of the canonical product bootstrap.

Canonical source of truth:

- `shared/demo-profiles/*.jsonl` = per-project demo seeds
- `shared/bootstrap_seed.jsonl` = generated aggregate compatibility file

## Validation

Run the local preflight validator before trying a real Claude Code or OpenClaw hookup:

```bash
npm run validate
npm run validate:strict
```

This validator checks:

- required folders and files
- JSON and JSONL syntax
- portable Markdown links
- demo seed shape and profile coherence
- consistency between `shared/demo-profiles/*.jsonl` and `shared/bootstrap_seed.jsonl`
- `ghostcrab_*` tool references against the sibling GhostCrab product repo when present
- explicit compatibility between demo seed profiles and the real `ghostcrab` tool surface

`validate:strict` also:

- requires the sibling GhostCrab product repo to be readable
- promotes warnings to failures
- acts as the CI-grade readiness gate before live client hookup

It does not replace live validation in Claude Code or OpenClaw. It is the intermediate safety rail before those host runtimes are active.

## Docs

- [GHOSTCRAB_INTEGRATION.md](./GHOSTCRAB_INTEGRATION.md)
- [CAPABILITIES.md](./CAPABILITIES.md)
- [SERVER_INSTRUCTIONS.md](./SERVER_INSTRUCTIONS.md)
- [MCP_TOOL_DESCRIPTION_PATCHES.md](./MCP_TOOL_DESCRIPTION_PATCHES.md)
- [shared/SCHEMA_DESIGN.md](./shared/SCHEMA_DESIGN.md)
- [shared/QUERY_PATTERNS.md](./shared/QUERY_PATTERNS.md)
- [shared/APP_PATTERNS.md](./shared/APP_PATTERNS.md)
- [shared/TRANSITION_LOGGING.md](./shared/TRANSITION_LOGGING.md)
- [shared/DEMO_CHOOSER.md](./shared/DEMO_CHOOSER.md)
- [codex/README.md](./codex/README.md)
- [claude-code/README.md](./claude-code/README.md)
- [cursor/README.md](./cursor/README.md)
- [openclaw/README.md](./openclaw/README.md)
- [shared/demo-profiles/compliance-audit.jsonl](./shared/demo-profiles/compliance-audit.jsonl)
- [shared/demo-profiles/crm-pipeline.jsonl](./shared/demo-profiles/crm-pipeline.jsonl)
- [shared/demo-profiles/knowledge-base.jsonl](./shared/demo-profiles/knowledge-base.jsonl)
- [shared/demo-profiles/project-delivery.jsonl](./shared/demo-profiles/project-delivery.jsonl)
- [shared/demo-profiles/incident-response.jsonl](./shared/demo-profiles/incident-response.jsonl)
- [shared/demo-profiles/software-delivery.jsonl](./shared/demo-profiles/software-delivery.jsonl)
- [shared/bootstrap_seed.jsonl](./shared/bootstrap_seed.jsonl)
