# Claude Code Starter: Data Architect

This starter extends Claude Code from simple self-memory into project data design.

It is meant for stronger coding models, so it stays more flexible than the OpenClaw profile while preserving the same invariants:

- read GhostCrab recipes before inventing a new domain model
- prefer provisional models over immediate schema freeze
- separate local/client models from shared canonical ones
- design packs and KPIs from real retrieval jobs
- keep first-turn GhostCrab onboarding intake-only until the user clarifies enough to model safely
- treat checkpoints and transition logging as part of long-running design quality

Use it when you want Claude Code to:

- design schema families
- propose graph models
- scaffold migration files
- generate TypeScript types from agreed schema shapes

This starter is additive with:

- [claude-code/self-memory/](../self-memory)

The expectation is that a project may combine both fragments.
