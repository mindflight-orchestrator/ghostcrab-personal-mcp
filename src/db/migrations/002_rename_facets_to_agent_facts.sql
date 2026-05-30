-- Rename durable agent fact store: facets -> agent_facts
-- Applied automatically by MindBrain applyAgentFactsTableRenameMigration on backend startup.
-- Idempotent: no-op when agent_facts already exists.

-- @no-transaction

DROP TRIGGER IF EXISTS trg_sync_facets_compat_after_insert;
DROP TRIGGER IF EXISTS trg_sync_facets_compat_after_update;

-- SQLite: skip when fresh schema already created agent_facts
-- (migration runner should check sqlite_master before executing)

ALTER TABLE facets RENAME TO agent_facts;

DROP INDEX IF EXISTS facets_workspace_id_idx;
DROP INDEX IF EXISTS facets_source_ref_idx;
DROP INDEX IF EXISTS facets_source_ref_workspace_uniq;
DROP INDEX IF EXISTS idx_facets_source_ref_workspace;

CREATE INDEX IF NOT EXISTS agent_facts_workspace_id_idx ON agent_facts(workspace_id);
CREATE INDEX IF NOT EXISTS agent_facts_source_ref_idx ON agent_facts(source_ref) WHERE source_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agent_facts_source_ref_workspace_uniq ON agent_facts(source_ref, workspace_id) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_facts_source_ref_workspace ON agent_facts(source_ref, workspace_id) WHERE source_ref IS NOT NULL;
