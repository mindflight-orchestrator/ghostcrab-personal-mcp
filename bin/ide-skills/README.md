# IDE skill bundles (generated)

Do not edit files here by hand. Source: `ghostcrab-skills/`. Regenerate:

```bash
pnpm run sync:ide-skills
```

## Setup mapping

| `gcp brain setup` | Bundle | Installed into user project |
|---------------------|--------|----------------------------|
| `cursor` | `cursor/rules/`, `cursor/skills/`, `shared/` | `.cursor/rules/*.mdc`, `.cursor/skills/<skill>/`, `.ghostcrab/skills/shared/` |
| `claude` | `claude-code/self-memory/`, `claude-code/skills/`, `shared/` | `.claude/skills/<skill>/`, `.ghostcrab/claude-self-memory.md`, `.ghostcrab/skills/shared/`, merge `.claude/settings.json` |
| `codex` | `codex/skills/`, `shared/` | `.codex/skills/<skill>/`, `.codex/skills/ghostcrab-shared/` |
| `generic` | `codex/skills/`, `shared/` | `.agents/skills/<skill>/`, `.agents/skills/ghostcrab-shared/` |

Installed by `gcp brain setup` by default (opt-out: `--no-skills`).
