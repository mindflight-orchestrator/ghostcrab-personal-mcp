-- V2: Materialized facet keys as real columns (pg_facets-friendly).
-- Note: facets.add_faceting_to_table requires an integer document key column (int2/int4/int8).
-- mfo_facets.id is UUID; add a surrogate facet_row_id in migration 008+ before calling add_faceting_to_table.
-- Until then, search/count continue using portable SQL; native pg_facets APIs activate after registration.

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_record_id text
  GENERATED ALWAYS AS (facets->>'record_id') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_activity_family text
  GENERATED ALWAYS AS (facets->>'activity_family') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_title text
  GENERATED ALWAYS AS (facets->>'title') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_label text
  GENERATED ALWAYS AS (facets->>'label') STORED;

COMMENT ON COLUMN mfo_facets.facet_record_id IS 'Mirrors facets->>record_id for pg_facets plain_facet registration.';
