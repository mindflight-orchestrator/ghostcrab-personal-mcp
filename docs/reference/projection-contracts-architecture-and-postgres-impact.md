# Projection contracts: architecture and PostgreSQL impact

Date: 2026-09-13. This report preserves the explanation of the last three
GhostCrab changes and assesses the corresponding PostgreSQL surface. It is an
analysis, not a PostgreSQL implementation or a migration authorization.

## Philosophy

A projection is a prepared, executable business contract. It declares the
question, supported formulations, scope, source entities and relations, formula
or filter, date, units, output meanings, evidence and completeness assumptions.
The ontology describes concepts and relations; the projection contract describes
how those concepts produce this particular answer. Structural validation still
requires independent business acceptance.

The serving budget is two MCP calls after preparation: select the appropriate
contract, then validate and return its result together with relevant ontology
definitions, evidence and explanations. Import, contract creation, refresh and
MCP tool exposure happen before this budget. Source changes invalidate an answer;
reads never repair or refresh it implicitly. Missing declarations remain gaps in
the dataset, not assertions about the real world.

## Commits and ownership

| Commit | Repository | Change |
| --- | --- | --- |
| `bf80d07` | GhostCrab Personal | Audited the Studio fixture, saved reproducible evidence and designed the reliability plan. A declared projection was not sufficient proof of an executable answer. |
| `992b1c1` | GhostCrab Personal | Added qualified projection routing and bound answer retrieval, three pilot contracts, regression tests, replay scripts and installed-package qualification; pinned the native change. |
| `a5f8a96` | GhostCrab Personal | Recorded local main integration and clarified existing-tool behavior. Documentation only. |
| `500f381` | MindBrain Personal | Implemented native contract validation, execution, explanation and freshness checks. This is a separate engine commit referenced by GhostCrab's submodule. |

In GhostCrab, `projection-contract-route.ts` matches canonical questions,
declared paraphrases and limited safe normalization. Numbers, negation and added
scope are preserved; ambiguity causes clarification. This does not implement
general semantic retrieval. `ghostcrab_business_query_answer` supplies the exact
second call, and `projection_only: true` prohibits the legacy agent-fact fallback.
`ghostcrab_artifact_get` checks workspace, version, date and source/contract
digests before exposing the native qualified answer. Existing legacy ranking was
also corrected so that a weaker snapshot cannot outrank a stronger live view.

In MindBrain Personal, `projection_contract.zig` executes `missing_inbound`,
`group_sum` and `dated_relations` against native `entities_raw`/`relations_raw`,
scoped by workspace and ontology. Existing create/refresh functions validate and
materialize contracts atomically. The existing HTTP getter adds `answer_json`
with native freshness validation inside one SQLite read snapshot. No new table
or MCP tool was introduced.

The pilots cover missing owner declarations, building quotities and active
leases. The first two produce qualified complete answers on the Studio fixture;
lease evidence remains indeterminate. The other 22 views are unqualified.
Studio code and its active database were not changed: qualification uses a
read-only fixture and disposable copies.

See [usage](qualified-projection-answers.md) and the
[implementation validation](projection-two-call-implementation-validation.md)
for the tests, installed-runtime proof and limits.

## PostgreSQL assessment

**The same answer-artifact gap exists in PostgreSQL, including the tested 3.4
runtime. The Personal commits do not automatically change PostgreSQL.** PostgreSQL
already has stronger reusable graph-contract, revision and access primitives, so
the appropriate follow-up is to connect an executable projection contract to
those primitives and to its consumer, rather than port the SQLite executor
verbatim.

### Source and runtime identities

| Surface | Verified identity |
| --- | --- |
| Checked-out PostgreSQL branch | `research/graphrag-mindbrain-comparison`, `7eff65b0cf62035c6082ef05c3e6905306e81e69`; control file declares 3.2 |
| PostgreSQL local main | `86689a4c8eee73b89c0b4fcb247f6db7a2ee10e0`; control file declares 3.4 |
| Existing test server, inspected read-only | Actual `pg_extension.extversion = 3.4`, PostgreSQL 17.11 |
| Disposable reproduction | Image `pg-mindbrain:3.4-86689a4`, actual extension 3.4, PostgreSQL 17.11; immutable image ID recorded in receipt |

