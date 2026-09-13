# Qualified projection answers in two MCP calls

The bounded pilot supports three prepared native contracts from the Studio
immeuble fixture: quotities, lots without declared owners, and active leases.
For a supported question, the two calls return native result rows, evidence IDs,
the relevant ontology definitions, column meanings, assumptions and freshness.
Incomplete evidence remains `indeterminate`; a successful tool call alone does
not establish that the business answer is complete.

This feature adds no MCP tools. It extends the existing
`ghostcrab_business_query_answer` and `ghostcrab_artifact_get` interfaces; the
existing `ghostcrab_live_create` and `ghostcrab_live_refresh` tools prepare the
native contracts. The new execution behavior lives in MindBrain.

## Preparation

Use a backend containing MindBrain commit `500f381` or its successor with the
projection-contract implementation, together with this MCP implementation.
The three example arguments are shipped in
[`qualified_projections.json`](../../examples/immeuble/contracts/qualified_projections.json).
They target workspace `immeuble`, ontology `immeuble::core` version `2.1.0`, and
the explicit date `2026-09-13`.

After importing the source data and ontology, pass each object to
`ghostcrab_live_create`, then pass the returned artifact ID and workspace to
`ghostcrab_live_refresh`. The refresh validates and executes the native contract.
These preparation writes happen before the two-call serving budget. The examples
are not automatically installed in an existing Studio database.

Both serving tools must already be exposed by the MCP client. Session setup,
tool discovery, workspace selection, importing and refresh are outside that
budget. The strict replay verifies both tools through `tools/list` before serving.

## Serving

Call `ghostcrab_business_query_answer` with:

```json
{
  "workspace_id": "immeuble",
  "question": "Les quotités de chaque immeuble totalisent-elles 1000 ?",
  "as_of": "2026-09-13",
  "projection_only": true
}
```

Execute the returned `next_call` unchanged. It calls `ghostcrab_artifact_get`
with `include_answer: true`, the workspace, artifact ID, version, source digest,
contract digest and date selected by the first call. Its `answer` includes
`rows`, `ontology`, `columns`, `assumptions`, `coverage`, computation timestamp
and digests.

`answer_available: true` on the first call describes the stored materialization;
the second call revalidates freshness in a native SQLite read transaction. Only
that second response establishes current availability. Inspect its
`answer_available` and `answer.status`: `indeterminate` exposes partial evidence
without advertising a complete answer. An unavailable, ambiguous, unsupported or
date-mismatched route must not be turned into an invented answer.

`projection_only: true` guarantees no fallback to the legacy agent-fact capability
registry, including when this workspace has no prepared contract. Without it,
the existing legacy route remains available when no native contract is prepared.

## Reliability rules

- Matching uses canonical questions, explicitly declared paraphrases and limited
  normalization of accents, punctuation and polite prefixes. It preserves
  numbers, negation and additional scope. This is bounded phrase coverage, not
  general semantic matching. Competing contracts require clarification.
- The native contract declares the operation, raw predicate, ontology predicate,
  entity types, fields, units, date and explanatory columns. Validation checks
  supported structure and ontology declarations. Independent business acceptance
  is still required; structural validity does not prove domain correctness.
- Source records are scoped by workspace **and** ontology before execution.
  These operations use native `entities_raw` and `relations_raw`, not graph-cache
  rows or `agent_facts`. Explicit concrete type mappings cover this demo's
  ownership role; there is no implicit OWL inheritance inference.
- Reads do not refresh. Source or ontology-definition changes invalidate the
  prepared result. Refresh explicitly, then rediscover it. A changed artifact
  version, scope, date or digest between the two calls rejects the old binding.
- An explicit `as_of` must match the contract, including aggregations that use
  date-valid relations. If omitted, dated lease queries require today's UTC date;
  other queries use the contract's declared date. This does not reconstruct
  historical source data.
- Coverage is `declared_records_only`. No ownership edge means no owner declared
  in the imported data. It does not prove that a property has no owner.
- Missing numeric evidence, invalid intervals, missing required links/fields and
  incompatible quota bases cannot produce a complete ready answer. The demo
  quota rule is 1000 with tolerance `0.000001` and distinct lot membership.
- Limits fail explicitly: 200 result rows, 256 KiB result, 5000 records per raw
  source table, 64 KiB per record, 4 MiB hashed source bytes, 128 KiB ontology
  description and 500 contracts per discovery. Successful truncation is forbidden.

The second call's qualified `answer` is the serving interface. The legacy getter
without `include_answer` still exposes raw artifact history; that history must
not be presented as a freshness-validated answer.

## Qualification and remaining scope

The [implementation receipt](projection-two-call-implementation-validation.md)
records native, MCP, integration and installed Linux x64 checks. On the unchanged
Studio fixture, five building totals equal 1000, one lot has no declared owner,
and eight active lease roots expose incomplete evidence. Missing landlord
declarations keep the original lease result `indeterminate`.

The three templates qualify this fixed pilot. They do not qualify the other 22
Studio live views, arbitrary contracts, unrestricted paraphrases, another active
Studio database, another platform, or an external client's hidden tool-discovery
overhead. The budget snapshot remains a historical baseline read control.
Large datasets need a separately qualified revision/index mechanism: the pilot
conservatively hashes the entire bound ontology's native sources during reads.

Reproduce against a disposable fixture copy:

```sh
pnpm build
node scripts/verify-studio-projection-two-calls.mjs
```

The script exits nonzero if the fixed business expectations, two-call bindings,
negative cases, read integrity or invalidation checks fail. Use `--binary` for a
specific backend and `--root` for an installed MCP package. Source data is opened
read-only; preparation and mutation probes affect only a temporary copy.
