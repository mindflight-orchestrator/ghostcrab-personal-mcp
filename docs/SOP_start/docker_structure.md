La réponse courte : **oui, et il faut distinguer deux modes** — un mode SQL pur qui fonctionne immédiatement, et un mode extension native qui nécessite la compilation des `.so`.

> **GhostCrab**: Consumer image name `mindflight/ghostcrab-postgres`. PL/pgSQL helpers keep the `mfo_*` prefix (not the MCP tool `ghostcrab_*`). See [renommage_strata.md](./renommage_strata.md).

***

## Le Problème Réel

Les trois extensions ne sont pas sur PGXN ou apt. Elles sont dans `mfo-postgres-ext`. Deux situations possibles :

```
Situation A — extensions .so compilées disponibles
  → Docker multi-stage build, COPY des .so, CREATE EXTENSION

Situation B — extensions pas encore compilées / en développement
  → SQL pur : tables + fonctions PL/pgSQL qui émulent les extensions
  → CREATE EXTENSION remplacé par des migrations SQL directes
```

Le Docker doit gérer les deux proprement.

***

## Où ça va dans les deux repos

```
ghostcrab/
└── docker/
    ├── Dockerfile             ← build PostgreSQL + extensions
    ├── docker-compose.yml     ← stack complète
    ├── init/
    │   ├── 00_extensions.sql  ← CREATE EXTENSION ou fallback SQL
    │   ├── 01_schema.sql      ← tables mfo_facets, mfo_nodes, etc.
    │   ├── 02_functions.sql   ← fonctions PL/pgSQL helpers
    │   └── 03_bootstrap.sql   ← seed mfo:system entries
    └── healthcheck.sh

ghostcrab-skills/                 ← rien de nouveau ici
```

***

## `docker/Dockerfile`

```dockerfile
# Stage 1 — Build extensions (si sources disponibles)
FROM postgres:16 AS builder

RUN apt-get update && apt-get install -y \
    build-essential \
    postgresql-server-dev-16 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cloner les extensions depuis le repo source
# Commenter ce bloc si les .so ne sont pas encore disponibles
ARG MFO_EXT_REPO=https://github.com/mindflight-orchestrator/mfo-postgres-ext
ARG MFO_EXT_REF=main

RUN git clone --depth 1 --branch ${MFO_EXT_REF} ${MFO_EXT_REPO} /build/mfo-ext

# Compiler chaque extension si le répertoire existe
RUN if [ -d /build/mfo-ext/extensions/pg_facets ]; then \
      cd /build/mfo-ext/extensions/pg_facets && make && make install; \
    fi

RUN if [ -d /build/mfo-ext/extensions/pg_dgraph ]; then \
      cd /build/mfo-ext/extensions/pg_dgraph && make && make install; \
    fi

RUN if [ -d /build/mfo-ext/extensions/pg_pragma ]; then \
      cd /build/mfo-ext/extensions/pg_pragma && make && make install; \
    fi

# Stage 2 — Image finale
FROM postgres:16

# Extensions supplémentaires utiles
RUN apt-get update && apt-get install -y \
    postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*

# Copier les .so compilés depuis le builder (si disponibles)
COPY --from=builder /usr/lib/postgresql/16/lib/pg_facets* \
     /usr/lib/postgresql/16/lib/ 2>/dev/null || true
COPY --from=builder /usr/lib/postgresql/16/lib/pg_dgraph* \
     /usr/lib/postgresql/16/lib/ 2>/dev/null || true
COPY --from=builder /usr/lib/postgresql/16/lib/pg_pragma* \
     /usr/lib/postgresql/16/lib/ 2>/dev/null || true
COPY --from=builder /usr/share/postgresql/16/extension/pg_facets* \
     /usr/share/postgresql/16/extension/ 2>/dev/null || true
COPY --from=builder /usr/share/postgresql/16/extension/pg_dgraph* \
     /usr/share/postgresql/16/extension/ 2>/dev/null || true
COPY --from=builder /usr/share/postgresql/16/extension/pg_pragma* \
     /usr/share/postgresql/16/extension/ 2>/dev/null || true

# Scripts d'initialisation — exécutés dans l'ordre alphabétique
COPY docker/init/ /docker-entrypoint-initdb.d/
COPY docker/healthcheck.sh /usr/local/bin/healthcheck.sh
RUN chmod +x /usr/local/bin/healthcheck.sh

ENV POSTGRES_DB=ghostcrab \
    POSTGRES_USER=ghostcrab \
    POSTGRES_PASSWORD=ghostcrab \
    MFO_NATIVE_EXTENSIONS=auto

HEALTHCHECK --interval=5s --timeout=5s --retries=10 \
  CMD /usr/local/bin/healthcheck.sh
```

