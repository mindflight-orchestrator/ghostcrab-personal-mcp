-- V2: Align mfo_projections with pg_pragma SQL expectations (generated aliases + FTS column).

ALTER TABLE mfo_projections ADD COLUMN IF NOT EXISTS projection_type text
  GENERATED ALWAYS AS (proj_type) STORED;

ALTER TABLE mfo_projections ADD COLUMN IF NOT EXISTS user_id text
  GENERATED ALWAYS AS (agent_id) STORED;

ALTER TABLE mfo_projections ADD COLUMN IF NOT EXISTS item_id uuid
  GENERATED ALWAYS AS (source_ref) STORED;

ALTER TABLE mfo_projections ADD COLUMN IF NOT EXISTS rank_hint double precision
  GENERATED ALWAYS AS (weight::double precision) STORED;

ALTER TABLE mfo_projections ADD COLUMN IF NOT EXISTS confidence double precision
  GENERATED ALWAYS AS (weight::double precision) STORED;

ALTER TABLE mfo_projections ADD COLUMN IF NOT EXISTS content_tsvector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_mfo_proj_content_tsvector
  ON mfo_projections USING GIN (content_tsvector);
