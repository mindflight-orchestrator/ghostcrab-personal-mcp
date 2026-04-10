-- V3: Mindbrain schema foundation + workspace isolation.
-- Creates the mindbrain control schema, workspace isolation columns on Layer 2 tables,
-- and seeds the 'default' workspace. Fully idempotent (IF NOT EXISTS everywhere).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema mindbrain
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS mindbrain;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mindbrain.workspaces
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mindbrain.workspaces (
  id           TEXT        PRIMARY KEY,
  label        TEXT        NOT NULL,
  pg_schema    TEXT        NOT NULL DEFAULT 'public',
  description  TEXT,
  created_by   TEXT,
  status       TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mindbrain.workspaces IS
  'Registry of logical workspaces. Each workspace scopes facets and graph entities.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mindbrain.pending_migrations
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mindbrain.pending_migrations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     TEXT        NOT NULL REFERENCES mindbrain.workspaces(id),
  sql              TEXT        NOT NULL,
  sync_spec        JSONB,
  rationale        TEXT,
  preview_trigger  TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'executed', 'rejected')),
  proposed_by      TEXT,
  approved_by      TEXT,
  proposed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at      TIMESTAMPTZ,
  executed_at      TIMESTAMPTZ
);

COMMENT ON TABLE mindbrain.pending_migrations IS
  'DDL lifecycle queue: agent proposes, human approves, execution is atomic.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. mindbrain.query_templates
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mindbrain.query_templates (
  id            TEXT        PRIMARY KEY,
  workspace_id  TEXT        NOT NULL REFERENCES mindbrain.workspaces(id),
  sql_template  TEXT        NOT NULL,
  param_schema  JSONB,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mindbrain.query_templates IS
  'Named parameterised SQL queries scoped to a workspace.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. mindbrain.source_mappings
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mindbrain.source_mappings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT        NOT NULL REFERENCES mindbrain.workspaces(id),
  source_ref    TEXT        NOT NULL,
  target_table  TEXT        NOT NULL,
  field_map     JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mindbrain.source_mappings IS
  'Layer 1 → Layer 2 field mapping registry per workspace.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. workspace_id on Layer 2 tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mfo_facets
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE graph.entity
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE graph.relation
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Indexes on workspace_id
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS mfo_facets_workspace_id_idx
  ON mfo_facets (workspace_id);

CREATE INDEX IF NOT EXISTS graph_entity_workspace_id_idx
  ON graph.entity (workspace_id);

CREATE INDEX IF NOT EXISTS graph_relation_workspace_id_idx
  ON graph.relation (workspace_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Seed default workspace
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO mindbrain.workspaces (id, label, pg_schema, description, created_by)
VALUES (
  'default',
  'Default Workspace',
  'public',
  'Auto-seeded default workspace. All existing data belongs here.',
  'system'
)
ON CONFLICT (id) DO NOTHING;
