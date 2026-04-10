CREATE TABLE IF NOT EXISTS mfo_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  scope TEXT,
  proj_type TEXT NOT NULL
    CHECK (proj_type IN ('FACT', 'GOAL', 'STEP', 'CONSTRAINT')),
  content TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 0.5
    CHECK (weight >= 0 AND weight <= 1),
  source_ref UUID REFERENCES mfo_facets(id) ON DELETE SET NULL,
  source_type TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'expired', 'blocking')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfo_proj_agent
  ON mfo_projections(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_mfo_proj_scope
  ON mfo_projections(scope)
  WHERE scope IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mfo_proj_type_weight
  ON mfo_projections(proj_type, weight DESC);

CREATE INDEX IF NOT EXISTS idx_mfo_proj_expires
  ON mfo_projections(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS mfo_agent_state (
  agent_id TEXT PRIMARY KEY,
  health TEXT NOT NULL DEFAULT 'GREEN'
    CHECK (health IN ('GREEN', 'YELLOW', 'RED')),
  state TEXT NOT NULL DEFAULT 'IDLE',
  metrics JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
