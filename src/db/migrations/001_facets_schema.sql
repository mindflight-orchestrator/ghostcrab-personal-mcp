CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS mfo_facets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id TEXT NOT NULL,
  content TEXT NOT NULL,
  facets JSONB NOT NULL DEFAULT '{}',
  embedding vector(1536),
  bm25_vector tsvector GENERATED ALWAYS AS
    (to_tsvector('english', content)) STORED,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  supersedes UUID REFERENCES mfo_facets(id),
  valid_from DATE,
  valid_until DATE,

  CONSTRAINT chk_valid_range CHECK (
    valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until
  )
);

CREATE INDEX IF NOT EXISTS idx_mfo_facets_schema
  ON mfo_facets(schema_id);

CREATE INDEX IF NOT EXISTS idx_mfo_facets_facets
  ON mfo_facets USING GIN(facets);

CREATE INDEX IF NOT EXISTS idx_mfo_facets_bm25
  ON mfo_facets USING GIN(bm25_vector);

CREATE INDEX IF NOT EXISTS idx_mfo_facets_created
  ON mfo_facets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mfo_facets_valid
  ON mfo_facets(valid_until)
  WHERE valid_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mfo_facets_embedding
  ON mfo_facets USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION mfo_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mfo_facets_updated_at ON mfo_facets;

CREATE TRIGGER trg_mfo_facets_updated_at
  BEFORE UPDATE ON mfo_facets
  FOR EACH ROW
  EXECUTE FUNCTION mfo_set_updated_at();
