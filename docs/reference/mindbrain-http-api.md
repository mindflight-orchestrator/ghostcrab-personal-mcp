# MindBrain HTTP API Used By GhostCrab

This page documents the MindBrain HTTP routes consumed by the GhostCrab MCP
runtime. It is separate from `openapi.yaml`, which currently covers telemetry
HTTP only.

The executable source of truth remains:

- GhostCrab client wrappers: `src/db/standalone-mindbrain.ts`
- Backend route contract guard: `tests/contracts/ghostcrab-backend.contract.ts`
- Backend implementation: `vendor/mindbrain/src/standalone/http_app.zig`

## Capabilities

`GET /api/mindbrain/capabilities`

GhostCrab probes this route before deciding which backend-backed features are
available. Relevant graph rule flags:

```json
{
  "features": {
    "graph_diagnostics": true,
    "graph_gap_rules": true,
    "graph_gap_rules_import": true,
    "graph_gap_rules_delete": true,
    "graph_rule_evaluations": true,
    "graph_rule_evaluations_run": true,
    "graph_rule_events": true
  }
}
```

## Graph Rule Workflow

These routes turn declarative graph gap rules into persisted validity state and
transition events.

### `POST /api/mindbrain/graph/rule-evaluations/run`

Evaluates active rules for a workspace, persists current state in
`graph_rule_evaluations`, and appends rows to `graph_rule_events` only when a
rule state changes.

Request:

```json
{
  "workspace_id": "immeuble-demo",
  "ontology_id": "immeuble-demo::core",
  "limit": 200,
  "create_remediation_actions": true
}
```

Response:

```json
{
  "kind": "graph_rule_evaluation_run",
  "workspace_id": "immeuble-demo",
  "ontology_id": "immeuble-demo::core",
  "evaluated": 12,
  "changed": 1,
  "events_created": 1,
  "invalid_count": 3,
  "remediation_actions_created": 0,
  "events": [
    {
      "event_id": "graph_rule_event__...",
      "rule_id": "unit-has-owner",
      "subject_entity_id": 42,
      "from_state": "invalid",
      "to_state": "valid",
      "observed_count": 1,
      "expected_min": 1,
      "expected_max": null,
      "idempotency_key": "graph_rule_transition__...",
      "created_at_unix": 1781690000
    }
  ]
}
```

If `create_remediation_actions` is true, a rule may create a proposed
`quality_remediation_action` on `invalid -> valid` only when its
`metadata_json` contains a `remediation_action` object. No remediation action is
created by default from rules that omit that metadata.

### `GET /api/mindbrain/graph/rule-evaluations`

Lists current persisted rule states.

Query parameters:

- `workspace_id` required
- `ontology_id` optional
- `limit` optional, default `200`

Response:

```json
{
  "kind": "graph_rule_evaluations",
  "workspace_id": "immeuble-demo",
  "ontology_id": "immeuble-demo::core",
  "evaluations": [
    {
      "rule_id": "unit-has-owner",
      "subject_entity_id": 42,
      "state": "valid",
      "observed_count": 1,
      "expected_min": 1,
      "expected_max": null,
      "last_evaluated_at_unix": 1781690000,
      "updated_at_unix": 1781690000
    }
  ]
}
```

### `GET /api/mindbrain/graph/rule-events`

Lists transition events emitted by rule evaluation runs.

Query parameters:

- `workspace_id` required
- `ontology_id` optional
- `limit` optional, default `200`

Response:

```json
{
  "kind": "graph_rule_events",
  "workspace_id": "immeuble-demo",
  "ontology_id": "immeuble-demo::core",
  "events": [
    {
      "event_id": "graph_rule_event__...",
      "rule_id": "unit-has-owner",
      "subject_entity_id": 42,
      "from_state": "invalid",
      "to_state": "valid",
      "observed_count": 1,
      "expected_min": 1,
      "expected_max": null,
      "idempotency_key": "graph_rule_transition__...",
      "created_at_unix": 1781690000
    }
  ]
}
```

## Related Gap Rule Routes

The rule-evaluation routes depend on rules imported with the existing gap-rule
API:

- `GET /api/mindbrain/graph/gap-rules`
- `POST /api/mindbrain/graph/gap-rules/import`
- `POST /api/mindbrain/graph/gap-rules/delete`
- `GET /api/mindbrain/graph/diagnostics`

The usual operator workflow is:

1. import or update rules;
2. list rules to confirm the active contract;
3. run diagnostics for current violations;
4. run rule evaluations to persist `valid | invalid` state and transition
   events;
5. inspect evaluations/events or proposed quality remediation actions.
