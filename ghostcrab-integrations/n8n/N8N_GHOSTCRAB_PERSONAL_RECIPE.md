# n8n + GhostCrab Personal SQLite Recipe

This recipe shows how to use GhostCrab Personal as a local SQLite-backed memory
sidecar for n8n workflows.

n8n is a workflow automation platform, not an agent framework. Treat GhostCrab
as durable cross-run state for workflows: deduplication checks, enrichment
memory, audit notes, linked records, and handoffs between independent workflows.

## Local GhostCrab Personal Setup

Install and start GhostCrab Personal:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
gcp brain up
```

GhostCrab Personal is local-first, SQLite-backed, and exposes MCP tools over
stdio by default. n8n workflows usually call HTTP APIs and nodes, so a
connection layer is required unless your n8n environment can directly invoke a
local MCP stdio client.

## Connection Requirement

Do not assume direct n8n-to-stdio support. Pick one of these bridge patterns
before designing workflow nodes.

| Option | Pattern | Prerequisites | Complexity | Recommendation |
| --- | --- | --- | --- | --- |
| A | n8n HTTP Request node -> external HTTP bridge -> GhostCrab stdio | A small local service that starts or connects to `gcp brain up`, accepts HTTP from n8n, and calls MCP tools over stdio | Medium | Best first demo because it uses stock n8n nodes |
| B | Custom n8n node wrapping MCP calls | n8n custom node development, MCP client code, local process permissions | High | Best long-term UX if publishing an n8n integration |
| C | External runner script | Node.js or Python runner called by n8n via Execute Command/Webhook/HTTP; runner talks to GhostCrab stdio | Medium | Good for private workflows and prototypes |

The bridge should expose only the GhostCrab tools your workflow needs, validate
inputs, and return tool errors in a shape n8n can branch on.

## Start Here

Use this minimal sequence for the first workflow:

1. `ghostcrab_workspace_list`
2. `ghostcrab_search`
3. `ghostcrab_remember`

Call `ghostcrab_workspace_create` only after `ghostcrab_workspace_list` confirms
the target workspace is missing.

## Workflow Scenario 1: Lead Enrichment Memory

Goal: avoid paying for or repeating enrichment work on the same lead.

1. Trigger receives a lead from a webhook or CRM node.
2. n8n calls the bridge with `ghostcrab_search` using the lead email, company,
   or CRM ID.
3. If prior enrichment exists, n8n reuses it.
4. If not, n8n runs enrichment and stores the result with
   `ghostcrab_remember`.

Use `ghostcrab_remember` because the enrichment result is an immutable
observation from a workflow run. Store facets such as `workflow`, `lead_id`,
`email_domain`, `source`, and `run_id`.

## Workflow Scenario 2: Cross-Workflow State

Goal: let independent workflows share the current status of a customer, ticket,
order, or campaign.

1. Workflow A updates the current record with `ghostcrab_upsert`.
2. Workflow B reads prior context with `ghostcrab_pack` or
   `ghostcrab_search`.
3. Workflow B branches based on the current state.
4. Completion or escalation decisions are stored as audit notes with
   `ghostcrab_remember`.

Use `ghostcrab_upsert` for mutable state such as `lead:123 status=qualified` or
`ticket:abc owner=support-tier-2`.

## Workflow Scenario 3: Deduplication and Replay Safety

Goal: make retries and duplicate triggers safe.

1. Trigger receives an event with a stable event ID.
2. n8n calls `ghostcrab_search` for that event ID.
3. If found, the workflow stops or jumps to an idempotent branch.
4. If not found, the workflow executes and records the processed event with
   `ghostcrab_remember`.
5. Use `ghostcrab_count` for dashboards such as processed events by source,
   status, or day.

## Tool Mapping for n8n

| n8n workflow need | GhostCrab Personal tool |
| --- | --- |
| Check whether a record or event was seen before | `ghostcrab_search` |
| Load compact context for a workflow decision | `ghostcrab_pack` |
| Store an enrichment result, audit note, or processed event | `ghostcrab_remember` |
| Maintain current state for a lead, ticket, order, or task | `ghostcrab_upsert` |
| Count records by status, source, workflow, or owner | `ghostcrab_count` |
| Link related leads, tickets, orders, decisions, or dependencies | `ghostcrab_learn` |
| Traverse linked workflow memory | `ghostcrab_traverse` |
| Track active workflow goals or handoffs | `ghostcrab_project` |
| Inspect available schemas | `ghostcrab_schema_list`, `ghostcrab_schema_inspect` |
| Export a workspace model for a generator or bridge | `ghostcrab_workspace_export_model` |

`ghostcrab_search` supports `mode="bm25"` for keyword search, `mode="semantic"` for vector search, and `mode="hybrid"` for the recommended combined mode. On GhostCrab Personal SQLite without embeddings configured, `semantic` and `hybrid` fall back to BM25 and the MCP response notes that fallback. To enable vector retrieval, configure `GHOSTCRAB_EMBEDDINGS_MODE=openrouter`, `GHOSTCRAB_EMBEDDINGS_MODEL`, and `GHOSTCRAB_EMBEDDINGS_API_KEY` in the GhostCrab server. n8n workflows pass `mode` in the bridge request payload; the workflow nodes do not change.

## remember vs upsert

Use `ghostcrab_remember` for durable facts from a workflow run:

- enrichment result
- routing decision
- processed event ID
- audit note
- human approval outcome

Use `ghostcrab_upsert` for current-state records that should change over time:

- lead status
- ticket owner
- order fulfillment state
- workflow checkpoint
- campaign stage

## Workflow Performance Contract

1. Do not call GhostCrab directly from n8n unless the chosen bridge is healthy; fail closed and alert rather than silently losing durable state.
2. Use `ghostcrab_search` or `ghostcrab_pack` at trigger time to prevent duplicate work before expensive enrichment or outreach nodes run.
3. Store enrichment outputs and audit notes with `ghostcrab_remember`; store mutable CRM, ticket, lead, or order state with `ghostcrab_upsert`.
4. Add stable keys such as `workflow_id`, `execution_id`, `record_id`, and source-system ids to every write.
5. At workflow completion, write one audit memory that explains what happened and why.

## Lifecycle and Failure Modes

n8n has a trigger-fire-action lifecycle, not an agent session lifecycle.

| Moment | n8n action | GhostCrab action |
| --- | --- | --- |
| Trigger fires | Load cross-run context or dedupe key | `ghostcrab_search` or `ghostcrab_pack` |
| Node executes | Write result or update state | `ghostcrab_remember` or `ghostcrab_upsert` |
| Workflow completes | Leave an audit note | `ghostcrab_remember` |
| Workflow retries | Check whether the event was already processed | `ghostcrab_search` |

If the bridge is unavailable, the workflow should branch explicitly:

- fail closed for deduplication-critical workflows
- queue the event for retry when GhostCrab is used for enrichment memory
- continue without memory only for low-risk convenience context
- store the bridge error in n8n execution logs with the workflow run ID

If `ghostcrab_status` indicates GhostCrab is down, start it locally:

```bash
gcp brain up
```

If the workspace is missing, call `ghostcrab_workspace_list` first, then
`ghostcrab_workspace_create` only for the missing workspace.

## Short PRO Note

This recipe focuses on GhostCrab Personal SQLite. MCP GhostCrab PRO /
mindBrain Pro is the PostgreSQL-based option for centralized team deployment.
