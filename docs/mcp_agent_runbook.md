# MCP Agent Validation Runbook

This runbook defines how to compare Codex, Claude Code, and OpenClaw against
the GhostCrab MCP baseline using the exact same datasets, prompts, and artifact
shape.

## 1. Export the canonical scenario pack

```bash
npm run mcp:scenario-pack
```

Default output:

`artifacts/mcp-agent-validation/scenario-pack.json`

This file is the source of truth for:

- `scenario_id`
- `dataset`
- `prompt`
- `expected_tools`

## 2. Generate the baseline control run

```bash
npm run mcp:baseline -- auto
```

Optional single-scenario form:

```bash
npm run mcp:baseline -- auto facets_bm25_blocker
```

Default output:

`artifacts/mcp-agent-validation/baseline-auto.json`

The baseline run uses the repository’s own MCP harness and should be treated as
the control artifact bundle.

## 3. Replay with Codex, Claude Code, or OpenClaw

Each agent should replay:

- the same `dataset`
- the same `runtime_mode`
- the same `prompt`

Each agent should produce a JSON bundle with:

- `generated_at`
- `runtime_mode`
- `scenarios`

Each entry in `scenarios` must follow the `McpScenarioArtifact` shape:

- `scenario_id`
- `agent`
- `dataset`
- `runtime_mode`
- `prompt`
- `expected_tools`
- `tools_called`
- `trace`
- `observed_backend`
- `final_answer_summary`
- `scorecard`
- `verdict`
- `notes`

## 4. Compare an agent bundle to baseline

```bash
npm run mcp:artifacts:compare -- \
  artifacts/mcp-agent-validation/baseline-auto.json \
  artifacts/mcp-agent-validation/codex-auto.json
```

The comparison result reports:

- protocol alignment on tools, dataset, runtime mode, and prompt
- backend alignment
- result/recovery quality
- final `pass` / `weak_pass` / `fail` verdict

## Suggested naming

- `artifacts/mcp-agent-validation/codex-auto.json`
- `artifacts/mcp-agent-validation/claude-code-auto.json`
- `artifacts/mcp-agent-validation/openclaw-auto.json`

## Recommended evaluation order

1. `baseline-mcp`
2. `Codex`
3. `Claude Code`
4. `OpenClaw`

Only compare agents that were run against the same database state and runtime
mode.
