# OpenClaw Query Patterns

Start with the shared query ladder:

- [shared/QUERY_PATTERNS.md](../../shared/QUERY_PATTERNS.md)

OpenClaw-specific habits:

- start with `ghostcrab_status` when autonomy, gaps, or runtime constraints may matter
- for local ingest tasks (`email`, `message`, `calendar`, `search-result`), do not start with `ghostcrab_status`
- for first-turn fuzzy GhostCrab onboarding, do not start with `ghostcrab_status`, `ghostcrab_schema_list`, or schema walkthroughs unless the user explicitly asked for runtime or schema surface details
- if the domain is new, read:
  - `ghostcrab:intent-pattern`
  - `ghostcrab:signal-pattern`
  - `ghostcrab:ingest-pattern`
  - `ghostcrab:activity-family`
  - `ghostcrab:modeling-recipe`
  - `ghostcrab:projection-recipe`
  - `ghostcrab:kpi-pattern`
- start broad with `ghostcrab_count` when presenting dashboards
- follow with `ghostcrab_search` for drill-down
- use `ghostcrab_traverse` to inspect dependencies and blockers
- use explicit `schema_id` and exact `filters` whenever the entity type is known
- for seeded product questions, prefer:
  - `ghostcrab:runtime-component`
  - `ghostcrab:roadmap-pr`
  - `ghostcrab:distribution-target`
  - `ghostcrab:constraint`
  - `ghostcrab:decision`
- refresh `ghostcrab_pack` only after at least one structured factual read
- use `ghostcrab_project` when a provisional board, heartbeat, release snapshot, or compact working scope should persist
- when the request is graph-only, keep the answer graph-only unless the user asks for cross-checking with facts
- if the user names a profile or domain, keep every read and write scoped there until you explicitly announce a switch
- if the user asks for exact sections, answer in those sections only
- after two empty or weak reads, stop exploring and disclose the ambiguity
- a zero-result exact read only means that exact read returned nothing; it does not prove global absence
- for local ingest tasks, never reuse a deadline, blocker, or entity name from a previous run
- for local ingest tasks, do not mention global runtime gaps in the final answer
- for local ingest tasks, finalize the summary before writing and write once
- for local ingest tasks, do not mention embeddings, semantic search, or retrieval backend status unless the user asked about search

## Safer Sequences For Smaller Models

When the request is fuzzy, prefer this compact routing sequence:

1. ask 2 to 4 family-shaped clarification questions first
2. if runtime health truly matters, call `ghostcrab_status`
3. one `ghostcrab_search` for `ghostcrab:intent-pattern`
4. one `ghostcrab_search` for `ghostcrab:signal-pattern`
5. one `ghostcrab_search` for the closest `ghostcrab:activity-family`
6. one `ghostcrab_search` for the matching `ghostcrab:modeling-recipe` or `ghostcrab:projection-recipe`
7. only then inspect the active demo or domain records

Do not scan broad graph roots unless the user explicitly asks for topology discovery.

When the request is a local ingest task, prefer this sequence instead:

1. one `ghostcrab_search` for `ghostcrab:intent-pattern`
2. one `ghostcrab_search` for `ghostcrab:ingest-pattern`
3. one `ghostcrab_search` for `ghostcrab:signal-pattern`
4. one local-domain read only if it changes the write decision
5. one durable summarized write if justified

Do not call `ghostcrab_status` first for local ingest tasks.