The answer-artifact canonical SQL is identical between the checked-out branch
and main. The bodies of `answer_artifact_create`, `answer_artifact_refresh` and
`answer_artifact_get` were compared with runtime `pg_proc.prosrc`: all three
match the source exactly. This avoids attributing an old branch's behavior to a
different runtime merely from its image tag. PostgreSQL's branch and existing
untracked files were preserved.

### Findings by layer

| Concern | Qualified Personal pilot | Current PostgreSQL answer-artifact path |
| --- | --- | --- |
| Contract validation | Typed versioned contract, ontology and field bindings | Nonempty JSON definition; no projection-contract interpretation |
| Refresh | Executes the selected operation | Counts workspace, graph entities, graph relations and agent facts |
| Independence from facts | Dedicated path avoids fact reads | Refresh explicitly reads `mb_core.agent_facts`, even when empty |
| Explanation | Relevant ontology slice, column meanings, assumptions and evidence | Getter returns the registry payload; no automatic attached explanatory ontology |
| Source freshness | Revalidated during the bound read | Source mutation does not invalidate or reject registry retrieval |
| Two-call binding | Workspace, artifact version, contract/source digests and date | Workspace is checked; proposed `expected_*` options are ignored |
| Engine-owned result | `qualified_result` is reserved | Only `materialized` is reserved; `qualified_result` is ordinary caller JSON |
| Business qualification | Fixed expected totals/rows, partial evidence and negative cases | Existing registry suite asserts generic counters, events, taxonomy and isolation |

Primary source:
[`33_mb_pragma-functions.sql`](../../../pg_mindbrain/sql/src/canonical/33_mb_pragma-functions.sql)
— `answer_artifact_create` at line 567, `answer_artifact_get` at line 732,
`answer_artifact_refresh` at line 844. The refresh's counts are at lines 885–891;
the existing test explicitly expects them in
[`answer_artifacts_test.sql`](../../../pg_mindbrain/test/sql/pragma/answer_artifacts_test.sql)
around lines 279–290.

PostgreSQL already preserves useful guarantees: `(workspace_id, artifact_id)`
ownership, same-workspace event foreign keys, an advisory lock for idempotent
creation, `FOR UPDATE` on refresh, version increments and update events. Keep
these guarantees when adding business execution.

`mb_ontology.ghostcrab_projection_get`/`projection_get` are a different existing
path: they read graph `ProjectionResult` snapshots, optional linked evidence and
deltas. They do not evaluate an arbitrary question or automatically supply the
projection's ontology explanation and current source validity. A frozen snapshot
and an `is_terminal_answer` flag do not themselves prove current business truth.
See [the implementation](../../../pg_mindbrain/sql/src/canonical/35_mb_ontology-functions.sql)
at lines 3770–3970. Existing snapshot consumers need compatibility protection.

### What PostgreSQL already offers to reuse

- **Versioned ontology composition:** `mb_graph.contract_preview`, `contract_compile`
  and `contract_snapshot` work with ontology releases, content hashes and compiled
  type/relation maps. `contract_validate_payload` validates graph payloads against
  these definitions. These are graph-schema contracts, not the new business-query
  projection contracts. Sources: `36c_mb_graph-contract-functions.sql` and
  `36d_mb_graph-contract-runtime-functions.sql`.
- **Source lineage:** entities and relations carry `graph_contract_release_id`;
  raw records and dependent fields also have lineage machinery. PostgreSQL's
  scope model is not the SQLite `ontology_id` filter copied verbatim. Bind the
  selected ontology release/member explicitly and qualify cross-ontology joins.
- **Durable graph revisions:** `mb_graph.workspace_revision.logical_revision`
  advances with graph changes. It is a candidate freshness anchor instead of
  hashing every source row on each read. Verify coverage of every dependency,
  including raw records, facet values and metadata read by the evaluator; a
  graph revision alone must not be assumed to cover them all. Sources:
  `12_graph-tables.sql:431`, `32_graph-functions.sql:4436` and following triggers.
- **Semantic context and reference checks:** `mb_core.semantic_context_snapshot`
  and `validate_context_refs` already provide hashes, graph logical-revision
  checks, missing/stale outcomes and bounded output. The snapshot explicitly
  does **not** expose projection content and requires an identity-bound host
  wrapper. Its `projections` section inventories `mb_core.projections`, not
  qualified answer-artifact rows. Reuse relevant checks without claiming that
  this existing inventory is already an executable-answer endpoint. Source:
  `47_mb_context-functions.sql:48`, `:77`, `:458` and `:816`.
