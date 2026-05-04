# Path and content facets (repository ingest)

**Intake:** [ONBOARDING_CONTRACT.md](./ONBOARDING_CONTRACT.md). **Schema habits:** [SCHEMA_DESIGN.md](./SCHEMA_DESIGN.md).

Use this vocabulary when turning **files** (repo paths, vault paths, URLs) into durable GhostCrab facts so `ghostcrab_search` and `ghostcrab_count` can filter by **where** something came from and **what kind of material** it is—without storing entire files in facet JSON.

## What goes in `content` vs facets

- **`content`** — Short, human-durable summary of the finding (what matters for recovery, decisions, or the next step). This is what packs and humans read first.
- **Facets** — Stable, **low-cardinality or bounded** dimensions you will actually filter or group on (`path_top_level`, `syntax`, `content_class`, …).

Do **not** put full file bodies, long stack traces, or unbounded token lists into facets. If you need verbatim excerpts, use a dedicated field or schema designed for that, not ad hoc facet blobs.

## Path axes

| Facet key | Purpose | Example values |
|-----------|---------|----------------|
| `path_repo_relative` | Repo-root-relative path of the source file | `shared/demo-profiles/knowledge-base.jsonl` |
| `path_top_level` | First path segment (or agreed root bucket) | `shared`, `scripts`, `openclaw` |
| `path_extension` | File suffix without dot | `jsonl`, `md`, `mjs` |
| `path_role` | Role of the path in the integration repo | `shared_doc`, `script`, `scenario`, `skill` |

Use **forward slashes** and no leading `./` in portable seeds. Normalize to the same convention your team uses in search filters.

## Content-shape axes

| Facet key | Purpose | Example values |
|-----------|---------|----------------|
| `content_class` | Coarse shape of the source | `prose`, `code`, `config`, `data` |
| `syntax` | Language or format when useful for filters | `markdown`, `typescript`, `yaml`, `jsonl` |
| `logical_section` | Stable section label inside the file | `Facet Rules`, `validatePortableSeedFiles`, `profile` |
| `section_heading_path` | Optional breadcrumb for markdown-like sources | `Schema Design > Facet Rules` |

`section_heading_path` is optional; prefer `logical_section` when a single stable slug is enough for retrieval.

## Provenance and analysis

| Facet key | Purpose | Example values |
|-----------|---------|----------------|
| `analysis_method` | How the facets were produced | `human_curated`, `static_seed`, `ast`, `regex_extract` |
| `line_span_hint` | Approximate line range (documentation only) | `40-55`, `1-12` |

Do not claim `content_sha256` or similar unless your pipeline actually computes and stores it.

## Domain and portable demos

Portable demo profiles keep a **single** `facets.domain` string per profile (see `shared/demo-profiles/codebase-intelligence.jsonl`). Production workspaces may use your real `workspace_id` or schema family instead; the keys above stay the same.

## Anti-patterns

- Decorative facets that never appear in `ghostcrab_search` filters or `ghostcrab_count` groupings.
- Duplicating the full `path_repo_relative` in three differently named keys.
- Mixing multiple `facets.domain` values inside one demo profile (validator enforces one domain per profile).

## See also

- Demo profile: `shared/demo-profiles/codebase-intelligence.jsonl`
- Chooser: [DEMO_CHOOSER.md](./DEMO_CHOOSER.md)