***

## `docker/init/00_extensions.sql`

Le fichier clé — détecte automatiquement si les extensions natives sont disponibles, sinon active le mode SQL pur.

```sql
-- 00_extensions.sql
-- Auto-detects native extensions vs SQL fallback mode

-- Always available
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector pour embeddings
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- gen_random_uuid() fallback

-- Native extensions — best effort
-- Si pg_facets n'est pas compilé, on continue sans erreur
DO $$
BEGIN
  -- pg_facets
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_facets;
    RAISE NOTICE 'pg_facets: native extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_facets: native extension not available — using SQL schema';
  END;

  -- pg_dgraph
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_dgraph;
    RAISE NOTICE 'pg_dgraph: native extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_dgraph: native extension not available — using SQL schema';
  END;

  -- pg_pragma
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_pragma;
    RAISE NOTICE 'pg_pragma: native extension loaded — using SQL schema';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_pragma: native extension not available — using SQL schema';
  END;
END
$$;
```

***

## `docker/init/01_schema.sql`

Les tables sont créées dans tous les cas — que les extensions natives soient là ou non.

```sql
-- 01_schema.sql
-- Core tables — work in both native and SQL-only mode

-- ─── pg_facets layer ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfo_facets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id    TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  facets       JSONB       NOT NULL DEFAULT '{}',
  embedding    vector(1536),
  bm25_vector  tsvector    GENERATED ALWAYS AS
                             (to_tsvector('english', content)) STORED,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  version      INTEGER     NOT NULL DEFAULT 1,
  supersedes   UUID        REFERENCES mfo_facets(id),
  valid_from   DATE,
  valid_until  DATE,

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

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION mfo_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_mfo_facets_updated_at ON mfo_facets;
CREATE TRIGGER trg_mfo_facets_updated_at
  BEFORE UPDATE ON mfo_facets
  FOR EACH ROW EXECUTE FUNCTION mfo_set_updated_at();

-- ─── pg_dgraph layer ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfo_nodes (
  id           TEXT        PRIMARY KEY,
  node_type    TEXT        NOT NULL,
  label        TEXT        NOT NULL,
  properties   JSONB       NOT NULL DEFAULT '{}',
  schema_id    TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfo_nodes_type
  ON mfo_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_mfo_nodes_props
  ON mfo_nodes USING GIN(properties);

CREATE TABLE IF NOT EXISTS mfo_edges (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT        NOT NULL REFERENCES mfo_nodes(id)
                             ON DELETE CASCADE,
  target       TEXT        NOT NULL REFERENCES mfo_nodes(id)
                             ON DELETE CASCADE,
  label        TEXT        NOT NULL,
  weight       FLOAT       NOT NULL DEFAULT 1.0
                             CHECK (weight >= 0 AND weight <= 1),
  properties   JSONB       NOT NULL DEFAULT '{}',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,

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

-- ─── pg_pragma layer ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mfo_projections (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     TEXT        NOT NULL,
  scope        TEXT,
  proj_type    TEXT        NOT NULL
                 CHECK (proj_type IN ('FACT','GOAL','STEP','CONSTRAINT')),
  content      TEXT        NOT NULL,
  weight       FLOAT       NOT NULL DEFAULT 0.5
                             CHECK (weight >= 0 AND weight <= 1),
  source_ref   UUID        REFERENCES mfo_facets(id)
                             ON DELETE SET NULL,
  source_type  TEXT,
  status       TEXT        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','resolved','expired','blocking')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ
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
  agent_id     TEXT        PRIMARY KEY,
  health       TEXT        NOT NULL DEFAULT 'GREEN'
                 CHECK (health IN ('GREEN','YELLOW','RED')),
  state        TEXT        NOT NULL DEFAULT 'IDLE',
  metrics      JSONB       NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

***

## `docker/init/02_functions.sql`

Fonctions SQL qui émulent les fonctions natives des extensions — actives en mode SQL pur, inoffensives si les extensions sont chargées.

```sql
-- 02_functions.sql
-- PL/pgSQL helpers — active in both modes

