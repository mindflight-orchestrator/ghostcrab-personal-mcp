# GhostCrab MCP installations

This folder collects installation notes for wiring **GhostCrab Personal MCP** into agent clients and agent runtimes.

GhostCrab is started as a local stdio MCP server. The current npm package is:

```bash
@mindflight/ghostcrab-personal-mcp
```

The canonical server process is:

```bash
gcp brain up
```

or, without a global install:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

## Start here

| File                                                                                         | Use it for                                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [gcp-brain-setup.md](gcp-brain-setup.md)                                                     | Shared `gcp brain setup ...`, workspace, env, and verification notes |
| [universal-mcp-client.md](universal-mcp-client.md)                                           | Any MCP client that accepts a command plus args                      |
| [openclaw.md](openclaw.md)                                                                   | OpenClaw outbound MCP registry and OpenClaw skill layout             |
| [gemini-cli.md](gemini-cli.md)                                                               | Gemini CLI `settings.json` / `gemini mcp add` setup                  |
| [nous-hermes.md](nous-hermes.md)                                                             | Nous-Hermes-style local agent runtimes with MCP support              |
| [openfang.md](openfang.md)                                                                   | OpenFang-style local agent runtimes with MCP support                 |
| [custom-installation.md](custom-installation.md)                                             | How to add a new client-specific installation guide                  |
| [templates/universal-ghostcrab-skill/SKILL.md](templates/universal-ghostcrab-skill/SKILL.md) | A portable skill template to adapt for new agents                    |

## Existing dedicated guides

These root guides remain the client-specific source of truth where they already exist:

- [../README_CURSOR_MCP.md](../README_CURSOR_MCP.md)
- [../README_CLAUDE_CODE_MCP.md](../README_CLAUDE_CODE_MCP.md)
- [../README_CODEX_MCP.md](../README_CODEX_MCP.md)
- [../ghostcrab-skills/openclaw/README.md](../ghostcrab-skills/openclaw/README.md)

Use this folder as the hub for agents that do not yet have a full dedicated guide.

## Baseline config shape

Most local MCP clients can consume this shape directly or with small syntax changes:

```json
{
  "mcpServers": {
    "ghostcrab": {
      "command": "npx",
      "args": [
        "-y",
        "--package=@mindflight/ghostcrab-personal-mcp@latest",
        "gcp",
        "brain",
        "up"
      ],
      "env": {
        "GHOSTCRAB_DATABASE_KIND": "sqlite",
        "GHOSTCRAB_EMBEDDINGS_MODE": "disabled"
      }
    }
  }
}
```

Prefer a local install with an absolute `node` + `bin/gcp.mjs` path when the client runs in a restricted environment or does not inherit your shell `PATH`.
