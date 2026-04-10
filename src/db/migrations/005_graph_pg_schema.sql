-- V2: graph.* canonical schema aligned with pg_dgraph when the extension is absent.
-- When pg_dgraph is installed (CREATE EXTENSION), objects already exist — CREATE IF NOT EXISTS is a no-op.
-- SQL-only deployments get entity/relation/alias tables without roaringbitmap adjacency indexes.

CREATE SCHEMA IF NOT EXISTS graph;

CREATE TABLE IF NOT EXISTS graph.entity (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type text NOT NULL,
  name text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confidence real NOT NULL DEFAULT 1.0
    CHECK (confidence BETWEEN 0 AND 1),
  deprecated_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'graph' AND table_name = 'entity' AND column_name = 'search_vec'
  ) THEN
    ALTER TABLE graph.entity
      ADD COLUMN search_vec tsvector
        GENERATED ALWAYS AS (
          to_tsvector(
            'english',
            coalesce(type, '') || ' ' ||
            coalesce(name, '') || ' ' ||
            coalesce(metadata->>'description', '') || ' ' ||
            coalesce(metadata->>'domain', '') || ' ' ||
            coalesce(metadata->>'tags', '') || ' ' ||
            coalesce(metadata->>'keywords', '')
          )
        ) STORED;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS entity_type_name_uidx
  ON graph.entity (type, name);

CREATE INDEX IF NOT EXISTS entity_deprecated_at_idx
  ON graph.entity (deprecated_at) WHERE deprecated_at IS NULL;

CREATE INDEX IF NOT EXISTS entity_search_vec_idx
  ON graph.entity USING GIN (search_vec);

CREATE INDEX IF NOT EXISTS entity_confidence_idx
  ON graph.entity (confidence);

CREATE INDEX IF NOT EXISTS entity_domain_idx
  ON graph.entity ((metadata->>'domain'))
  WHERE metadata IS NOT NULL AND deprecated_at IS NULL;

CREATE INDEX IF NOT EXISTS entity_type_confidence_idx
  ON graph.entity (type, confidence DESC) WHERE deprecated_at IS NULL;

CREATE TABLE IF NOT EXISTS graph.entity_alias (
  term text NOT NULL,
  entity_id bigint NOT NULL REFERENCES graph.entity(id) ON DELETE CASCADE,
  confidence real NOT NULL DEFAULT 1.0
    CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (term, entity_id)
);

CREATE INDEX IF NOT EXISTS entity_alias_term_idx ON graph.entity_alias (term);
CREATE INDEX IF NOT EXISTS entity_alias_entity_id_idx ON graph.entity_alias (entity_id);
CREATE INDEX IF NOT EXISTS entity_alias_term_conf_idx ON graph.entity_alias (term, confidence DESC);

CREATE TABLE IF NOT EXISTS graph.relation (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type text NOT NULL,
  source_id bigint NOT NULL REFERENCES graph.entity(id) ON DELETE CASCADE,
  target_id bigint NOT NULL REFERENCES graph.entity(id) ON DELETE CASCADE,
  valid_from date,
  valid_to date,
  confidence real NOT NULL DEFAULT 1.0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deprecated_at timestamptz,
  run_id bigint,
  patch_id bigint
);

CREATE INDEX IF NOT EXISTS relation_source_id_idx ON graph.relation (source_id);
CREATE INDEX IF NOT EXISTS relation_target_id_idx ON graph.relation (target_id);
CREATE INDEX IF NOT EXISTS relation_type_idx ON graph.relation (type);
CREATE INDEX IF NOT EXISTS relation_source_type_idx ON graph.relation (source_id, type);
CREATE INDEX IF NOT EXISTS relation_run_id_idx ON graph.relation (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS relation_patch_id_idx ON graph.relation (patch_id) WHERE patch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS relation_deprecated_at_idx ON graph.relation (deprecated_at) WHERE deprecated_at IS NULL;
CREATE INDEX IF NOT EXISTS relation_src_type_conf_idx
  ON graph.relation (source_id, type, confidence DESC) WHERE deprecated_at IS NULL;
CREATE INDEX IF NOT EXISTS relation_tgt_type_conf_idx
  ON graph.relation (target_id, type, confidence DESC) WHERE deprecated_at IS NULL;

COMMENT ON SCHEMA graph IS 'Canonical knowledge graph (pg_dgraph-aligned). Prefer graph.* over legacy mfo_nodes/mfo_edges.';
