# Studio projections in two MCP calls — qualification, 2026-09-13

This is the historical baseline before the native contract implementation.
See [qualified projection answers](qualified-projection-answers.md) for the
subsequent bounded pilot and its validation; the original measurements below
remain unchanged.

The general claim is **not qualified**: starting from a natural-language question,
the current MCP does not reliably return both the matching projection's business
result and its explanatory ontology in two calls. Zero `agent_facts` rows are
already compatible with reading graph results and native ontologies.

## Actual fixture and runtime

The replay uses `../mindbrain-personal-studio/fixtures/immeuble-demo.sqlite`,
opened read-only and backed up into a temporary SQLite database. It runs the
local GhostCrab 0.6.9 backend and the built MCP server through real stdio.
The receipt records the source fixture and backend SHA-256 hashes.

Source inventory:

| Object | Count / state |
| --- | --- |
| `agent_facts` | **0** |
| Graph entities / relations | 535 / 847 |
| `ProjectionResult` entities | 12 |
| Native ontologies | 1: `immeuble::core`, version 2.1.0 |
| Ontology entity types / edge types | 48 / 56 |
| Analysis plans | 1 |
| Registry snapshots | 8 |
| Live views | 25, all `stale` / `dirty` |

Bootstrap seeding and embeddings are disabled. All business reads leave every
SQLite table unchanged, and `agent_facts` remains empty. Startup maintenance is
recorded separately. A subsequent refresh probe mutates only the temporary copy.
The source fixture hash remains unchanged.

This proves independence from **stored agent facts**, not absence of SQL reads
against that table: capability loading and schema registry inspection still
consult it. It also does not qualify another Studio database or an installed
package on another machine.

## What already works in two calls

With the projection and ontology identifiers already known, these calls work:

```json
{
  "name": "ghostcrab_projection_get",
  "arguments": {
    "workspace_id": "immeuble",
    "collection_id": "immeuble",
    "projection_id": "chantier_erables_budget"
  }
}
```

```json
{
  "name": "ghostcrab_schema_inspect",
  "arguments": {
    "workspace_id": "immeuble",
    "schema_id": "immeuble::core"
  }
}
```

The first returns the frozen budget result: EUR 125,000 approved and EUR 132,000
forecast. Its linked `budget_line` evidence contains both numeric amounts and
`status: over_forecast`. The second returns the native ontology, including the
`budget_line` definition and its construction domain metadata, without a registry
fact. `ghostcrab_schema_get` instead returns `found: false`, because that tool
reads the agent-fact schema registry.

This is a stored snapshot read, not proof of fresh recomputation. Ontology
inspection returns the full ontology; it does not yet explain a targeted set of
result columns or automatically establish a projection-to-ontology binding.
The two identifiers above were supplied by the auditor, not discovered from the
question. MCP initialization is outside this business-call count.

## Question-driven replay

Each scenario starts with `ghostcrab_business_query_answer(question)` and, when
an artifact is selected, calls `ghostcrab_artifact_get(artifact_id)` as the second
business call. Routing runs normally, without `dry_run`.

| Questions | Expected artifact selected |
| --- | --- |
| 25 exact business questions from the live-view payloads | 23 / 25 |
| 6 reformulations | 3 / 6 |
| 1 unrelated question | Correctly returns no artifact |

These are **selection** counts, not successful complete answers.

Two exact-question deviations:

- “Quelles interventions sont en retard ou sans prestataire ?” selects the
  Érables chantier snapshot, even though the intended interventions view scores
  0.60 versus the selected snapshot's 0.36. The planner checks a snapshot
  threshold before considering a better live-view match.
- The question about open claims selects `answer_snapshot__claims_open` instead
  of `live_answer_view__sinistres_ouverts`. This stays in the same business area,
  but does not establish equivalent scope, completeness, or freshness.

The title-like reformulations “liste des baux actifs”, “liste des quotités par
immeuble”, and “liste annuaire des copropriétés” select the expected views.
These broader paraphrases return `gap_report`:

- “Montre-moi les locations en cours.”
- “Dans quels immeubles la somme des millièmes est-elle incorrecte ?”
- “Quels appartements n’ont aucun propriétaire renseigné ?”

The current matcher uses token overlap, a few fixed aliases, and mode bonuses.
It is not a general semantic-equivalence guarantee.

The selected live-view payloads contain the business question, expected output,
and refresh checks, but no business result. Neither response in this path
attaches the native ontology. `ghostcrab_pack("liste des baux actifs")` is empty
on the same fixture; it does not retrieve these live views or their graph results.

## Refresh is not yet the missing business execution

On the disposable copy, `ghostcrab_live_refresh` successfully increments
`live_answer_view__baux_actifs` to version 2 and reports `state: refreshed`.
Reading it again shows only this addition:

```json
{
  "materialized": {
    "workspace_id": "immeuble",
    "graph_entities": 535,
    "graph_relations": 847,
    "facts": 0
  }
}
```

It does not calculate the list of active leases, tenants, start dates, or
landlords. A successful refresh response therefore cannot certify the user's
business question. The native implementation currently materializes workspace
counts in `vendor/mindbrain/src/standalone/answer_artifacts.zig`.

## Contract required for the intended claim

The two-call target should be:

1. `ghostcrab_business_query_answer`: match the question against native
   projection contracts and return an unambiguous projection identity, readiness,
   and the exact second call. Explicit business questions and supported
   paraphrases belong in the projection contract, without capability facts.
2. A projection read: return the actual materialized or computed result, source
   evidence, freshness/version, and the attached native ontology explanation.
   Bind the ontology explicitly, with relevant concept, relation, and field
   definitions. Do not infer it from a label or merge different domains.

That requires three distinct changes: correct ranking/ambiguity handling;
implement or bind executable business definitions for the currently descriptive
live views; and assemble result plus ontology in the second response. Changing
the MCP envelope alone will not make the 25 live views executable. Engine-owned
execution belongs in the native engine before MCP consumer synchronization.

Qualification must cover exact questions, declared paraphrases, competing
projections, missing/stale results, unrelated questions, and workspace/ontology
isolation with zero fact rows. Ambiguity or missing execution must yield an
explicit unavailable/clarification outcome. A plan must not count as a result.

The defensible future claim is bounded: “For a prepared projection with an
available result and an unambiguous supported question, two MCP calls return the
result, its evidence, and the explanatory native ontology, without storing
`agent_facts`.” Arbitrary near-meaning questions are not automatically covered.

## Reproduce and inspect evidence

```sh
pnpm run build
node scripts/audit-studio-projection-two-calls.mjs
```

Node must support `node:sqlite`, including `backup`; the process needs permission
to listen on a local loopback port. `--fixture` and `--output` override the defaults.
The script stops its owned backend and preserves its temporary database and logs
for inspection. It never seeds facts or changes the source fixture.

Full calls, payloads, startup inventories, and read-phase digests:
[`receipt.json`](../../reports/validation/studio-projection-two-calls-20260913/receipt.json).
This baseline receipt is explicitly committed with this qualification, despite
the general `reports/` ignore rule. Use `--output /tmp/studio-projection-replay.json`
for a new run without replacing the archived baseline.
Exit code 0 means the audit completed and its integrity assertions passed; it
does **not** certify the general two-call claim.

Validation: TypeScript build, ESLint and Prettier on the audit script, and the
real MCP replay. No production routing or native execution was changed in this
qualification.

The proposed delivery plan is
[Reliable projection answers in two MCP calls](../plan/2026-09-13-projection-two-call-reliability.md).
