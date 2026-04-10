-- V3: Layer 1→Layer 2 sync contract for mfo_facets.
--
-- Adds source_ref (nullable TEXT) so the trigger generator can track which Layer 1 row
-- originated each mfo_facets row.  Two rows types coexist:
--
--   1. "historical" rows   — source_ref IS NULL   (written by remember / upsert, unchanged V2 behaviour)
--   2. "synced" rows       — source_ref IS NOT NULL (written by generated sync triggers)
--
-- Uniqueness is enforced only for synced rows via a partial unique index, so:
--   - Two historical rows with same content are still allowed (V2 compat).
--   - Two synced rows with the same (source_ref, workspace_id) are rejected (trigger idempotence).
--   - Two synced rows with the same source_ref but different workspaces are allowed (workspace isolation).
--
-- workspace_id already exists on mfo_facets (added by migration 009).

ALTER TABLE mfo_facets
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

COMMENT ON COLUMN mfo_facets.source_ref IS
  'External Layer 1 identifier used by sync triggers. NULL for manually-written facts (V2 compat). Non-null rows are de-duplicated by (source_ref, workspace_id).';

-- Plain index for lookup by source_ref (trigger DELETE on parent-row change).
CREATE INDEX IF NOT EXISTS mfo_facets_source_ref_idx
  ON mfo_facets (source_ref)
  WHERE source_ref IS NOT NULL;

-- Partial unique index: uniqueness enforced only for synced rows.
CREATE UNIQUE INDEX IF NOT EXISTS mfo_facets_source_ref_workspace_uniq
  ON mfo_facets (source_ref, workspace_id)
  WHERE source_ref IS NOT NULL;

