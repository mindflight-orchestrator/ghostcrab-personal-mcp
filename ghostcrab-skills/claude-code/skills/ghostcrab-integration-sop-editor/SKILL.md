---
name: ghostcrab-integration-sop-editor
description: Use when editing GhostCrab/MindBrain integration SOP Markdown exports, especially to replace a generated prompt-like opening with a clean framework introduction while preserving the technical body.
---

# GhostCrab Integration SOP Editor

## Mission

Rewrite only the introduction of `ghostcrab-integrations/*/sop*.md` files so each article starts as a publishable integration note instead of a Perplexity conversation export.

Preserve the technical analysis, generated skill bodies, code blocks, citations, footnotes, implementation sections, and tables unless the user explicitly asks for a broader rewrite.

## Procedure

1. Locate targets with `find ghostcrab-integrations -maxdepth 2 -type f -iname 'sop*.md'`.
2. Read the first 80 to 160 lines of each target.
3. Identify the first real technical section worth preserving.
4. Inspect sibling skill files in the same framework folder.
5. Remove only the top export block: logo image, raw prompt, generic pitch, filler sentence, link-only heading, and local decorative separator.
6. Draft a new introduction using the canonical structure below.
7. Splice the introduction before the preserved body.
8. Ensure exactly one blank line between Markdown blocks.

## Canonical Introduction

Use this structure:

```markdown
# Integrating mindBrain with {framework_name}

## About {framework_name}

{Two to four concise sentences defining the framework, with one official link.}

## MindBrain

MindBrain is a structured agentic database that makes any domain navigable in real time - its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time.

## Why integrate mindBrain with {framework_name}

{One or two framework-specific paragraphs.}

## SKILLS available in this repo

{Two or three sibling skill files when they exist, with one sentence each.}
```

## Source Rules

- Use official framework context for the definition.
- Reuse an official link already present in the SOP when it is good.
- If no official link exists and freshness matters, browse official docs or the official repository before writing claims.
- Do not invent framework capabilities.
- Do not claim a skill is installed automatically.

## Quality Checklist

Before finishing, confirm:

- The file starts with `# Integrating mindBrain with {framework_name}`.
- The intro is American English.
- The Perplexity logo and raw prompt are gone.
- The MindBrain definition matches the canonical sentence.
- The benefit section is framework-specific.
- Existing citations, footnotes, code blocks, and technical body remain.
