---
name: ghostcrab-memory
description: Use when an agent has access to GhostCrab MCP and needs durable project memory, onboarding capture, context lookup, relationship tracking, or handoff continuity across sessions. Adapt this template to the target agent's skill, rule, or profile format.
---

# GhostCrab Memory

## Purpose

Use GhostCrab as durable working memory for projects, decisions, facts, relationships, schemas, workflows, and handoffs. Prefer it when context should survive the current chat or be discoverable by another agent later.

## Before Work

1. Check that the GhostCrab MCP server is connected.
2. Identify the active project or workspace.
3. Search existing GhostCrab memory before adding new durable facts.
4. Treat retrieved memory as context, not proof. Verify drift-prone facts from the current repo, runtime, or source of truth.

## What To Store

Store concise, reusable facts:

- project conventions and commands
- durable architectural decisions
- validated setup steps
- known failure modes and fixes
- handoff summaries with next concrete action
- domain vocabulary, schemas, and relationships

Do not store:

- secrets, tokens, passwords, private keys
- unverified speculation
- large logs or full source files
- transient todo items that will be obsolete by the next session
- duplicate facts already present in memory

## Working Pattern

When starting a task:

1. Search by project name, repo path, component, and user wording.
2. Read only the memory entries that are directly relevant.
3. Use current local evidence to confirm anything likely to drift.
4. Continue the work from the current checkout, not from memory alone.

When closing a task:

1. Record what changed.
2. Record what was validated.
3. Record what remains fragile or unverified.
4. Record the next concrete step if the work is not complete.

## Query Hints

Useful search keywords:

- repo path
- package name
- command name
- feature name
- error text
- agent/client name
- exact file path

## MCP Command Baseline

GhostCrab should be launched as:

```bash
gcp brain up
```

Portable no-install form:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

If the client has a limited `PATH`, prefer:

```bash
node /absolute/path/to/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs brain up
```

## Adaptation Notes

For a new agent:

1. Keep this `SKILL.md` body short.
2. Add only the loader metadata required by the target agent.
3. Keep MCP config outside the skill unless the target agent expects it inside the skill folder.
4. Preserve the "search before store" and "verify drift-prone facts" rules.
