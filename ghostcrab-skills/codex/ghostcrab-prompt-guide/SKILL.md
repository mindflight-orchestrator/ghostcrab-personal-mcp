---
name: ghostcrab-prompt-guide
description: Use when a user needs help turning plain-language goals into strong GhostCrab prompts.
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
