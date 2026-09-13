# Reliable projection answers in two MCP calls

Date: 2026-09-13. Status: bounded three-contract pilot implemented and qualified
locally; expansion and publication remain pending. Baseline:
[Studio qualification](../reference/studio-projection-two-calls-qualification.md).

Implementation: [usage and limits](../reference/qualified-projection-answers.md)
and [validation receipt](../reference/projection-two-call-implementation-validation.md).
Steps 0–3 have a local implementation and business replay for the three pilot
shapes. The original lease data deliberately remains indeterminate. Step 4's
other 22 views are not implemented. Step 5 covers an installed Linux x64 candidate
and real MCP exposure; external client qualification, other platforms and release
publication remain pending. Matching is limited to declared phrases and safe
normalization, with one held-out polite variation; broad semantic recall is not
claimed.

## Objective and boundary

A user supplies a business question and an effective workspace. For a supported,
unambiguous question with an executable, qualified projection, at most two MCP
business calls return its result, evidence, freshness, and attached explanatory
ontology. Neither discovery nor execution nor explanation depends on stored
`agent_facts`. The dedicated projection path should also avoid consulting the
agent-fact capability/schema registry; existing memory tools remain separate.

Importing the domain model, qualifying the projection, preparing persisted
snapshots, and configuring the MCP session happen before that query budget.
The two entry points must be advertised without an additional mandatory
`tool_search`, status, or workspace discovery call.

Two calls are a serving contract for bounded supported answers, not a promise
that every question can be understood or every dataset fits in one response.
Clarification, missing execution, insufficient evidence, stale data, and oversized
requests remain explicit outcomes. Never answer a different scope just to
produce something within the budget.

## 1. Validate a business contract for each projection

Keep the canonical contract in the native projection/artifact model. Initially
validate a versioned structured payload in the existing registry; inventory the
actual native catalog before adding persistent objects. Do not duplicate
descriptions into `agent_facts` for discoverability.

| Contract section | Required meaning |
| --- | --- |
| Identity | Stable contract ID, version, workspace, explicit ontology ID and version |
| Question | Canonical competency question, supported paraphrases, contrasting questions it does not answer |
| Scope and inputs | Typed entity references, period/as-of date, units, required parameters, explicit defaults |
| Execution | Native validated plan or registered evaluator, allowed sources, typed joins and predicates, output schema |
| Interpretation | Formula/filter definitions, field-to-ontology bindings, result granularity |
| Evidence and coverage | Source references, completeness requirements, assumptions, treatment of missing information |
| Freshness | Source revisions, computation date, invalidation dependencies, live versus historical behavior |
| Qualification | Fixtures and independent expected rows/values, negative cases, execution/ontology contract versions |

Each output column needs a meaning, unit where relevant, derivation and ontology
binding. “Ligne budget travaux” does not explain whether an amount is approved,
invoiced, or forecast. The ontology explains the concept; the calculation
contract explains how this answer was obtained.

Examples of required business decisions:

- **Active leases:** define active at an explicit date using actual domain
  status/date rules, including missing end dates and cancellations.
- **Lots without declared owners:** an absent ownership relation establishes a
  gap in the dataset, not that the property has no owner. Dataset-wide
  conclusions require established import coverage.
- **Quotities:** define grouping by building, applicable lots, scale and numeric
  tolerance. A total of 1,000 is this demo contract's rule, not a universal
  implicit rule for every ontology or property portfolio.

Bind actual imported predicate IDs, directions and endpoint types. Do not
silently equate similarly named graph and ontology relations. Reject missing
fields and incompatible ontology versions when preparing a projection.

## 2. Discover a compatible contract before selecting its representation

1. Filter by authorized workspace/domain and active contract status before
   ranking. Bind graph-only projections into the native catalog so the client
   does not need prior knowledge of their IDs.
