-- V3: Workspace semantic annotations for synthetic generation contracts.
-- Idempotent. No derivation_semantics table (sync_spec remains operational via triggers).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Optional semantic proposal on pending DDL (stored until execute)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mindbrain.pending_migrations
  ADD COLUMN IF NOT EXISTS semantic_spec JSONB;

COMMENT ON COLUMN mindbrain.pending_migrations.semantic_spec IS
  'Optional TableSemantic/ColumnSemantic/RelationSemantic proposal (JSON). Applied to mindbrain.* on ddl_execute.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mindbrain.table_semantics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mindbrain.table_semantics (
  workspace_id     TEXT        NOT NULL REFERENCES mindbrain.workspaces(id) ON DELETE CASCADE,
  table_schema     TEXT        NOT NULL DEFAULT 'public',
  table_name       TEXT        NOT NULL,
  business_role    TEXT,
  generation_strategy TEXT     NOT NULL DEFAULT 'unknown'
    CHECK (generation_strategy IN ('synthetic', 'replay', 'hybrid', 'unknown')),
  emit_facets      BOOLEAN     NOT NULL DEFAULT TRUE,
  emit_graph_entity BOOLEAN    NOT NULL DEFAULT FALSE,
  emit_graph_relation BOOLEAN  NOT NULL DEFAULT FALSE,
  notes            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, table_schema, table_name)
);

CREATE INDEX IF NOT EXISTS table_semantics_workspace_idx
  ON mindbrain.table_semantics (workspace_id);

COMMENT ON TABLE mindbrain.table_semantics IS
  'Per-workspace high-level semantic flags for Layer1 tables (synthetic gen, emit targets).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mindbrain.column_semantics (minimal)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mindbrain.column_semantics (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     TEXT        NOT NULL REFERENCES mindbrain.workspaces(id) ON DELETE CASCADE,
  table_schema     TEXT        NOT NULL DEFAULT 'public',
  table_name       TEXT        NOT NULL,
  column_name      TEXT        NOT NULL,
  column_role      TEXT        NOT NULL DEFAULT 'unknown'
    CHECK (column_role IN ('id', 'fk', 'timestamp', 'status', 'attribute', 'unknown')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, table_schema, table_name, column_name)
);

CREATE INDEX IF NOT EXISTS column_semantics_workspace_idx
  ON mindbrain.column_semantics (workspace_id);

COMMENT ON TABLE mindbrain.column_semantics IS
  'Minimal column-level roles for generators (id/fk/timestamp/status/…).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. mindbrain.relation_semantics (minimal)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mindbrain.relation_semantics (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     TEXT        NOT NULL REFERENCES mindbrain.workspaces(id) ON DELETE CASCADE,
  from_schema      TEXT        NOT NULL DEFAULT 'public',
  from_table       TEXT        NOT NULL,
  to_schema        TEXT        NOT NULL DEFAULT 'public',
  to_table         TEXT        NOT NULL,
  fk_column        TEXT        NOT NULL DEFAULT '',
  relation_kind    TEXT        NOT NULL DEFAULT 'unknown'
    CHECK (relation_kind IN ('many_to_one', 'one_to_many', 'unknown')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, from_schema, from_table, to_schema, to_table, fk_column)
);

CREATE INDEX IF NOT EXISTS relation_semantics_workspace_idx
  ON mindbrain.relation_semantics (workspace_id);

COMMENT ON TABLE mindbrain.relation_semantics IS
  'Declared foreign-key style relations between workspace tables.';
