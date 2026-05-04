# GhostCrab Skills

`ghostcrab-skills` is the integration repo for GhostCrab clients.

This repository contains:

- Claude Code starter packs
- OpenClaw skill and agent profiles
- shared design rules and portable demo seed data

This repository does not contain:

- the GhostCrab MCP server runtime
- PostgreSQL migrations
- Docker images
- npm package code

Those live in the separate `ghostcrab` product repository. In this embedded workspace, that product repo root is [`..`](..).

## Repository Split

- `ghostcrab` = product runtime, MCP tools, Docker fallback, migrations, bootstrap
- `ghostcrab-skills` = client-facing configuration, prompts, hooks, templates, examples

This split keeps the public product client-agnostic while still shipping opinionated integrations for different agent environments.

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
├── codex/
│   ├── ghostcrab-memory/
│   ├── ghostcrab-prompt-guide/
│   └── ghostcrab-data-architect/
├── claude-code/
│   ├── self-memory/
│   └── data-architect/
├── cursor/
│   ├── README.md
│   └── rules/
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
│   ├── demo-profiles/
│   └── bootstrap_seed.jsonl
├── CAPABILITIES.md
├── SERVER_INSTRUCTIONS.md
├── MCP_TOOL_DESCRIPTION_PATCHES.md
└── GHOSTCRAB_INTEGRATION.md
```

## Quick Start

1. Start a GhostCrab server from the product repo root. In this embedded workspace, that is [`..`](..).
2. Pick one integration entrypoint:
   - **Codex (MCP + skills):** [codex/README.md](./codex/README.md)
   - **OpenClaw (MCP + skills + scenarios):** [openclaw/README.md](./openclaw/README.md)
   - `codex/ghostcrab-memory/`
   - `codex/ghostcrab-prompt-guide/`
   - `codex/ghostcrab-data-architect/`
   - `openclaw/ghostcrab-memory/`
   - `claude-code/self-memory/`
   - `claude-code/data-architect/`
3. Apply the client-specific config files.
4. Pick one demo profile from `shared/demo-profiles/`.
5. Use `shared/bootstrap_seed.jsonl` only when you want the aggregate view of all demo entries.

To inspect the choices quickly from the terminal:

```bash
npm run demo:choose
```

## What Ships First

This initial pass includes:

- Codex-facing skill mirrors with the V1 onboarding contract
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
- external PostgreSQL integration
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
- [openclaw/README.md](./openclaw/README.md)
- [shared/demo-profiles/compliance-audit.jsonl](./shared/demo-profiles/compliance-audit.jsonl)
- [shared/demo-profiles/crm-pipeline.jsonl](./shared/demo-profiles/crm-pipeline.jsonl)
- [shared/demo-profiles/knowledge-base.jsonl](./shared/demo-profiles/knowledge-base.jsonl)
- [shared/demo-profiles/project-delivery.jsonl](./shared/demo-profiles/project-delivery.jsonl)
- [shared/demo-profiles/incident-response.jsonl](./shared/demo-profiles/incident-response.jsonl)
- [shared/demo-profiles/software-delivery.jsonl](./shared/demo-profiles/software-delivery.jsonl)
- [shared/bootstrap_seed.jsonl](./shared/bootstrap_seed.jsonl)
