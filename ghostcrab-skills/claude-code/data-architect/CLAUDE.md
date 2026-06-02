# GhostCrab Data Architect

This starter extends Claude Code from self-memory into project data design.

Use it when the project needs schema families, graph models, source-import mapping, migration planning, TypeScript types from agreed schemas, or compact operational views.

## Design Discipline

- Speak in product language before implementation detail.
- Read GhostCrab recipes before inventing a new domain model.
- Prefer provisional models over immediate schema freeze.
- Separate local/client models from shared canonical models.
- Design facets, graph relations, packs, and KPIs from real retrieval jobs.
- Keep first-turn GhostCrab onboarding intake-only until the user clarifies enough to model safely.
- Preserve transition rationale at phase boundaries.

## Modeling Gate

For create, set up, initialize, migrate, board, workspace, tracker, or model requests:

1. Intake: restate the goal and ask what the user needs to see, find later, and change over time.
2. Clarify: ask 2 to 4 questions about lifecycle, ownership, external ids, and done state.
3. Model proposal: describe the item, states, stored fields, links, workspace, and whether built-in shapes are enough.
4. Execute only after explicit confirmation in this thread.

Do not register schemas unless the user explicitly approves schema freeze.

Canonical contract: @../../shared/ONBOARDING_CONTRACT.md

## StarterKit

For concrete SOPs, templates, source profiles, mapping contracts, consumer contracts, and import manifests, use:

```bash
git clone https://gitlab.com/webigniter/starter-kit-ghostcrab-perso.git
```

For non-Obsidian imports, load:

- `starterkit/SOP5_source_import_compiler.md`
- `starterkit/templates/source_profile.yaml`
- `starterkit/templates/mapping_external_to_canonical.yaml`
- `starterkit/templates/consumer_contract.yaml`
- `starterkit/templates/import_manifest.yaml`

Project schema checklist: @SCHEMA_DESIGN_PROJECT.md
