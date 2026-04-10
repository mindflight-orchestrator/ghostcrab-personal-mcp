-- V3: Specialized Layer 2 tables for PostGIS coordinates and pgvector embeddings.
-- These data types cannot live in mfo_facets JSONB — they require dedicated columns
-- with native index support (GIST for geo, IVFFlat for vectors).
-- Requires: PostGIS extension, pgvector extension, migration 009 (mindbrain schema).
-- Fully idempotent (IF NOT EXISTS everywhere).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. geo_entities (requires PostGIS — skipped gracefully if not installed)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Check whether PostGIS is installed before creating geometry columns.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'geo_entities'
    ) THEN
      EXECUTE '
        CREATE TABLE public.geo_entities (
          id            BIGSERIAL   PRIMARY KEY,
          source_ref    TEXT        NOT NULL,
          workspace_id  TEXT        NOT NULL DEFAULT ''default'',
          schema_id     TEXT,
          geom          geometry,
          bbox          geometry,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT geo_entities_source_workspace_uniq UNIQUE (source_ref, workspace_id)
        )
      ';

      EXECUTE '
        COMMENT ON TABLE public.geo_entities IS
          ''Layer 2 specialized table for PostGIS geometries. source_ref links back to the Layer 1 source record.''
      ';

      EXECUTE 'CREATE INDEX geo_entities_geom_gist ON public.geo_entities USING GIST (geom)';
      EXECUTE 'CREATE INDEX geo_entities_bbox_gist ON public.geo_entities USING GIST (bbox)';
      EXECUTE 'CREATE INDEX geo_entities_workspace_id_idx ON public.geo_entities (workspace_id)';
      EXECUTE 'CREATE INDEX geo_entities_schema_id_idx ON public.geo_entities (schema_id)';
    END IF;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. embedding_vectors (requires pgvector — skipped gracefully if not installed)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'embedding_vectors'
    ) THEN
      EXECUTE '
        CREATE TABLE public.embedding_vectors (
          id            BIGSERIAL   PRIMARY KEY,
          source_ref    TEXT        NOT NULL,
          workspace_id  TEXT        NOT NULL DEFAULT ''default'',
          schema_id     TEXT,
          embedding     vector(1536),
          model_id      TEXT        NOT NULL DEFAULT ''text-embedding-3-small'',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT embedding_vectors_source_workspace_model_uniq
            UNIQUE (source_ref, workspace_id, model_id)
        )
      ';

      EXECUTE '
        COMMENT ON TABLE public.embedding_vectors IS
          ''Layer 2 specialized table for pgvector embeddings. source_ref links back to the Layer 1 source record.''
      ';

      EXECUTE 'CREATE INDEX embedding_vectors_workspace_id_idx ON public.embedding_vectors (workspace_id)';
      EXECUTE 'CREATE INDEX embedding_vectors_schema_id_idx ON public.embedding_vectors (schema_id)';

      -- IVFFlat: attempt creation; silently skips if insufficient rows.
      BEGIN
        EXECUTE '
          CREATE INDEX embedding_vectors_ivfflat_idx
          ON public.embedding_vectors
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 100)
        ';
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
  END IF;
END;
$$;
