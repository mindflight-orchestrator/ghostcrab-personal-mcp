CREATE TABLE IF NOT EXISTS mfo_nodes (
  id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  schema_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfo_nodes_type
  ON mfo_nodes(node_type);

CREATE INDEX IF NOT EXISTS idx_mfo_nodes_props
  ON mfo_nodes USING GIN(properties);

CREATE TABLE IF NOT EXISTS mfo_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL REFERENCES mfo_nodes(id) ON DELETE CASCADE,
  target TEXT NOT NULL REFERENCES mfo_nodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 1.0
    CHECK (weight >= 0 AND weight <= 1),
  properties JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,

  CONSTRAINT chk_no_self_loop CHECK (source != target)
);

CREATE INDEX IF NOT EXISTS idx_mfo_edges_source
  ON mfo_edges(source, label);

CREATE INDEX IF NOT EXISTS idx_mfo_edges_target
  ON mfo_edges(target, label);

CREATE INDEX IF NOT EXISTS idx_mfo_edges_label
  ON mfo_edges(label);

CREATE INDEX IF NOT EXISTS idx_mfo_edges_expires
  ON mfo_edges(expires_at)
  WHERE expires_at IS NOT NULL;