-- ─── Facets helpers ───────────────────────────────────────────────

-- Hybrid search: BM25 + optional embedding cosine
CREATE OR REPLACE FUNCTION mfo_search_hybrid(
  p_query     TEXT,
  p_filters   JSONB    DEFAULT '{}',
  p_schema_id TEXT     DEFAULT NULL,
  p_limit     INTEGER  DEFAULT 10
)
RETURNS TABLE (
  id          UUID,
  schema_id   TEXT,
  content     TEXT,
  facets      JSONB,
  score       FLOAT,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
DECLARE
  v_where TEXT := 'WHERE (valid_until IS NULL OR valid_until > CURRENT_DATE)';
  v_score TEXT;
BEGIN
  -- Schema filter
  IF p_schema_id IS NOT NULL THEN
    v_where := v_where || format(' AND f.schema_id = %L', p_schema_id);
  END IF;

  -- Facets filter — each key-value pair
  IF p_filters != '{}'::jsonb THEN
    v_where := v_where || format(' AND f.facets @> %L::jsonb', p_filters::text);
  END IF;

  -- Score expression
  IF p_query != '' THEN
    v_score := format(
      'ts_rank(f.bm25_vector, plainto_tsquery(''english'', %L))',
      p_query
    );
  ELSE
    v_score := '1.0';
  END IF;

  RETURN QUERY EXECUTE format('
    SELECT f.id, f.schema_id, f.content, f.facets,
           (%s)::float AS score, f.created_at
    FROM mfo_facets f %s
    ORDER BY score DESC
    LIMIT %s
  ', v_score, v_where, p_limit);
END;
$$;

-- Facet counts grouped by dimension
CREATE OR REPLACE FUNCTION mfo_count_by(
  p_dimension TEXT,
  p_schema_id TEXT    DEFAULT NULL,
  p_filters   JSONB   DEFAULT '{}'
)
RETURNS TABLE (val TEXT, cnt BIGINT)
LANGUAGE plpgsql AS $$
DECLARE
  v_where TEXT := format(
    'WHERE facets ? %L AND (valid_until IS NULL OR valid_until > CURRENT_DATE)',
    p_dimension
  );
BEGIN
  IF p_schema_id IS NOT NULL THEN
    v_where := v_where || format(' AND schema_id = %L', p_schema_id);
  END IF;
  IF p_filters != '{}'::jsonb THEN
    v_where := v_where || format(' AND facets @> %L::jsonb', p_filters::text);
  END IF;

  RETURN QUERY EXECUTE format('
    SELECT facets->>%L AS val, COUNT(*) AS cnt
    FROM mfo_facets %s
    GROUP BY val ORDER BY cnt DESC
  ', p_dimension, v_where);
END;
$$;

-- ─── Graph helpers ────────────────────────────────────────────────

-- BFS traversal via recursive CTE
CREATE OR REPLACE FUNCTION mfo_traverse(
  p_start       TEXT,
  p_direction   TEXT    DEFAULT 'outbound',  -- outbound | inbound
  p_labels      TEXT[]  DEFAULT '{}',
  p_max_depth   INTEGER DEFAULT 3
)
RETURNS TABLE (
  node_id     TEXT,
  node_label  TEXT,
  node_type   TEXT,
  edge_label  TEXT,
  depth       INTEGER,
  path        TEXT[]
)
LANGUAGE plpgsql AS $$
DECLARE
  v_src TEXT := CASE WHEN p_direction = 'outbound' THEN 'source' ELSE 'target' END;
  v_dst TEXT := CASE WHEN p_direction = 'outbound' THEN 'target' ELSE 'source' END;
  v_label_filter TEXT := '';
BEGIN
  IF array_length(p_labels, 1) > 0 THEN
    v_label_filter := 'AND e.label = ANY($3)';
  END IF;

  RETURN QUERY EXECUTE format('
    WITH RECURSIVE bfs AS (
      SELECT n.id, n.label, n.node_type,
             NULL::text AS edge_label,
             0 AS depth,
             ARRAY[n.id] AS path
      FROM mfo_nodes n WHERE n.id = $1

      UNION ALL

      SELECT n2.id, n2.label, n2.node_type,
             e.label, bfs.depth + 1, bfs.path || n2.id
      FROM bfs
      JOIN mfo_edges e ON e.%I = bfs.id %s
      JOIN mfo_nodes n2 ON n2.id = e.%I
      WHERE bfs.depth < $2
        AND NOT n2.id = ANY(bfs.path)
        AND (e.expires_at IS NULL OR e.expires_at > now())
    )
    SELECT DISTINCT ON (id) id, label, node_type, edge_label, depth, path
    FROM bfs ORDER BY id, depth
  ', v_src, v_label_filter, v_dst)
  USING p_start, p_max_depth, p_labels;
END;
$$;

-- ─── Memproj helpers ─────────────────────────────────────────────

-- Pack context: ranked projections + BM25 facts
CREATE OR REPLACE FUNCTION mfo_pack_context(
  p_agent_id  TEXT,
  p_query     TEXT,
  p_limit     INTEGER DEFAULT 15
)
RETURNS TABLE (
  proj_type   TEXT,
  content     TEXT,
  weight      FLOAT,
  source_ref  UUID,
  status      TEXT,
  pack_line   TEXT
)
LANGUAGE sql AS $$
  SELECT
    proj_type, content, weight, source_ref, status,
    proj_type || ': ' || content AS pack_line
  FROM mfo_projections
  WHERE agent_id = p_agent_id
    AND status IN ('active','blocking')
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY
    CASE proj_type WHEN 'CONSTRAINT' THEN 0 ELSE 1 END,
    weight DESC
  LIMIT p_limit;
$$;
```

***

## `docker/init/03_bootstrap.sql`

```sql
-- 03_bootstrap.sql
-- Self-describing seed data — loaded only if mfo:system is empty

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM mfo_facets WHERE schema_id = 'mfo:system') > 0 THEN
    RAISE NOTICE 'Bootstrap data already present — skipping';
    RETURN;
  END IF;

  -- Tools
  INSERT INTO mfo_facets (schema_id, content, facets) VALUES
  ('mfo:system',
   'ghostcrab_search retrieves ranked documents. Empty query + filters = pure facet filter, fastest mode.',
   '{"entry_type":"tool","tool_name":"ghostcrab_search","level":"foundation",
     "use_when":"Retrieve specific content by topic or facet value"}'::jsonb),
  ('mfo:system',
   'ghostcrab_count returns counts grouped by facet dimensions. Zero content token cost. First call in any planning sequence.',
   '{"entry_type":"tool","tool_name":"ghostcrab_count","level":"foundation",
     "use_when":"Understand what exists before fetching content"}'::jsonb),
  ('mfo:system',
   'ghostcrab_pack returns a pre-ranked compact context bundle. Inject pack_text at TOP of reasoning. Call before every non-trivial reasoning turn.',
   '{"entry_type":"tool","tool_name":"ghostcrab_pack","level":"foundation",
     "use_when":"Before any multi-step reasoning or domain task"}'::jsonb),
  ('mfo:system',
   'ghostcrab_status returns operational+epistemic snapshot. Read directives[] and execute matching conditions immediately.',
   '{"entry_type":"tool","tool_name":"ghostcrab_status","level":"foundation",
     "use_when":"Session start and before expensive actions"}'::jsonb),
  ('mfo:system',
   'ghostcrab_coverage checks domain coverage. >= 0.85 = full autonomy. 0.70-0.85 = disclosed gaps. < 0.70 = escalate.',
   '{"entry_type":"tool","tool_name":"ghostcrab_coverage","level":"intermediate",
     "use_when":"Before autonomous action in domain-specific task"}'::jsonb),
  ('mfo:system',
   'ghostcrab_learn writes a knowledge node or directed edge. Call after every task. Task is not done until graph reflects what was learned.',
   '{"entry_type":"tool","tool_name":"ghostcrab_learn","level":"intermediate",
     "use_when":"After completing any task involving structural knowledge"}'::jsonb),
  ('mfo:system',
   'ghostcrab_remember stores a fact or document. Returns UUID. Facets are free-form key-value pairs.',
   '{"entry_type":"tool","tool_name":"ghostcrab_remember","level":"foundation",
     "use_when":"Store any fact, observation, or document"}'::jsonb),
  -- Rules
  ('mfo:system',
   'Reading sequence: (1) ghostcrab_count (2) ghostcrab_search (3) ghostcrab_traverse (4) ghostcrab_pack. Use cheapest level that answers the question.',
   '{"entry_type":"rule","level":"foundation",
     "use_when":"Any memory read operation"}'::jsonb),
  ('mfo:system',
   'Write-back is mandatory. After every session: ghostcrab_remember for facts, ghostcrab_learn for nodes/edges. Memory not written = memory lost.',
   '{"entry_type":"rule","level":"foundation",
     "use_when":"After every completed task, before session end"}'::jsonb),
  ('mfo:system',
   'Gap disclosure: never say I don''t know without structure. Format: {escalate:true, gap_node_id, gap_label, covered_up_to, reason, resume_condition}.',
   '{"entry_type":"rule","level":"foundation",
     "use_when":"Gap detected in ghostcrab_coverage or blocking constraint in ghostcrab_pack"}'::jsonb);

  RAISE NOTICE 'Bootstrap seed loaded: % entries',
    (SELECT COUNT(*) FROM mfo_facets WHERE schema_id = 'mfo:system');
END;
$$;
```

***

## `docker/docker-compose.yml`

```yaml
services:

  postgres:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    image: mindflight/ghostcrab-postgres:latest
    container_name: ghostcrab-postgres
    restart: unless-stopped
    ports:
      - "${PG_PORT:-5432}:5432"
    environment:
      POSTGRES_DB:       ${POSTGRES_DB:-ghostcrab}
      POSTGRES_USER:     ${POSTGRES_USER:-ghostcrab}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ghostcrab}
    volumes:
      - ghostcrab_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "/usr/local/bin/healthcheck.sh"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  mcp-server:
    build:
      context: ..
      dockerfile: Dockerfile    # racine du repo
    container_name: ghostcrab-mcp-server
    restart: unless-stopped
    environment:
      DATABASE_URL: >-
        postgres://${POSTGRES_USER:-ghostcrab}:${POSTGRES_PASSWORD:-ghostcrab}
        @postgres:5432/${POSTGRES_DB:-ghostcrab}
      PG_POOL_MAX:    ${PG_POOL_MAX:-10}
      NODE_ENV:       ${NODE_ENV:-production}
    depends_on:
      postgres:
        condition: service_healthy
    stdin_open: true   # requis pour le transport stdio MCP
    tty: true

volumes:
  ghostcrab_pgdata:
    driver: local
```

***

## `docker/healthcheck.sh`

```bash
#!/bin/sh
# Vérifie PostgreSQL + présence des tables MFO

pg_isready -U "${POSTGRES_USER:-ghostcrab}" -d "${POSTGRES_DB:-ghostcrab}" -q || exit 1

psql -U "${POSTGRES_USER:-ghostcrab}" -d "${POSTGRES_DB:-ghostcrab}" -c \
  "SELECT COUNT(*) FROM mfo_facets WHERE schema_id = 'mfo:system'" -q \
  > /dev/null 2>&1 || exit 1

exit 0
```

***

## `.env.example` — à la racine de `ghostcrab/`

```bash
# PostgreSQL
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab
POSTGRES_USER=ghostcrab
POSTGRES_PASSWORD=ghostcrab
POSTGRES_DB=ghostcrab
PG_PORT=5432
PG_POOL_MAX=10

# MCP Server
NODE_ENV=development

# Extensions mode (auto | native | sql-only)
MFO_NATIVE_EXTENSIONS=auto
```

***

## Récapitulatif — Ce que fait chaque fichier

| Fichier | Rôle | Mode |
|---|---|---|
| `Dockerfile` | Build PostgreSQL + tentative compilation extensions | Les deux |
| `00_extensions.sql` | `CREATE EXTENSION` best-effort, silencieux si absent | Les deux |
| `01_schema.sql` | Tables + index — toujours créées | Les deux |
| `02_functions.sql` | PL/pgSQL qui émule les fonctions natives | SQL pur |
| `03_bootstrap.sql` | Seed auto-descriptif `mfo:system` | Les deux |
| `docker-compose.yml` | Stack postgres + mcp-server | Les deux |
| `healthcheck.sh` | Vérifie DB + seed chargé | Les deux |

**Un seul `docker compose up`** — PostgreSQL démarre, les migrations s'exécutent dans l'ordre, le seed se charge, le MCP server démarre quand le healthcheck passe. L'agent peut appeler `ghostcrab_search` 30 secondes après `docker compose up`.