- **Audience and access controls:** `mb_access.authorized_entity_ids`, governed
  graph reads, projection variants and policy-release bindings already exist.
  A result, its evidence, ontology visibility and even its aggregate counts must
  use the same effective access scope. Merely naming a workspace is not an
  authorization decision. Sources: `46_mb_access-functions.sql:993`,
  `33_mb_pragma-functions.sql:376` and `test/sql/access/projection_variants_test.sql`.

### Runtime reproduction

The diagnostic starts its own container with no network and ephemeral data, runs
the existing PostgreSQL answer-artifact regression file, then runs seven probes.
It removes only that container. The existing test server was used solely for
read-only catalog inspection; no active database was refreshed or migrated.

Observed outcomes on actual extension 3.4:

1. A `projection_contract` with unsupported version 999 and a nonexistent ontology
   is accepted as ordinary definition JSON.
2. Two different operations, `group_sum` and `missing_inbound`, produce identical
   generic counters apart from their timestamps. No business rows are computed.
3. Refresh returns `fact_count: 0`; its matched source definition explicitly
   queries `mb_core.agent_facts`. Empty facts do not prove absence of fact reads.
4. After adding a graph entity, the getter still returns the old entity count 0
   with state `active`, although the source now has one entity.
5. Deliberately incorrect `expected_version` and `expected_source_digest` options
   do not reject the read. They are not part of this PostgreSQL contract yet.
6. Caller-supplied `qualified_result` is accepted as ordinary payload JSON. This
   is not a native qualified answer and must never be interpreted as one by a
   newly ported consumer solely because that key exists.
7. Neither refresh nor get produces the qualified answer plus ontology envelope.

The existing answer-artifact test file **passes**. The diagnostic also succeeds
because it reproduces these expected baseline gaps. Its success is explicitly
not qualification of the desired feature.

Evidence:

- [Runtime receipt and complete probe calls](../../reports/validation/postgres-projection-impact-20260913/receipt.json)
- [Existing registry regression log](../../reports/validation/postgres-projection-impact-20260913/existing-answer-artifacts-test.log)
- [Reproduction script](../../scripts/audit-postgres-projection-impact.py)

Reproduce from this repository with the named local Docker image available:

```sh
python3 scripts/audit-postgres-projection-impact.py
```

The script expects the currently audited baseline. A later implementation should
change its expected-gap assertions into positive feature acceptance or preserve
this script as a historical diagnostic and add a separate qualification runner.
This audit did not execute the full PostgreSQL suite or a PostgreSQL MCP client.

### Required follow-up and impact boundary

1. Start the PostgreSQL implementation from the intended main revision, not the
   older research checkout. Add a versioned business projection contract to the
   existing artifact model with reserved computed output and explicit capability
   detection. An older engine must not silently accept and ignore the contract.
2. Validate the question/operation/output bindings against the selected ontology
   releases and existing graph contracts, retaining immutable source lineage.
3. Execute bounded, typed native SQL plans in refresh, with missing-data,
   temporal, unit and coverage rules. Preserve the existing transaction/locking
   and workspace ownership guarantees.
4. Bind the prepared answer to all dependency revisions, ontology releases,
   effective access/policy scope and explicit date. Return the business rows,
   explanations and allowed evidence together, and revalidate this binding on
   read. Preserve a compatible legacy getter.
5. Adapt and qualify the PostgreSQL MCP consumer separately for question matching
   and the exact second call. SQL functions alone do not prove two MCP calls.
   Personal expects different response/state conventions (`answer_json`,
   `refreshed`), whereas PostgreSQL currently returns an `artifact` wrapper with
   `payload_json` as JSONB and state `active`; account for those differences.
6. Replay independent expected sums, missing ownership and dated leases, then
   mutation, ambiguous/negative question, concurrent revision, wrong workspace,
   ontology/policy change, unauthorized evidence, bounds and zero-fact-read
   cases. Include fresh/upgrade packaging and installed consumer qualification
   when delivering the actual feature.

No PostgreSQL source, consumer, schema or migration was changed by this audit.
Its runtime and source evidence establish the answer-artifact gap, not the
behavior of every PostgreSQL projection pipeline or downstream application.
The Personal changes remain local to its engine and MCP; PostgreSQL requires its
own implementation and acceptance gates before making the same two-call claim.
