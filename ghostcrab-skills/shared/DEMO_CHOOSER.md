# Demo Chooser

Use this chooser when you want to start with one concrete GhostCrab demo project instead of the full aggregate seed.

## Choose One

### `codebase-intelligence`

- Objective: exercise **path-** and **content-shape** facets on repository-sourced facts (paths, extensions, syntax, sections) and a small graph linking a concept to concrete files.
- Seeds:
  - several `remember` rows with `path_repo_relative`, `path_top_level`, `syntax`, `content_class`, etc.
  - concept and artifact nodes, `EXTRACTED_FROM` / `REFERENCES` edges
  - one rollout-oriented projection
- Best fit:
  - `openclaw/ghostcrab-epistemic-agent`
  - `claude-code/data-architect`
- Source file:
  - `shared/demo-profiles/codebase-intelligence.jsonl`
- Facet guide:
  - `shared/PATH_CONTENT_FACETS.md`

### `compliance-audit`

- Objective: audit regulatory obligations, evidence, and explicit compliance gaps.
- Seeds:
  - obligation and evidence facts
  - one concept node with incomplete mastery
  - one `HAS_GAP` relation
  - one blocking audit projection
- Best fit:
  - `openclaw/ghostcrab-memory`
  - `openclaw/ghostcrab-epistemic-agent`
  - `claude-code/self-memory`
- Source file:
  - `shared/demo-profiles/compliance-audit.jsonl`

### `project-delivery`

- Objective: reason about delivery planning, workflow tracking, milestones, decisions, and next steps.
- Seeds:
  - task and decision facts
  - one milestone goal node
  - one `ENABLES` relation
  - one active execution-step projection
- Best fit:
  - `claude-code/data-architect`
  - `openclaw/ghostcrab-memory`
- Source file:
  - `shared/demo-profiles/project-delivery.jsonl`

### `software-delivery`

- Objective: inspect release blockers, PR flow, and software delivery risk.
- Seeds:
  - pull request and bug facts
  - one release node
  - one `BLOCKS` relation
  - one release-step projection
- Best fit:
  - `openclaw/ghostcrab-memory`
  - `claude-code/data-architect`
- Source file:
  - `shared/demo-profiles/software-delivery.jsonl`

### `incident-response`

- Objective: inspect an operational incident with impact, blockers, and runbook context.
- Seeds:
  - incident and service facts
  - one degraded service node
  - one `BLOCKS` relation
  - one runbook-oriented projection
- Best fit:
  - `openclaw/ghostcrab-epistemic-agent`
  - `claude-code/self-memory`
- Source file:
  - `shared/demo-profiles/incident-response.jsonl`

### `crm-pipeline`

- Objective: inspect a lightweight sales pipeline with blocked outreach and active opportunities.
- Seeds:
  - lead and opportunity facts
  - one stage node
  - one `BELONGS_TO` relation
  - one pipeline-step projection
- Best fit:
  - `openclaw/ghostcrab-memory`
  - `claude-code/self-memory`
- Source file:
  - `shared/demo-profiles/crm-pipeline.jsonl`

### `knowledge-base`

- Objective: inspect research notes, open questions, and source-backed concept relations.
- Seeds:
  - note and question facts
  - one concept node
  - one `DERIVES_FROM` relation
  - one learning-step projection
- Best fit:
  - `openclaw/ghostcrab-epistemic-agent`
  - `claude-code/data-architect`
- Source file:
  - `shared/demo-profiles/knowledge-base.jsonl`

## CLI

Use the companion CLI to inspect the same choices from the terminal:

```bash
npm run demo:choose
npm run demo:choose -- compliance-audit
npm run demo:choose -- --json
```

## Notes

- `shared/demo-profiles/*.jsonl` are the canonical per-project demo files.
- `shared/bootstrap_seed.jsonl` is the generated aggregate view of all demo entries.
- Pick one project first; use the aggregate only when you explicitly want every demo entry combined.
