---
name: ghostcrab-integration-sop-editor
description: Use when editing GhostCrab/MindBrain integration SOP Markdown exports from Perplexity, especially to replace the generated prompt-like opening with a clean framework introduction, official framework context, MindBrain definition, and integration benefit while preserving the technical body.
---

# GhostCrab Integration SOP Editor

## Mission

Rewrite the introduction of `ghostcrab-integrations/*/sop*.md` files in American English so each article starts as a publishable integration note instead of a Perplexity conversation export.

Do not rewrite the whole SOP unless the user explicitly asks. Preserve the technical analysis, implementation sections, generated skill bodies, code blocks, citations, and footnotes that follow the introduction.

## Observed Source Shapes

Common export artifacts at the top of these SOPs:

- Perplexity logo image: `<img src="https://r2cdn.perplexity.ai/...pplx..."/>`
- Raw prompt or seed note: `task: target ...`, `**Task:** target ...`, `Do not explain what GhostCrab is...`
- Generic pitch paragraph: `The most effective pitch...` or `The strongest angle...`
- Perplexity filler: `Full ... below`, `Documentation is sufficient`, `There is enough...`
- Optional link-only heading, often `# https://...`
- Decorative separators such as `***` immediately after the export prompt

Some files already have a cleaner opening, for example a short `# ... SOP` title. Still adapt them to the canonical introduction if the user asks for this batch operation.

## Canonical Introduction

Replace the export opening with this structure:

```markdown
# Integrating mindBrain with {framework_name}

## About {framework_name}

{Two to four concise sentences defining the framework: what it is, what it does, who uses it, and its official context. Include one Markdown link to the official GitHub repository or official website. Prefer the official GitHub repo when it is clearly the project home; otherwise use the official site.}

## MindBrain

MindBrain is a structured agentic database that makes any domain navigable in real time — its intelligence lives in schema enforcement, typed ontologies, and pre-computed projections that cost zero inference at query time.

## Why integrate mindBrain with {framework_name}

{One or two paragraphs explaining the framework-specific benefit. Tie mindBrain to the framework's actual architecture: memory APIs, MCP tools, workflow orchestration, agent roles, graph/RAG layer, local runtime, or no-code tool nodes. Emphasize structured shared context, typed ontology, durable project memory, queryable relations, and zero-inference projections.}

## SKILLS available in this repo

{List two or three relevant skill files from the same framework folder. Use Markdown links relative to the SOP file, and explain each role in one sentence: what the skill helps an agent do, and whether it is meant for Claude Code, Codex, or both.}
```

Write the generated introduction in American English. Keep the title spelling exactly as above: `Integrating mindBrain with ...`.

## Editing Workflow

1. Locate target files with `find ghostcrab-integrations -maxdepth 2 -type f -iname 'sop*.md'`.
2. Read the first 80-160 lines of each target and identify the first real technical section worth preserving.
3. Inspect sibling skill files in the same framework folder with `find <framework-folder> -maxdepth 1 -type f -iname '*skill*.md'`.
4. Remove only the top export block: Perplexity logo, raw prompt, generic pitch, filler sentence, and local decorative separator.
5. Draft the canonical introduction from the surviving analysis, official framework context, and the local skill files.
6. Splice the new introduction before the preserved technical body.
7. Ensure there is exactly one blank line between Markdown blocks.

## Preservation Rules

- Keep all existing footnote definitions unless a removed intro sentence was their only use and the footnote is plainly unrelated.
- Keep code blocks, tables, generated `SKILL.md` drafts, implementation plans, and citations.
- Do not remove `div align="center">⁂</div>` separators outside the opening block unless the user asks for full Perplexity cleanup.
- Do not change technical claims that would require fresh research unless you verify them from official docs or the source text already supports them.
- Do not invent a framework capability just to make the integration sound stronger.

## Framework Context Rules

The framework definition must be specific and sourced from an official place. If the SOP already contains a good official link, reuse it. If not, look up the official GitHub repo or website before writing the definition.

Use concise link text:

- `[BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)`
- `[Agno](https://github.com/agno-agi/agno)`
- `[n8n](https://n8n.io/)`
- `[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)`

When uncertain between an official site and a repository, prefer the page that best explains what the framework is. Avoid third-party blogs in the introduction.

## Local Skill Section Rules

Include a `## SKILLS available in this repo` section in the introduction when sibling skill files exist.

- Link to two or three skill files, not every file when the folder contains many variants.
- Use relative Markdown links from the SOP file, for example `[ghostcrab-runtime](SKILL_ghostcrab_runtime.md)`.
- Prefer the most useful public-facing set: one architect/onboarding skill, one runtime/orchestration skill, and one framework-specific/community or personal variant.
- If the folder has only one or two skill files, include only those.
- Explain each skill in plain American English with one sentence: role, expected use, and target agent environment.
- Mention Claude Code and Codex only when the file name or content supports that usage; otherwise say it is a general agent skill for the framework.
- Do not claim the skill is installed automatically. Present it as a local artifact that can be used or adapted by Claude Code, Codex, or another compatible agent environment.

Example shape:

```markdown
## SKILLS available in this repo

- [`ghostcrab-architect`](SKILL_ghostcrab-architect.md) helps Claude Code or Codex shape the mindBrain ontology before implementation work begins.
- [`ghostcrab-runtime`](SKILL_ghostcrab-runtime.md) describes how an agent uses GhostCrab/MindBrain at runtime to read, write, and project shared state.
- [`ghostcrab-community`](skill-framework-ghostcrab-community.md) provides a lighter entry point for trying the integration in a framework demo or community workflow.
```

## Benefit Patterns

Choose the pattern that matches the framework:

- **Memory backend frameworks**: mindBrain becomes the durable, typed, queryable memory layer instead of isolated per-agent stores.
- **MCP-native frameworks**: GhostCrab exposes mindBrain through tools without changing the framework core.
- **Workflow/no-code systems**: mindBrain supplies a structured project/context backend that nodes can query, update, and project.
- **Role-based agent methods**: mindBrain turns static handoff files into live ontology-backed context while preserving the existing workflow.
- **RAG/index frameworks**: mindBrain complements vector retrieval with typed relations, facets, and precomputed projections.

## Quality Checklist

Before finishing:

- The file begins with `# Integrating mindBrain with {framework_name}`.
- The generated introduction is written in American English.
- The Perplexity logo/link is gone from the opening.
- The raw first prompt is gone.
- The introduction contains a real definition of the framework and one official link.
- The MindBrain definition matches the required sentence exactly.
- The benefit section is specific to the framework, not a generic sales pitch.
- The introduction links to two or three sibling skill files when they exist, with a clear role and Claude Code/Codex usage note.
- The technical body still starts naturally after the new introduction.
