# GhostCrab - Claude Code integration

This folder contains two Claude Code integration styles:

- `skills/` contains on-demand `SKILL.md` packages. Copy or symlink each child folder into a project's `.claude/skills/` directory when you want Claude Code to load the playbook only for matching tasks.
- `self-memory/` and `data-architect/` contain starter fragments for projects that want persistent project instructions through `CLAUDE.md`.

Use both when useful: the starter files set always-available GhostCrab discipline, while the skills keep detailed procedures out of context until Claude Code needs them.

## Skills

**Canonical install:**

```bash
gcp brain setup claude --yes
```

This installs ten GhostCrab skills plus shared contracts in `ghostcrab-shared/` next to each skill.

| Skill | Role |
| --- | --- |
| [skills/ghostcrab-memory/](skills/ghostcrab-memory/) | Durable memory, blockers, follow-up, long-running work |
| [skills/ghostcrab-prompt-guide/](skills/ghostcrab-prompt-guide/) | Convert plain-language goals into strong GhostCrab prompts |
| [skills/ghostcrab-data-architect/](skills/ghostcrab-data-architect/) | Design GhostCrab-backed domain models |
| [skills/ghostcrab-integration-sop-editor/](skills/ghostcrab-integration-sop-editor/) | Clean Perplexity-style integration SOP exports |
| [skills/mindbrain-comparison-writer/](skills/mindbrain-comparison-writer/) | Draft and rewrite MindBrain comparison articles |
| [skills/ghostcrab-operator/](skills/ghostcrab-operator/) | Business questions → GhostCrab MCP workflows |
| [skills/ghostcrab-evidence-discovery/](skills/ghostcrab-evidence-discovery/) | Map questions to facets, graph, projections |
| [skills/ghostcrab-projection-reviewer/](skills/ghostcrab-projection-reviewer/) | Review Type A/B projections |
| [skills/ghostcrab-gap-auditor/](skills/ghostcrab-gap-auditor/) | Audit gaps between questions and evidence |
| [skills/ghostcrab-json-answer-builder/](skills/ghostcrab-json-answer-builder/) | Stable JSON answers from MCP outputs |

Each skill is **autonomous** at runtime. Operational skills may optionally reference starter-kit delivery SOPs — resolve via [../shared/STARTERKIT_PATHS.md](../shared/STARTERKIT_PATHS.md) when you run a phased import project.

## Starter fragments

- [self-memory/](self-memory/) gives Claude Code a durable memory pattern for architecture decisions, conventions, blockers, and recovery.
- [data-architect/](data-architect/) extends the memory starter with schema and domain-modeling guidance.

## Manual install pattern

From a target project:

```bash
mkdir -p .claude/skills
ln -s /absolute/path/to/ghostcrab-skills/claude-code/skills/ghostcrab-memory .claude/skills/ghostcrab-memory
```

Repeat for each skill you want available. If symlinks are inconvenient, copy the skill folder instead. Prefer `gcp brain setup claude` for the full ten-skill set.

For persistent project instructions, copy or merge the relevant `CLAUDE.md` starter into the target project's root `CLAUDE.md` or `.claude/CLAUDE.md`.

Canonical onboarding and write gates live in [../shared/ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md).