2. Prefer a unique canonical-question or declared-paraphrase match after safe
   normalization. Preserve negation, quantities, units, dates, and scope.
   Even an exact phrase can require clarification for missing parameters.
3. Retrieve other candidates using lexical search and contract metadata. Domain
   aliases aid recall; optional embeddings can retrieve unseen paraphrases.
   Neither lexical nor embedding similarity proves business equivalence.
4. Compare compatible candidates on the same basis. Remove the snapshot-first
   threshold behavior. Choose a snapshot or live representation only after
   resolving the contract and requested time scope.
5. Check inputs, unsupported filters and competing interpretations. Calibrate
   thresholds and candidate margins on held-out questions. The existing
   heuristic score must not be presented as a correctness probability.
6. Return clarification for ambiguity and unsupported for incompatibility.
   Never silently drop a requested condition.

A question about overdue interventions must not select a chantier summary
because it is a snapshot. “Leases ending within 90 days” must not be answered
by an active-leases list just because both mention leases.

## 3. Execute the business definition in the native engine

Implement missing evaluators in the engine source of truth (`mindbrain-perso`),
then pin and consume the qualified revision in GhostCrab. The current vendored
`materializeWorkspacePayload` adds workspace counts. Marking those counts ready
does not produce the promised business answer.

Use validated typed plans or registered deterministic evaluators with bound
parameters, not arbitrary SQL generated from the question. The pilot should
establish the required operators before considering a general query language.

Enforce the same workspace/access scope during joins, aggregates, evidence
traversal and ontology reads. Compute results, provenance and source revisions
consistently. A persisted refresh publishes a new ready version only after
execution and output validation succeed; failures must not publish a successful
refresh state. Source changes invalidate affected materializations.

Separate these dimensions instead of overloading one state:

- Contract match: matched, ambiguous, unsupported.
- Execution: available, unimplemented, failed.
- Evidence/coverage: sufficient, partial, indeterminate.
- Freshness: current, historical, stale, unknown.

An empty result is valid only when execution and coverage justify it. Missing
evidence must not become zero, false, or an empty successful table.

For the first delivery, serve prepared materializations and retain explicit
write-based refresh. A read must not silently refresh or repair the database.
Changed source data produces stale/unavailable. A future bounded, non-persisting
computation could be separately qualified; it is not required for the initial
two-call guarantee.

## 4. Serve the bound result and explanation in two calls

The following wire additions are design targets, not existing API fields.
Reuse `ghostcrab_business_query_answer` for discovery and extend an existing
artifact/projection read for the complete answer. Return the exact second-call
name and arguments from the first call.

```text
Call 1: business_query_answer(question, workspace)
  -> match status and supported scope
  -> canonical contract and selected artifact identity
  -> contract version, ontology version, resolved parameters
  -> availability and source/materialization revision
  -> exact next_call {name, arguments}, if an answer is available

Call 2: the supplied next_call
  -> revalidate authorization, identity, parameters and revisions
  -> typed business rows or aggregate, total count and completeness
  -> source evidence and calculation description
  -> relevant ontology concepts, predicates, units and field definitions
  -> computation date, source revision, freshness and limitations
```

Bind the second call to the selected contract; do not rerun free-text ranking.
Validate expected versions and parameters on the server. An opaque handle, if
introduced, is a locator and does not substitute for authorization. A changed
contract, ontology, permission or data revision must produce an explicit mismatch
or stale outcome instead of silent substitution.

Read results and explanations at consistent revisions. Retrieve a bounded
relevant slice of the explicitly bound ontology, not the whole workspace's
ontologies or a name-based guess. Include concept IDs, human descriptions, and
the actual filter/formula. An LLM may phrase this material for the user; it
does not invent missing definitions or unsupported conclusions.

Declare payload and execution limits. Large results need an accurate bounded
summary, total count, completeness flag and reference to full data. A promise
that every row and all evidence fit in two calls requires that specific
projection to fit the limits. Pagination adds calls and must be reported.
Truncation must never appear as a complete answer.

