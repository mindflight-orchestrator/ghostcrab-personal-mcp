# GhostCrab Integration

This document explains how `ghostcrab-skills` expects to connect to the `ghostcrab` product repo, including the embedded local mirror used in this workspace.

## Dependency Direction

- `ghostcrab-skills` depends on GhostCrab only through MCP connection settings
- `ghostcrab` does not import or load files from `ghostcrab-skills`

There is no code dependency between the two repos.

## Expected Runtime

The client integrations in this repo assume a GhostCrab MCP server that exposes the public `ghostcrab_*` tool surface over stdio.

Typical local dev flow:

1. build and validate GhostCrab in the product repo
2. start PostgreSQL and run migrations
3. point `.mcp.json` or OpenClaw MCP config at that GhostCrab server
4. load one demo project from `shared/demo-profiles/*.jsonl`
5. use `shared/bootstrap_seed.jsonl` only if you explicitly want the aggregate combined view
6. for OpenClaw setup and rehearsals, see [openclaw/README.md](./openclaw/README.md) and the prompts under `openclaw/scenarios/`

Before any live client hookup, run the local preflight validator from this repo:

```bash
npm run validate
npm run validate:strict
```

This catches repository-shape mistakes early, but it does not claim that Claude Code or OpenClaw have accepted the configs yet.

Use the two modes intentionally:

- `npm run validate` for fast local feedback
- `npm run validate:strict` for inter-repo compatibility and CI-grade gating

## Embedded Local Workspace

This local copy is embedded inside the product repo, so the product root is `..`:

```bash
cd ..
npm run build
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab node dist/index.js
```

If you later move this integration repo back out as a sibling checkout, update the relative links and validator path resolution accordingly.

If GhostCrab is later published as a package, the client configs in this repo can also be switched to:

```bash
npx -y @mindflight/ghostcrab
```

## Versioning Guidance

Keep the two repos aligned by convention:

- `ghostcrab-skills` should document the expected GhostCrab surface version
- changes to public `ghostcrab_*` contracts should be reflected here in the same cycle
- changes to global onboarding behavior should also be reflected here in:
  - `shared/ONBOARDING_CONTRACT.md` (canonical; update this first)
  - `SERVER_INSTRUCTIONS.md`
  - `MCP_TOOL_DESCRIPTION_PATCHES.md`
  - `CAPABILITIES.md`
- demo seed profiles should remain additive and optional

## Seed Ownership

Portable seed definitions live in this repo because they are part of the demo and onboarding story.

Canonical product bootstrap remains owned by the `ghostcrab` repo.

Use the following distinction:

- product bootstrap = always-on, canonical, self-description of GhostCrab
- demo seed = opt-in, scenario-driven, user-facing examples

In this repo:

- `shared/demo-profiles/*.jsonl` are the canonical demo project files
- `shared/bootstrap_seed.jsonl` is the generated aggregate artifact for compatibility and quick inspection
- `openclaw/scenarios/*.md` are guided and semi-autonomous rehearsal scripts for live OpenClaw sessions

## Current Assumption

The current starter files assume:

- local PostgreSQL at `localhost:5432`
- database name `ghostcrab`
- public MCP server name `ghostcrab`

Adjust `DATABASE_URL` and the command path as needed for your environment.

## V1 Cross-Surface Contract

The internal skill mirror is expected to keep the same V1 contract across Codex, Claude Code, Cursor, and OpenClaw:

- first-turn fuzzy onboarding stays intake-only
- product language comes before schema language
- compact recovery views are recommended before custom structure
- long-running work ends with checkpoints
- meaningful current-state changes preserve transition rationale when recovery would suffer without it
