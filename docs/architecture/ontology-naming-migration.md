# Ontology Naming Migration

This note summarizes the ontology naming cleanup so downstream projects can adapt their schemas, SQL, and code references.

## What Changed

MindBrain no longer uses the legacy `mfo` naming in project-owned schemas, SQL, tests, examples, or runtime identifiers.

The durable ontology tables now use unprefixed names:

| Legacy name | Current name |
| --- | --- |
| `mfo_facets` | `facets` |
| `mfo_projections` | `projections` |
| `mfo_agent_state` | `agent_state` |
| `mfo_projection_types` | `projection_types` |

Related indexes, triggers, and helper names were renamed to match the current table names.

## SQL Changes

Update table references in downstream SQL:

```sql
-- Legacy
SELECT * FROM mfo_facets WHERE workspace_id = $1;
INSERT INTO mfo_projections (...);

-- Current
SELECT * FROM facets WHERE workspace_id = $1;
INSERT INTO projections (...);
```

Update related object names if your downstream code references them directly:

| Legacy pattern | Current pattern |
| --- | --- |
| `mfo_facets_*` | `facets_*` |
| `idx_mfo_facets_*` | `idx_facets_*` |
| `idx_mfo_proj_*` | `idx_proj_*` |
| `trg_mfo_facets_*` | `trg_facets_*` |
| `mfo_set_updated_at()` | `set_updated_at()` |

## Runtime And API Changes

The standalone Zig ontology helper names were cleaned up:

| Legacy symbol | Current symbol |
| --- | --- |
| `MfoFacetRecord` | `FacetRecord` |
| `upsertMfoFacet` | `upsertFacet` |
| `mfoFacetFromRow` | `facetFromRow` |
| `deinitMfoFacetRecord` | `deinitFacetRecord` |

The ontology schema id changed:

| Legacy schema id | Current schema id |
| --- | --- |
| `mfo:ontology` | `mindbrain:ontology` |

Downstream projects should write new ontology rows with `mindbrain:ontology`. Existing persisted rows using the legacy schema id should be migrated if they must remain queryable under the current contract.

## Pragma Example Changes

The legacy pragma example schema and DSNs were renamed:

| Legacy value | Current value |
| --- | --- |
| `"mfo-server"` | `"memory-server"` |
| database name `mfo` | database name `mindbrain` |
| user/password `mfoserver` | user/password `mindbrain` |

The runtime mode environment variable documented in SOP notes changed:

| Legacy env var | Current env var |
| --- | --- |
| `MFO_NATIVE_EXTENSIONS` | `MINDBRAIN_NATIVE_EXTENSIONS` |

## Downstream Checklist

1. Search your codebase for `mfo_`, `mfo:`, `mfo-server`, `Mfo`, and `MFO`.
2. Replace table names, object names, and helper symbols using the mappings above.
3. Migrate persisted ontology rows from `mfo:ontology` to `mindbrain:ontology` if needed.
4. Update SQL tests and fixtures to insert into `facets` and `projections`.
5. Rebuild generated clients or bindings that expose the old helper names.
6. Run your full SQL and application test suites after applying the rename.

## Verification In MindBrain

The cleanup was verified with:

- Targeted searches showing no project-owned runtime references to the legacy naming.
- `zig build test`.
- IDE lint checks on edited source files.
- `git diff --check`.

Incidental third-party substrings such as `ParamFormats`, `SystemFont`, or vendored language-code data are not part of the MindBrain naming contract.
