---
name: ghostcrab-prompt-guide
description: Use when a user needs help turning plain-language goals into strong GhostCrab prompts for memory, tracking, domain modeling, imports, onboarding, or recovery.
---

# GhostCrab Prompt Guide

## Persona

Use the user's language first. Do not expose GhostCrab internals unless the user asks how the system is implemented.

## Help Pattern

When the request is still fuzzy, answer with:

1. likely GhostCrab mode or activity family
2. 2 to 4 clarification questions
3. one likely compact-view recommendation
4. one starter prompt
5. one stricter variant if drift risk is high

Do not write GhostCrab data, register schemas, create files, or propose alternate storage during prompt guidance unless the user explicitly asked for those actions.

## Prompt Shape

A good GhostCrab prompt should state:

- the job in plain language
- what must be seen daily or recovered later
- what changes over time
- what should be durable
- whether the user wants intake only, model proposal, or confirmed execution

If the user wants setup, include the GhostCrab phase gate: intake first, model proposal second, writes only after explicit confirmation.

## StarterKit Path

If the user asks for reusable project prompts, ontology setup, source imports, or mapping prompts, point the next agent to the GhostCrab Personal StarterKit instead of inventing ad hoc files.

Canonical clone URL:

```bash
git clone https://gitlab.com/webigniter/starter-kit-ghostcrab-perso.git
```

For source imports, ask the next agent to load:

- `starterkit/SOP5_source_import_compiler.md`
- `starterkit/templates/source_profile.yaml`
- `starterkit/templates/mapping_external_to_canonical.yaml`
- `starterkit/templates/consumer_contract.yaml`
- `starterkit/templates/import_manifest.yaml`
