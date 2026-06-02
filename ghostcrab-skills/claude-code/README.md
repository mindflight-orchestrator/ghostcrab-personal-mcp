# GhostCrab - Claude Code integration

This folder contains two Claude Code integration styles:

- `skills/` contains on-demand `SKILL.md` packages. Copy or symlink each child folder into a project's `.claude/skills/` directory when you want Claude Code to load the playbook only for matching tasks.
- `self-memory/` and `data-architect/` contain starter fragments for projects that want persistent project instructions through `CLAUDE.md`.

Use both when useful: the starter files set always-available GhostCrab discipline, while the skills keep detailed procedures out of context until Claude Code needs them.

## Skills

- [skills/ghostcrab-memory/](skills/ghostcrab-memory/) - durable memory, blockers, follow-up, long-running work, and fuzzy tracking intake.
- [skills/ghostcrab-prompt-guide/](skills/ghostcrab-prompt-guide/) - convert plain-language goals into strong GhostCrab prompts.
- [skills/ghostcrab-data-architect/](skills/ghostcrab-data-architect/) - design GhostCrab-backed domain models without freezing schemas too early.
- [skills/ghostcrab-integration-sop-editor/](skills/ghostcrab-integration-sop-editor/) - clean Perplexity-style integration SOP exports.
- [skills/mindbrain-comparison-writer/](skills/mindbrain-comparison-writer/) - draft and rewrite MindBrain comparison articles.

## Starter fragments

- [self-memory/](self-memory/) gives Claude Code a durable memory pattern for architecture decisions, conventions, blockers, and recovery.
- [data-architect/](data-architect/) extends the memory starter with schema and domain-modeling guidance.

## Install pattern

From a target project:

```bash
mkdir -p .claude/skills
ln -s /absolute/path/to/ghostcrab-skills/claude-code/skills/ghostcrab-memory .claude/skills/ghostcrab-memory
```

Repeat for each skill you want available. If symlinks are inconvenient, copy the skill folder instead.

For persistent project instructions, copy or merge the relevant `CLAUDE.md` starter into the target project's root `CLAUDE.md` or `.claude/CLAUDE.md`.

Canonical onboarding and write gates live in [../shared/ONBOARDING_CONTRACT.md](../shared/ONBOARDING_CONTRACT.md).
