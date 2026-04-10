-- V3: Rich semantic metadata for columns, relations, and workspace domain profile.
-- Idempotent. Adds JSONB rich_meta to column_semantics and relation_semantics,
-- and domain_profile TEXT to workspaces.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. mindbrain.workspaces — domain_profile column
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mindbrain.workspaces
  ADD COLUMN IF NOT EXISTS domain_profile TEXT;

COMMENT ON COLUMN mindbrain.workspaces.domain_profile IS
  'Logical domain classification, e.g. casino, crm, kanban, project_delivery.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mindbrain.column_semantics — rich_meta JSONB
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mindbrain.column_semantics
  ADD COLUMN IF NOT EXISTS rich_meta JSONB;

COMMENT ON COLUMN mindbrain.column_semantics.rich_meta IS
  'Rich public-contract-grade column semantics. Expected keys:
   public_column_role (ColumnRole enum, 14 values),
   semantic_type (SemanticType enum),
   facet_key (string),
   graph_usage (GraphUsage enum),
   projection_signal (string),
   is_nullable (boolean),
   distribution_hint (object).
   All keys optional. Supersedes heuristic inference in export.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mindbrain.relation_semantics — rich_meta JSONB
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE mindbrain.relation_semantics
  ADD COLUMN IF NOT EXISTS rich_meta JSONB;

COMMENT ON COLUMN mindbrain.relation_semantics.rich_meta IS
  'Rich public-contract-grade relation semantics. Expected keys:
   relation_role (RelationRole enum),
   hierarchical (boolean),
   graph_label (string),
   target_column (string).
   All keys optional. Supersedes hard-coded defaults in export.';
