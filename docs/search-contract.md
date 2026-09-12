# Plan selection and search contracts

`ghostcrab_pack` now distinguishes two operations explicitly:

- `selection_mode: "search"` (default) discovers plans using `query` as text.
- `selection_mode: "exact"` reads one active, unexpired plan by its workspace,
  agent and exact `scope`. Optional `plan_id` is the physical projection row ID,
  not a business question or scope suffix. The original `query` still searches
  the facts and is returned unchanged.

```json
{
  "workspace_id": "my-workspace",
  "agent_id": "agent:self",
  "scope": "my-workspace:launch-blockers",
  "selection_mode": "exact",
  "query": "What currently blocks launch?"
}
```

Use `plan_id` to resolve multiple plans sharing a scope. `plan_not_found` and
`ambiguous_plan` are selection errors; neither means business facts are absent.
Exact selection never substitutes a global or foreign-scope plan. An empty
text search does not trigger a more permissive lookup. Results remain in
`pack`; consumers must not expect an invented `artifact` field.

## Personal

Exact selection requires the updated native backend. The endpoint's explicit
`selection_mode` echo is checked; an older/invalid response yields
`exact_selection_unavailable` without SQL substitution. Native engine commit
`95af807` was implemented and validated in the master `mindbrain-perso`
repository before synchronizing `vendor/mindbrain`.

FTS query preparation preserves Unicode letters and normalizes composed
accents, while treating punctuation as token separators and quoting FTS tokens.
This aligns accented queries with SQLite FTS5 rather than deleting letters.

`ghostcrab_combined_search` / `ghostcrab_csearch` accept
`collection_facet_value` separately from the free-text `query`. Resolve that
value from the vocabulary, together with the collection facet namespace and
dimension. Without it, the collection value fallback is skipped with an
explanatory note; graph and fact text retrieval continue. Existing callers
that deliberately searched a facet value via `query` must now pass it as
`collection_facet_value` too. No automatic phrase-to-taxonomy translation is
implied. Direct `ghostcrab_collection_facet_search` is unchanged.

Regression command (disposable backend only):
`GHOSTCRAB_SEARCH_TEST_MINDBRAIN_URL=http://127.0.0.1:18095 npm test -- tests/tools/search-handoff-native.test.ts`

## Replay the historical Personal ticket

After rebuilding `dist` and the native backend, run the real MCP stdio replay
against the supplied re-test kit directory (the original handoff's `PERSO`
directory also works):

```bash
node scripts/verify-search-ticket.mjs \
  --kit /path/to/ghostcrab-0.6.8-retest-20260912 \
  --output /tmp/search-ticket-candidate.json
```

The script requires Node with `node:sqlite`, the supplied seed and
expected-request metadata. It copies the verified seed
to a new temporary directory and starts its own backend on a free loopback port.
It waits for MCP initialization beyond the handshake, then records full MCP
responses, forwarded native requests, binary/dist hashes and per-table SQLite
digests. Initialization, synthetic fixture writes, and read effects are separate
phases. Fixture preparation uses `ghostcrab_remember` to populate the French fact
and its index. All table and schema digests must remain unchanged during reads.
The original seed is verified again at the end. The temporary copy
and logs remain at the path printed with the receipt.

`--root /path/to/rebuilt/checkout --baseline` validates the historical defects
instead of the candidate contract. `--binary /path/to/ghostcrab-backend` selects
the exact native artifact. A baseline success means the old defects were
reproduced; only candidate mode validates exact selection, disambiguation,
accented retrieval and explicit collection facet values.

For the launch ticket, the corrected MCP arguments are:

```json
{
  "workspace_id": "project-management-web-fixture",
  "scope": "project-management-web-fixture:launch-blockers-and-open-qa",
  "selection_mode": "exact",
  "plan_id": "95766b38-b599-45c2-98fd-62cdba66de95",
  "query": "What currently blocks launch and which QA findings remain open?",
  "limit": 8
}
```

The default agent is `agent:self`; supply the routed agent explicitly when it
differs. The unchanged historical request keeps its lexical search semantics.
