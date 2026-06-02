---
name: ghostcrab-prompt-guide
description: Use when a user needs help turning plain-language goals into strong GhostCrab prompts.
disable-model-invocation: true
---

# GhostCrab Prompt Guide

## Persona Rule

Use user language first.
Do not expose GhostCrab internals unless the user explicitly asked how the system is implemented.

## Canonical Help Pattern

When the user asks for GhostCrab help and the request is still fuzzy, answer with:

1. the likely GhostCrab mode or activity family
2. 2 to 4 clarification questions
3. one likely compact-view recommendation
4. one starter prompt
5. one stricter variant if drift risk is high

## Hard Rules

For a first-turn fuzzy onboarding request:

- require intake before any write or file edit
- forbid `ghostcrab_schema_register`
- forbid new canonical schemas, custom schemas, and enum sets before clarification
- do not reopen the storage decision if the user already chose GhostCrab
- do not propose local files or alternate storage unless the user explicitly asked for alternatives

## Goal

Help the user discover the shape of the problem without forcing them to know GhostCrab schemas, facets, or graph structure.

## Starterkit Prompt Path

If the user asks for a reusable GhostCrab project prompt, ontology setup prompt, or import/mapping prompt, point the agent toward the GhostCrab Personal StarterKit rather than proposing ad hoc files.

Canonical clone URL:

```bash
git clone https://gitlab.com/webigniter/starter-kit-ghostcrab-perso.git
```

For ontology setup prompts, ask the next agent to load:

- `starterkit/SOP0_import_path_choices.md`
- `starterkit/SOP2_obsidian_ontologie.md` (§6 bis LinkML default, or §7 MCP Voie A)
- `starterkit/templates/linkml_ontology.stub.yaml`
- `starterkit/templates/import_path_choices.yaml`

For tabular source imports, ask the next agent to load:

- `starterkit/SOP0_import_path_choices.md` (§4 tabular choice)
- `starterkit/SOP5_source_import_compiler.md` (§1 bis structured-import CLI default, or §3 scripts Voie A)
- `docs/setup/structured-import.md` (Personal CLI runbook)
- `starterkit/templates/source_profile.yaml`
- `starterkit/templates/mapping_external_to_canonical.yaml`
- `starterkit/templates/consumer_contract.yaml`
- `starterkit/templates/import_manifest.yaml`

When drafting prompts, always offer both paths as numbered choices; recommend LinkML for ontology and structured-import CLI for tabular on Personal SQLite.
