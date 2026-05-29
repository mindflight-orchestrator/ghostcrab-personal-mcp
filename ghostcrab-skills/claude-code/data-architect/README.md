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
- compile external CSV/API/JSON/app exports through a reusable source-import procedure

This starter is additive with:

- [claude-code/self-memory/](../self-memory)

The expectation is that a project may combine both fragments.

## Starterkit Resource

For concrete SOPs, templates, source profiles, mapping contracts, consumer contracts, and import manifests, use the GhostCrab Personal StarterKit as the canonical project artifact source:

```bash
git clone https://gitlab.com/webigniter/starter-kit-ghostcrab-perso.git
```

For non-Obsidian imports, load:

- `starterkit/SOP5_source_import_compiler.md`
- `starterkit/templates/source_profile.yaml`
- `starterkit/templates/mapping_external_to_canonical.yaml`
- `starterkit/templates/consumer_contract.yaml`
- `starterkit/templates/import_manifest.yaml`
