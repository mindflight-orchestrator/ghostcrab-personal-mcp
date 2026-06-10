# GhostCrab — Cursor integration

## MCP (connect the server)

To register the GhostCrab stdio server in Cursor (`.cursor/mcp.json` or `~/.cursor/mcp.json`), use the product repo guide:

**Canonical install:** run `gcp brain setup cursor` — see [../../installations/gcp-brain-setup.md](../../installations/gcp-brain-setup.md).

## Skills

**Canonical install:**

```bash
gcp brain setup cursor --yes
```

This installs ten GhostCrab skills under `~/.cursor/skills/` plus shared contracts under `~/.cursor/skills/ghostcrab-shared/`.

| Skill | Role |
| --- | --- |
| ghostcrab-memory | Durable working memory, onboarding, long-running work |
| ghostcrab-prompt-guide | Prompt and workflow guidance |
| ghostcrab-data-architect | Structured domain modeling |
| ghostcrab-integration-sop-editor | Integration SOP cleanup |
| mindbrain-comparison-writer | MindBrain comparison articles |
| ghostcrab-operator | Business questions → MCP workflows |
| ghostcrab-evidence-discovery | Map questions to facets, graph, projections |
| ghostcrab-projection-reviewer | Review Type A/B projections |
| ghostcrab-gap-auditor | Audit evidence gaps |
| ghostcrab-json-answer-builder | Stable JSON answers from MCP outputs |

Each skill is **autonomous** at runtime (workflows inline in `SKILL.md`, shared stubs in `ghostcrab-shared/`). Operational skills may optionally reference starter-kit delivery SOPs when you run a phased import project.

Canonical onboarding and gates: [../shared/ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md).

Edit the canonical skill source under `../skills/<skill>/SKILL.md`. The local `skills/<skill>` paths are symlinks to that source, and `generated/cursor` points to the generated install bundle under `bin/ide-skills/cursor/skills/`.

Claude Code users should use [../claude-code/README.md](../claude-code/README.md) instead.
