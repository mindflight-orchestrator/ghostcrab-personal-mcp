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
