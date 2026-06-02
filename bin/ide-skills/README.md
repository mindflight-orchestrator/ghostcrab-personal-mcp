# IDE skill bundles (generated)

Do not edit files here by hand. Source: `ghostcrab-skills/skills/`. Regenerate:

```bash
pnpm run sync:ide-skills
```

## Setup mapping

| `gcp brain setup` | Bundle | Installed by default |
|---------------------|--------|----------------------------|
| `cursor` | `cursor/skills/`, `shared/` | `~/.cursor/skills/<skill>/`, `.ghostcrab/skills/shared/` |
| `claude` | `claude-code/self-memory/`, `claude-code/skills/`, `shared/` | `~/.claude/skills/<skill>/`, `.ghostcrab/claude-self-memory.md`, `.ghostcrab/skills/shared/`, merge Claude settings |
| `codex` | `codex/skills/`, `shared/` | `~/.codex/skills/<skill>/`, `~/.codex/skills/ghostcrab-shared/` |
| `generic` | `codex/skills/`, `shared/` | `~/.agents/skills/<skill>/`, `~/.agents/skills/ghostcrab-shared/` |

Installed globally by `gcp brain setup` by default (opt-out: `--no-skills`; project install: `--skills-scope project`).
