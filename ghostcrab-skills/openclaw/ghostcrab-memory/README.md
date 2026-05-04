# OpenClaw Skill: GhostCrab Memory

This folder ships the minimal OpenClaw-facing integration for GhostCrab.

Use this skill when you want OpenClaw to:

- retrieve durable facts from GhostCrab
- store new durable facts back into GhostCrab
- pack current context before a complex task
- create provisional projections that stay queryable
- disclose gaps instead of guessing
- route fuzzy requests into the right activity family before inventing a schema
- keep first-turn GhostCrab onboarding in product language instead of schema language
- leave a checkpoint trail for long-running work

## Files

- `mcp.json` = MCP server registration snippet
- `SKILL.md` = skill behavior
- `SCHEMA_DESIGN.md` = client-facing schema guidance
- `QUERY_PATTERNS.md` = retrieval patterns
- `APP_PATTERNS.md` = runtime behavior patterns

## Install Intent

This repo does not automate OpenClaw installation. Treat these files as canonical source material to copy or adapt into your OpenClaw environment.

**Full OpenClaw setup (MCP, layout, scenarios):** [../README.md](../README.md).

## Recommended Pairing

Pair this skill with one of the portable demo profiles from:

- [shared/demo-profiles/compliance-audit.jsonl](../../shared/demo-profiles/compliance-audit.jsonl)
- [shared/demo-profiles/crm-pipeline.jsonl](../../shared/demo-profiles/crm-pipeline.jsonl)
- [shared/demo-profiles/knowledge-base.jsonl](../../shared/demo-profiles/knowledge-base.jsonl)
- [shared/demo-profiles/project-delivery.jsonl](../../shared/demo-profiles/project-delivery.jsonl)
- [shared/demo-profiles/incident-response.jsonl](../../shared/demo-profiles/incident-response.jsonl)
- [shared/demo-profiles/software-delivery.jsonl](../../shared/demo-profiles/software-delivery.jsonl)

Use [shared/bootstrap_seed.jsonl](../../shared/bootstrap_seed.jsonl) only if you need the aggregate combined view.

For a fuller persona-driven setup, see:

- [openclaw/ghostcrab-epistemic-agent/README.md](../ghostcrab-epistemic-agent/README.md)
