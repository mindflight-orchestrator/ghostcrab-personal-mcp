# MCP and CLI creation of `live_answer_view`

## Goal

Expose MindBrain's governed live-answer creation path through
`ghostcrab_live_create` and `gcp brain artifact create`, with no direct SQL,
simulated artifact, rename, or fallback.

The effective workspace is mandatory and always resolved. The MCP input may
provide a one-call override; otherwise the active session workspace is sent to
MindBrain. Absence of an effective workspace is an error, never an unscoped
create.

## Public surfaces

`ghostcrab_live_create` accepts `slug`, `public_label`, `definition`, and an
optional explicit workspace override. It returns `created`, `idempotent`, the
registry identity/state/version, and the parsed payload.

Before a write, GhostCrab requires MindBrain capability
`live_answer_view_create`. Missing capability or route returns exactly:

```text
BLOCKER_GHOSTCRAB_ARTIFACT_CREATE_UNAVAILABLE
```

`ghostcrab_status.runtime.capabilities.live_answer_view_create` mirrors the
backend probe. A downstream Build must confirm both the MCP tool and this flag
before any OpenRouter call.

CLI syntax:

```text
gcp brain artifact create \
  --workspace-id <id> \
  --slug <slug> \
  --public-label <label> \
  --definition-file <definition.json> \
  [--url <base>]
```

`--workspace` or the configured default may resolve the concrete workspace id.
The JSON file must contain a non-empty object and cannot define the reserved
top-level `materialized` field.

## Verification

- HTTP client/body/error mapping tests prove the create path never uses SQL.
- MCP schema, registration, catalog, active-workspace resolution, capability,
  success, replay, conflict and unavailable-backend tests.
- CLI parsing/file validation/capability/output tests.
- Real temporary-backend flow: create, list, get, refresh, events, replay and
  conflict, plus Studio catalog visibility.
- Compatibility matrix: old MCP/new backend and new MCP/old backend both block;
  only tool plus capability permits generation.

## Publication

Pin the already-published MindBrain commit, run all unit/integration/catalog and
package checks, then push the same GhostCrab `main` SHA to GitHub `origin` and
GitLab `origin2`. Do not create a tag or publish npm in this change.
