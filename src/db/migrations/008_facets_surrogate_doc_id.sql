-- V2: Add integer surrogate key for pg_facets registration.
-- pg_facets.add_faceting_to_table() requires an integer document key column (int2/int4/int8).
-- mfo_facets.id is UUID; doc_id is the internal surrogate key for the bitmap engine.
-- The UUID id remains the public API identifier — doc_id is never exposed in MCP payloads.

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS doc_id bigint
  GENERATED ALWAYS AS IDENTITY;

CREATE UNIQUE INDEX IF NOT EXISTS mfo_facets_doc_id_uidx
  ON mfo_facets (doc_id);

COMMENT ON COLUMN mfo_facets.doc_id IS
  'Integer surrogate key for pg_facets bitmap registration. Not exposed in MCP API. See docs/pg_facets_surrogate_key_strategy.md.';
