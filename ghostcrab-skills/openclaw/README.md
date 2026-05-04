# GhostCrab + OpenClaw

This guide is the dedicated entry point for running **GhostCrab** with **OpenClaw**: MCP registration, optional environment, skills and agent profiles, and rehearsal scenarios.

For how `ghostcrab-skills` relates to the product repo, see [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md). For launcher details (`gcp`, `ghostcrab`) shared with other clients, see [GCP_CLIENT_SETUP.md](../../docs/GCP_CLIENT_SETUP.md).

## Prerequisites

- **Node.js** 20+ and a package runner (`pnpm` or `npm`).
- **GhostCrab MCP** on `PATH` **or** invokable via `pnpm dlx` / `npx`.

Published package: **`@mindflight/ghostcrab-mcp`** (binaries: `gcp`, `ghostcrab`). OpenClaw should start the server with **`gcp brain up`** or **`gcp up`** (legacy: **`gcp serve`**), optionally `--workspace <name>`. See [GCP_COMMANDS.md](../../docs/GCP_COMMANDS.md).

Initialize a workspace once if you use a named workspace:

```bash
gcp brain workspace create my-project
# legacy: gcp init my-project
```

## Part 1 — Register the MCP server in OpenClaw

OpenClaw expects a JSON **`mcpServers`** fragment in the shape used across this repo. Your OpenClaw build may use a global config file, a project file, or a UI—follow **your OpenClaw documentation** for where to merge the block.

Canonical copy-paste source in this tree: [ghostcrab-memory/mcp.json](ghostcrab-memory/mcp.json) (kept in sync with the SQLite MindBrain product).

### Recommended: global `gcp`

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "gcp",
      "args": ["brain", "up", "--workspace", "my-project"]
    }
  }
}
```

### Without global install

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "pnpm",
      "args": ["dlx", "@mindflight/ghostcrab-mcp", "gcp", "brain", "up", "--workspace", "my-project"]
    }
  }
}
```

(`npx` / `npm exec` equivalents work if you prefer.)

### Optional `env`

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "gcp",
      "args": ["brain", "up", "--workspace", "my-project"],
      "env": {
        "GHOSTCRAB_SQLITE_PATH": "/absolute/path/to/your/ghostcrab.sqlite"
      }
    }
  }
}
```

If defaults like `./data/ghostcrab.sqlite` matter, ensure OpenClaw starts the MCP process with the right **working directory**, or set `GHOSTCRAB_SQLITE_PATH` explicitly. Full variable list: product [README.md](../../README.md).

### Verify

After configuration, use OpenClaw’s own MCP status or tool listing (per your version) to confirm the **`ghostcrab`** server connects.

## Part 2 — Install skills and the epistemic agent profile

| Path | Role |
|------|------|
| [ghostcrab-memory/](ghostcrab-memory/) | Core OpenClaw skill: memory, onboarding discipline, patterns (`SKILL.md`, `mcp.json`, schema/query/app notes) |
| [ghostcrab-epistemic-agent/](ghostcrab-epistemic-agent/) | Richer persona: startup/heartbeat, gaps, checkpoints (`AGENTS.md`, `SOUL.md`, `WORKING.md`, `HEARTBEAT.md`) |

Copy or symlink these folders into the location **your OpenClaw install** uses for skills and agent definitions. This repo does not automate OpenClaw installation.

### Directory layout and relative links

`ghostcrab-memory/SKILL.md` points at shared contracts with paths such as `../../shared/ONBOARDING_CONTRACT.md`. Keep this structure:

```text
ghostcrab-skills/
├── openclaw/
│   ├── ghostcrab-memory/
│   ├── ghostcrab-epistemic-agent/
│   └── scenarios/
└── shared/
    ├── ONBOARDING_CONTRACT.md
    └── …
```

**Recommended:** keep or symlink the whole **`ghostcrab-skills`** tree so `openclaw/` and `shared/` stay siblings.

## Part 3 — Scenarios (rehearsals)

Guided prompts for live OpenClaw sessions live under [scenarios/](scenarios/):

| Scenario | File |
|----------|------|
| Codebase intelligence | [scenarios/codebase-intelligence.md](scenarios/codebase-intelligence.md) |
| Compliance audit | [scenarios/compliance-audit.md](scenarios/compliance-audit.md) |
| CRM pipeline | [scenarios/crm-pipeline.md](scenarios/crm-pipeline.md) |
| Environment delivery | [scenarios/environment-delivery.md](scenarios/environment-delivery.md) |
| Incident response | [scenarios/incident-response.md](scenarios/incident-response.md) |
| Integration operations | [scenarios/integration-operations.md](scenarios/integration-operations.md) |
| Knowledge base | [scenarios/knowledge-base.md](scenarios/knowledge-base.md) |
| Out of domain | [scenarios/out-of-domain.md](scenarios/out-of-domain.md) |
| Project delivery | [scenarios/project-delivery.md](scenarios/project-delivery.md) |
| Software delivery | [scenarios/software-delivery.md](scenarios/software-delivery.md) |

Pair scenarios with demo profiles from [shared/demo-profiles/](../shared/demo-profiles/) when you want seeded data; see [ghostcrab-memory/README.md](ghostcrab-memory/README.md).

## Part 4 — Shared rules of the road

- **First fuzzy onboarding** is **intake-only**: [ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md).
- **Product language first** in skills unless the user asks for implementation detail.
- **Demo data** is optional and loaded via product-side tooling (`gcp load`, `pnpm run demo:load`, etc.), not by OpenClaw alone.

## See also

- [GHOSTCRAB_INTEGRATION.md](../GHOSTCRAB_INTEGRATION.md) — validation, versioning, embedded workspace notes
- [GCP_CLIENT_SETUP.md](../../docs/GCP_CLIENT_SETUP.md) — Codex, Cursor, Claude Code, local packs
- [codex/README.md](../codex/README.md) — same integration pattern for OpenAI Codex
- [ghostcrab-skills README.md](../README.md) — full tree layout and `npm run validate`