## 5. Prove correctness beyond tool success

Preserve the audited fixture as a baseline and specify independent expected
business results from demo source data. Do not derive expectations through the
evaluator under test. Do not register evaluation questions as aliases and then
report that as general paraphrase coverage.

| Test family | Required evidence |
| --- | --- |
| Exact questions | Correct contract and parameters, not merely a route mode |
| Declared paraphrases | Same meaning and expected business result |
| Held-out paraphrases | Report correctness and coverage separately; permit justified abstention |
| Contrasts | Negation, active/expired, 30/90 days, current/historical, one building/all buildings |
| Ambiguity | Competing valid contracts produce clarification |
| Execution | Expected rows, joins, amounts, units, formula and source IDs |
| Data mutations | Add/remove an owner, cancel a lease, alter a quotity: expected outputs change accordingly |
| Coverage | Missing dates, incomplete imports and absent relations remain explicit gaps |
| Freshness | Source/contract/ontology changes invalidate answers, including between the calls |
| Isolation | Identical labels or IDs across scopes do not mix data or definitions |
| Serving | Two actual MCP tool calls return result plus explanation, without a hidden third discovery call |
| Fact independence | Zero fact rows, no fact seeding, and no agent-fact SQL on this path |
| Read integrity | No database writes, implicit refreshes, index repairs or learning writes during serving |
| Bounds | Oversized results, timeouts and truncation cannot report complete success |

Record route correctness, supported answer coverage, wrong answers, justified
abstentions, result correctness, explanation/evidence completeness, staleness
handling, latency and response size separately. Higher recall must not conceal
more confidently wrong answers.

Pilot acceptance: all fixed expected-result cases pass, zero false business
answers on the negative/isolation suite, and every advertised successful
two-call case includes a qualified result and explanation. These are measured
gates, not a universal zero-error guarantee. Set broader coverage targets using
a representative held-out set, not the six current paraphrases alone.

Retain `audit-studio-projection-two-calls.mjs` as the historical diagnostic.
Add a strict qualification runner that exits nonzero when the promised business
contract fails. The diagnostic's current exit code 0 only means the audit and
integrity checks completed.

## Delivery sequence and ownership

| Step | Deliverable | Completion gate |
| --- | --- | --- |
| 0 — Baseline | Commit report, receipt and replay script | Evidence is reviewable and explicitly unqualified |
| 1 — Pilot contracts | Active leases, undeclared owners, quotities; budget snapshot as a read control | Definitions, mappings and independent expected results are explicit |
| 2 — Native behavior | Validate/execute contracts, bind artifacts and ontologies, enforce coverage/freshness | Real engine tests for joins, absence, aggregation, invalidation and scope |
| 3 — MCP serving | Compatible ranking, clarification and complete bound second-call read | Exact/paraphrase/negative replays satisfy the full contract |
| 4 — Studio expansion | Prepare and qualify the other 22 live-view contracts | Each passes before being advertised as executable |
| 5 — Release qualification | Installed engine/MCP pair and actual client exposure | Strict business acceptance, relevant full suites, recorded revisions and archives |

Each behavioral fix gets regression coverage. Native contract/execution changes
precede the GhostCrab vendor pin and consumer changes. Studio supplies demo
examples; tests against a copied fixture do not prove its active database was
migrated. Native changes were committed on a dedicated branch/worktree in the
canonical MindBrain repository and pinned in GhostCrab's vendor submodule.
The user subsequently authorized local main integration: MindBrain `main` now
contains `500f381` and GhostCrab `main` contains `992b1c1`, including the tests
and documentation. The active Studio database remains untouched. Neither native
nor consumer changes have been published.

The first useful milestone is one correct complete business answer through the
actual two calls, followed by the three pilot query shapes. Expanding matching
before establishing correct execution only makes incomplete answers easier
to retrieve.
