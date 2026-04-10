Voici la spec complète — structurée pour qu'un agent IA puisse l'exécuter séquentiellement sans ambiguïté.

> **Product naming (GhostCrab)**: Public MCP tool names and npm/Docker branding follow [renommage_strata.md](./renommage_strata.md): package `@mindflight/ghostcrab`, MCP config key `ghostcrab`, tools `ghostcrab_*`. PostgreSQL tables and JSONB namespaces stay `mfo_*` / `mfo:` (implementation detail).

***

## Repository Structure

```
ghostcrab/
├── src/
│   ├── index.ts                  ← entry point, server registration
│   ├── db/
│   │   ├── client.ts             ← PostgreSQL connection pool
│   │   └── migrations/
│   │       ├── 001_facets_schema.sql
│   │       ├── 002_dgraph_schema.sql
│   │       ├── 003_pragma_schema.sql
│   │       └── 004_bootstrap_data.sql
│   ├── tools/
│   │   ├── facets/
│   │   │   ├── search.ts
│   │   │   ├── remember.ts
│   │   │   ├── count.ts
│   │   │   └── schema.ts
│   │   ├── dgraph/
│   │   │   ├── coverage.ts
│   │   │   ├── traverse.ts
│   │   │   └── learn.ts
│   │   ├── pragma/
│   │   │   ├── pack.ts
│   │   │   └── status.ts
│   │   └── registry.ts           ← tous les tools enregistrés ici
│   ├── types/
│   │   ├── facets.ts
│   │   ├── dgraph.ts
│   │   └── pragma.ts
│   └── bootstrap/
│       └── seed.ts               ← charge les entrées mfo:system au démarrage
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── init.sql                  ← CREATE EXTENSION + migrations
├── tests/
│   ├── tools/
│   │   ├── facets.test.ts
│   │   ├── dgraph.test.ts
│   │   └── pragma.test.ts
│   └── fixtures/
│       └── test_data.sql
├── .mcp.json                     ← config d'installation pour l'utilisateur final
├── package.json
├── tsconfig.json
└── README.md
```

***

## MR 1 — Foundation

### PR 1.1 — Project Scaffold + PostgreSQL Client

**WHY**
Le MCP SDK TypeScript d'Anthropic est le seul moyen d'exposer des tools à Claude Code et OpenClaw via le protocole MCP standard. PostgreSQL doit être accédé via un pool de connexions avec retry et timeout configurables pour survivre à des redémarrages de conteneur.

**WHAT**
- Initialiser le projet TypeScript avec `@modelcontextprotocol/sdk`
- Connection pool PostgreSQL via `pg` avec variables d'environnement
- Health check `/ping` sur la connexion

**HOW**

```typescript
// package.json
{
  "name": "@mindflight/ghostcrab",
  "version": "1.0.0",
  "bin": { "ghostcrab": "./dist/index.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "pg": "^8.11.0",
    "pg-pool": "^3.6.0",
    "zod": "^3.22.0"
  }
}

// src/db/client.ts
import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:              parseInt(process.env.PG_POOL_MAX || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err)
})

export async function query<T>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function ping(): Promise<boolean> {
  try {
    await query('SELECT 1')
    return true
  } catch {
    return false
  }
}
```

**Acceptance criteria**
- `DATABASE_URL=postgres://... node dist/index.js` démarre sans erreur
- Si la DB est unreachable : log clair, pas de crash silencieux

***

### PR 1.2 — MCP Server Entry Point + Tool Registry

**WHY**
Le MCP SDK requiert un `Server` avec une liste statique de tools déclarés au démarrage. Le registry centralise la déclaration pour éviter la dispersion dans chaque fichier tool.

**WHAT**
- Instancier `Server` avec metadata (`name`, `version`)
- Pattern `registry.ts` : chaque tool est un objet `{definition, handler}`
- `ListTools` handler qui retourne le registry
- `CallTool` handler qui dispatch au bon handler

**HOW**

```typescript
// src/tools/registry.ts
import { Tool } from '@modelcontextprotocol/sdk/types.js'

export interface ToolHandler {
  definition: Tool
  handler:    (args: Record<string, unknown>) => Promise<unknown>
}

export const toolRegistry = new Map<string, ToolHandler>()

export function registerTool(tool: ToolHandler) {
  toolRegistry.set(tool.definition.name, tool)
}

// src/index.ts
import { Server }          from '@modelcontextprotocol/sdk/server/index.js'
import { StdioTransport }  from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { toolRegistry }    from './tools/registry.js'
import { ping }            from './db/client.js'

// import tools — chaque import appelle registerTool() en side-effect
import './tools/facets/search.js'
import './tools/facets/remember.js'
import './tools/facets/count.js'
import './tools/facets/schema.js'
import './tools/dgraph/coverage.js'
import './tools/dgraph/traverse.js'
import './tools/dgraph/learn.js'
import './tools/pragma/pack.js'
import './tools/pragma/status.js'

const server = new Server(
  { name: 'ghostcrab', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Array.from(toolRegistry.values()).map(t => t.definition)
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolRegistry.get(req.params.name)
  if (!tool) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }]
    }
  }
  try {
    const result = await tool.handler(req.params.arguments ?? {})
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }]
    }
  }
})

async function main() {
  const db_ok = await ping()
  if (!db_ok) {
    console.error('[ghostcrab] Cannot connect to PostgreSQL. Check DATABASE_URL.')
    process.exit(1)
  }
  const transport = new StdioTransport()
  await server.connect(transport)
  console.error('[ghostcrab] Server started')
}

main()
```

**Acceptance criteria**
- `ListTools` retourne tous les tools enregistrés
- Tool inconnu retourne `isError: true` avec message clair
- DB unreachable à l'init → exit(1) avec message

***

### PR 1.3 — Database Migrations

**WHY**
Les trois extensions ont besoin de tables PostgreSQL précises. Les migrations doivent être idempotentes — `docker run` sur une DB existante ne doit rien casser.

**WHAT**
Quatre fichiers SQL exécutés au démarrage du conteneur dans l'ordre.

**HOW**

```sql
-- migrations/001_facets_schema.sql
CREATE EXTENSION IF NOT EXISTS pg_facets;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS mfo_facets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id    TEXT NOT NULL,
  content      TEXT NOT NULL,
  facets       JSONB NOT NULL DEFAULT '{}',
  embedding    vector(1536),
  bm25_vector  tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  version      INTEGER DEFAULT 1,
  supersedes   UUID REFERENCES mfo_facets(id),
  valid_from   DATE,
  valid_until  DATE
);

CREATE INDEX IF NOT EXISTS idx_mfo_facets_schema
  ON mfo_facets(schema_id);
CREATE INDEX IF NOT EXISTS idx_mfo_facets_facets
  ON mfo_facets USING GIN(facets);
CREATE INDEX IF NOT EXISTS idx_mfo_facets_bm25
  ON mfo_facets USING GIN(bm25_vector);
CREATE INDEX IF NOT EXISTS idx_mfo_facets_valid
  ON mfo_facets(valid_until)
  WHERE valid_until IS NOT NULL;

-- migrations/002_dgraph_schema.sql
CREATE EXTENSION IF NOT EXISTS pg_dgraph;

CREATE TABLE IF NOT EXISTS mfo_nodes (
  id           TEXT PRIMARY KEY,
  node_type    TEXT NOT NULL,
  label        TEXT NOT NULL,
  properties   JSONB NOT NULL DEFAULT '{}',
  schema_id    TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfo_edges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL REFERENCES mfo_nodes(id),
  target       TEXT NOT NULL REFERENCES mfo_nodes(id),
  label        TEXT NOT NULL,
  weight       FLOAT DEFAULT 1.0,
  properties   JSONB NOT NULL DEFAULT '{}',
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfo_edges_source
  ON mfo_edges(source, label);
CREATE INDEX IF NOT EXISTS idx_mfo_edges_target
  ON mfo_edges(target, label);
CREATE INDEX IF NOT EXISTS idx_mfo_nodes_type
  ON mfo_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_mfo_nodes_props
  ON mfo_nodes USING GIN(properties);

-- migrations/003_pragma_schema.sql
CREATE EXTENSION IF NOT EXISTS pg_pragma;

CREATE TABLE IF NOT EXISTS mfo_projections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     TEXT NOT NULL,
  scope        TEXT,
  proj_type    TEXT NOT NULL CHECK (proj_type IN ('FACT','GOAL','STEP','CONSTRAINT')),
  content      TEXT NOT NULL,
  weight       FLOAT DEFAULT 0.5,
  source_ref   UUID REFERENCES mfo_facets(id),
  source_type  TEXT,
  status       TEXT DEFAULT 'active',
  created_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mfo_proj_agent
  ON mfo_projections(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_mfo_proj_scope
  ON mfo_projections(scope)
  WHERE scope IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mfo_proj_type
  ON mfo_projections(proj_type, weight DESC);

CREATE TABLE IF NOT EXISTS mfo_agent_state (
  agent_id     TEXT PRIMARY KEY,
  health       TEXT DEFAULT 'GREEN'
                 CHECK (health IN ('GREEN','YELLOW','RED')),
  state        TEXT DEFAULT 'IDLE',
  metrics      JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

***

## MR 2 — pg_facets Tools

### PR 2.1 — `ghostcrab_search`

**WHY**
Retrieval hybride BM25 + sémantique avec filtres facettes. C'est le tool le plus utilisé — sa performance et sa précision déterminent la qualité de tout le reste.

**WHAT**
- Zod schema pour la validation des inputs
- BM25 via `ts_rank` sur `bm25_vector`
- Filtre JSONB `facets @> $filters`
- Score hybride : `0.6 * bm25 + 0.4 * semantic` si embedding disponible

**HOW**

```typescript
// src/tools/facets/search.ts
import { z }              from 'zod'
import { registerTool }   from '../registry.js'
import { query }          from '../../db/client.js'

const SearchInput = z.object({
  query:   z.string().default(''),
  filters: z.record(z.unknown()).optional().default({}),
  limit:   z.number().int().min(1).max(100).default(10),
  mode:    z.enum(['hybrid','bm25','semantic']).default('hybrid'),
  schema_id: z.string().optional()
})

registerTool({
  definition: {
    name: 'ghostcrab_search',
    description: 'Retrieve ranked documents from persistent fact store. Combine query (semantic/BM25) with filters (exact facet match). Empty query with filters = pure facet filter, fastest mode.',
    inputSchema: {
      type: 'object',
      properties: {
        query:     { type: 'string',  description: 'Semantic or keyword query. Empty string for pure filter.' },
        filters:   { type: 'object',  description: 'Exact facet key-value matches. Supports arrays for OR.' },
        limit:     { type: 'integer', description: 'Max results (1-100)', default: 10 },
        mode:      { type: 'string',  enum: ['hybrid','bm25','semantic'], default: 'hybrid' },
        schema_id: { type: 'string',  description: 'Filter by schema. Optional.' }
      }
    }
  },
  handler: async (args) => {
    const input = SearchInput.parse(args)

    let whereClause = 'WHERE 1=1'
    const params: unknown[] = []
    let paramIdx = 1

    // Schema filter
    if (input.schema_id) {
      whereClause += ` AND schema_id = $${paramIdx++}`
      params.push(input.schema_id)
    }

    // Facet filters — supports array (OR) and scalar (exact)
    if (Object.keys(input.filters).length > 0) {
      const facetConditions = Object.entries(input.filters).map(([k, v]) => {
        if (Array.isArray(v)) {
          // OR across values
          const orClauses = v.map(val => {
            params.push(JSON.stringify({ [k]: val }))
            return `facets @> $${paramIdx++}::jsonb`
          })
          return `(${orClauses.join(' OR ')})`
        } else {
          params.push(JSON.stringify({ [k]: v }))
          return `facets @> $${paramIdx++}::jsonb`
        }
      })
      whereClause += ' AND ' + facetConditions.join(' AND ')
    }

    // Scoring
    let scoreExpr = '1.0'
    if (input.query && input.mode !== 'semantic') {
      params.push(input.query)
      scoreExpr = `ts_rank(bm25_vector, plainto_tsquery('english', $${paramIdx++}))`
    }

    // valid_until filter — exclude expired
    whereClause += ' AND (valid_until IS NULL OR valid_until > CURRENT_DATE)'

    params.push(input.limit)
    const limitParam = paramIdx++

    const sql = `
      SELECT
        id,
        schema_id,
        content,
        facets,
        created_at,
        version,
        ${scoreExpr} AS score
      FROM mfo_facets
      ${whereClause}
      ORDER BY score DESC
      LIMIT $${limitParam}
    `

    const rows = await query<{
      id: string; schema_id: string; content: string;
      facets: Record<string,unknown>; score: number;
      created_at: string; version: number
    }>(sql, params)

    return {
      results:  rows,
      returned: rows.length,
      query:    input.query,
      filters:  input.filters
    }
  }
})
```

***

### PR 2.2 — `ghostcrab_remember`

**WHY**
Write path vers pg_facets. L'agent doit pouvoir stocker des faits, observations, et documents avec des facettes libres sans connaître le schéma à l'avance.

**WHAT**
- Upsert dans `mfo_facets`
- Validation : `content` non-vide, `facets` object
- Retourne l'UUID créé pour référencement futur

**HOW**

```typescript
// src/tools/facets/remember.ts
import { z }            from 'zod'
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

const RememberInput = z.object({
  content:    z.string().min(1),
  facets:     z.record(z.unknown()).default({}),
  schema_id:  z.string().default('agent:observation'),
  created_by: z.string().optional(),
  valid_until: z.string().optional(),
})

registerTool({
  definition: {
    name: 'ghostcrab_remember',
    description: 'Store a new fact, document, or observation in persistent memory. Returns the UUID of the stored item for future reference.',
    inputSchema: {
      type: 'object',
      required: ['content'],
      properties: {
        content:     { type: 'string',  description: 'The content to store' },
        facets:      { type: 'object',  description: 'Key-value metadata for filtering' },
        schema_id:   { type: 'string',  description: 'Schema this item belongs to', default: 'agent:observation' },
        created_by:  { type: 'string',  description: 'Agent or user ID' },
        valid_until: { type: 'string',  description: 'ISO date after which this item expires' }
      }
    }
  },
  handler: async (args) => {
    const input = RememberInput.parse(args)

    const rows = await query<{ id: string; created_at: string }>(`
      INSERT INTO mfo_facets (schema_id, content, facets, created_by, valid_until)
      VALUES ($1, $2, $3::jsonb, $4, $5::date)
      RETURNING id, created_at
    `, [
      input.schema_id,
      input.content,
      JSON.stringify(input.facets),
      input.created_by ?? null,
      input.valid_until ?? null
    ])

    return {
      stored:     true,
      id:         rows[0].id,
      created_at: rows[0].created_at,
      schema_id:  input.schema_id
    }
  }
})
```

***

### PR 2.3 — `ghostcrab_count`

**WHY**
Dashboard zero-token. L'agent doit pouvoir comprendre la forme de sa connaissance sans charger du contenu. C'est le premier appel de tout workflow de planification.

**WHAT**
- GROUP BY sur une ou plusieurs dimensions de facettes
- Filtre JSONB optionnel
- Retourne un objet de counts groupés par dimension

**HOW**

```typescript
// src/tools/facets/count.ts
import { z }            from 'zod'
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

const CountInput = z.object({
  schema_id: z.string().optional(),
  group_by:  z.array(z.string()).min(1).max(5),
  filters:   z.record(z.unknown()).optional().default({}),
})

registerTool({
  definition: {
    name: 'ghostcrab_count',
    description: 'Count items grouped by facet dimensions — zero content token cost. Use before ghostcrab_search to understand what exists. Returns {dimension: {value: count}}.',
    inputSchema: {
      type: 'object',
      required: ['group_by'],
      properties: {
        schema_id: { type: 'string',  description: 'Filter by schema' },
        group_by:  { type: 'array', items: { type: 'string' },
                     description: 'Facet dimensions to group by (e.g. ["status","domain"])' },
        filters:   { type: 'object',  description: 'Pre-filter before counting' }
      }
    }
  },
  handler: async (args) => {
    const input = CountInput.parse(args)

    const result: Record<string, Record<string, number>> = {}

    for (const dim of input.group_by) {
      const params: unknown[] = []
      let paramIdx = 1
      let whereClause = `WHERE facets ? $${paramIdx++}`
      params.push(dim)

      if (input.schema_id) {
        whereClause += ` AND schema_id = $${paramIdx++}`
        params.push(input.schema_id)
      }

      for (const [k, v] of Object.entries(input.filters)) {
        params.push(JSON.stringify({ [k]: v }))
        whereClause += ` AND facets @> $${paramIdx++}::jsonb`
      }

      const rows = await query<{ val: string; count: string }>(`
        SELECT
          facets->>'${dim.replace(/'/g, "''")}' AS val,
          COUNT(*) AS count
        FROM mfo_facets
        ${whereClause}
        GROUP BY val
        ORDER BY count DESC
      `, params)

      result[dim] = Object.fromEntries(
        rows.map(r => [r.val ?? 'null', parseInt(r.count)])
      )
    }

    return {
      counts:    result,
      schema_id: input.schema_id ?? 'all',
      filters:   input.filters
    }
  }
})
```

***

### PR 2.4 — `ghostcrab_schema_register` / `ghostcrab_schema_list` / `ghostcrab_schema_inspect`

**WHY**
L'agent doit pouvoir concevoir et enregistrer ses propres schémas sans accès direct à PostgreSQL. Les schémas sont eux-mêmes stockés dans `mfo_facets` avec `schema_id = 'mfo:schema'` — le système est homoiconique.

**WHAT**
- `ghostcrab_schema_register` → upsert dans `mfo_facets` avec `schema_id='mfo:schema'`
- `ghostcrab_schema_list` → `ghostcrab_search` filtré sur `schema_id='mfo:schema'`
- `ghostcrab_schema_inspect` → récupère un schéma par son ID

**HOW**

```typescript
// src/tools/facets/schema.ts
import { z }            from 'zod'
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

// REGISTER
registerTool({
  definition: {
    name: 'ghostcrab_schema_register',
    description: 'Register a new facet schema, graph node type, or edge label. Call ghostcrab_schema_list first. Schemas are stored as facets — the system is self-describing.',
    inputSchema: {
      type: 'object',
      required: ['definition'],
      properties: {
        target: {
          type: 'string',
          enum: ['facets','graph_node','graph_edge'],
          default: 'facets'
        },
        definition: {
          type: 'object',
          description: 'Full schema definition per SCHEMA_DESIGN.md rules',
          required: ['schema_id','description']
        }
      }
    }
  },
  handler: async (args) => {
    const { target = 'facets', definition } = args as {
      target: string; definition: Record<string, unknown>
    }
    if (!definition?.schema_id) throw new Error('definition.schema_id required')

    // Check for duplicate
    const existing = await query<{ id: string }>(`
      SELECT id FROM mfo_facets
      WHERE schema_id = 'mfo:schema'
        AND facets @> $1::jsonb
    `, [JSON.stringify({ schema_id: definition.schema_id })])

    if (existing.length > 0) {
      return {
        registered: false,
        reason:     'Schema already exists — use ghostcrab_schema_inspect to review, then update version',
        existing_id: existing[0].id
      }
    }

    const rows = await query<{ id: string }>(`
      INSERT INTO mfo_facets (schema_id, content, facets)
      VALUES ('mfo:schema', $1, $2::jsonb)
      RETURNING id
    `, [
      JSON.stringify(definition, null, 2),
      JSON.stringify({ schema_id: definition.schema_id, target, version: 1 })
    ])

    return { registered: true, id: rows[0].id, schema_id: definition.schema_id }
  }
})

// LIST
registerTool({
  definition: {
    name: 'ghostcrab_schema_list',
    description: 'List all registered schemas. Always call this BEFORE ghostcrab_schema_register to avoid duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['facets','graph_node','graph_edge','all'], default: 'all' }
      }
    }
  },
  handler: async (args) => {
    const target = (args.target as string) ?? 'all'
    const params: unknown[] = []
    let where = `WHERE schema_id = 'mfo:schema'`
    if (target !== 'all') {
      where += ` AND facets @> $1::jsonb`
      params.push(JSON.stringify({ target }))
    }
    const rows = await query<{ facets: Record<string,unknown>; content: string }>(`
      SELECT facets, content FROM mfo_facets ${where} ORDER BY created_at
    `, params)
    return { schemas: rows.map(r => ({ ...r.facets, definition: JSON.parse(r.content) })) }
  }
})

// INSPECT
registerTool({
  definition: {
    name: 'ghostcrab_schema_inspect',
    description: 'Get full definition of a registered schema by its schema_id.',
    inputSchema: {
      type: 'object',
      required: ['schema_id'],
      properties: {
        schema_id: { type: 'string' }
      }
    }
  },
  handler: async (args) => {
    const rows = await query<{ content: string; facets: Record<string,unknown> }>(`
      SELECT content, facets FROM mfo_facets
      WHERE schema_id = 'mfo:schema'
        AND facets @> $1::jsonb
      LIMIT 1
    `, [JSON.stringify({ schema_id: args.schema_id })])
    if (!rows.length) return { found: false, schema_id: args.schema_id }
    return { found: true, schema: JSON.parse(rows[0].content), meta: rows[0].facets }
  }
})
```

***

## MR 3 — pg_dgraph Tools

### PR 3.1 — `ghostcrab_coverage`

**WHY**
C'est le tool qui donne à l'agent sa conscience épistémique. Il compare les nœuds de l'agent contre une ontologie de référence et retourne un coverage score actionnable avec gap nodes explicites.

**WHAT**
- Récupérer tous les nœuds de l'agent depuis `mfo_nodes`
- Récupérer l'ontologie de référence depuis `mfo_facets` (schema `mfo:ontology`)
- Calculer le coverage score et lister les gaps
- Retourner `can_proceed_autonomously` selon les thresholds

**HOW**

```typescript
// src/tools/dgraph/coverage.ts
import { z }            from 'zod'
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

const THRESHOLD_FULL   = 0.85
const THRESHOLD_PARTIAL = 0.70

registerTool({
  definition: {
    name: 'ghostcrab_coverage',
    description: 'Check epistemic coverage for a domain. Returns coverage_score, gap_nodes, and can_proceed_autonomously. coverage >= 0.85 = full autonomy. 0.70-0.85 = proceed with disclosed gaps. < 0.70 = escalate.',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain:   { type: 'string', description: 'Domain ontology to check against (e.g. "gdpr", "contract-law")' },
        agent_id: { type: 'string', description: 'Agent node ID. Defaults to self.' }
      }
    }
  },
  handler: async (args) => {
    const domain   = args.domain as string
    const agentId  = (args.agent_id as string) ?? 'agent:self'

    // Get agent's knowledge nodes for this domain
    const agentNodes = await query<{ id: string; label: string }>(`
      SELECT id, label FROM mfo_nodes
      WHERE properties @> $1::jsonb
    `, [JSON.stringify({ domain })])

    // Get domain ontology nodes
    const ontologyNodes = await query<{
      id: string; label: string; criticality: string
    }>(`
      SELECT
        facets->>'node_id'      AS id,
        facets->>'label'        AS label,
        facets->>'criticality'  AS criticality
      FROM mfo_facets
      WHERE schema_id = 'mfo:ontology'
        AND facets @> $1::jsonb
    `, [JSON.stringify({ domain })])

    if (ontologyNodes.length === 0) {
      return {
        domain,
        coverage_score: null,
        message: `No ontology registered for domain: ${domain}. Register ontology nodes via ghostcrab_remember with schema_id='mfo:ontology'.`,
        can_proceed_autonomously: false
      }
    }

    const agentSet    = new Set(agentNodes.map(n => n.id))
    const gapNodes    = ontologyNodes.filter(n => !agentSet.has(n.id))
    const covered     = ontologyNodes.length - gapNodes.length
    const score       = covered / ontologyNodes.length
    const canProceed  = score >= THRESHOLD_FULL
    const partial     = score >= THRESHOLD_PARTIAL && score < THRESHOLD_FULL

    return {
      agent_id:   agentId,
      domain,
      coverage_score:     parseFloat(score.toFixed(3)),
      covered_nodes:      covered,
      total_nodes:        ontologyNodes.length,
      gap_nodes:          gapNodes.map(n => ({
        id:          n.id,
        label:       n.label,
        criticality: n.criticality ?? 'normal'
      })),
      can_proceed_autonomously: canProceed,
      recommended_action: canProceed ? 'proceed'
                        : partial    ? 'proceed_with_disclosure'
                        :              'escalate',
      thresholds: { full: THRESHOLD_FULL, partial: THRESHOLD_PARTIAL }
    }
  }
})
```

***

### PR 3.2 — `ghostcrab_traverse`

**WHY**
Traversal de graphe pour comprendre les dépendances et impacts. Implémenté en SQL récursif (Common Table Expressions) — pas d'algorithme externe.

**WHAT**
- BFS récursif via CTE PostgreSQL
- Direction `outbound` (ce que ce nœud affecte) ou `inbound` (ce qui affecte ce nœud)
- Filtre par `edge_labels`
- Retourne le chemin complet + gap nodes détectés

**HOW**

```typescript
// src/tools/dgraph/traverse.ts
import { z }            from 'zod'
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

registerTool({
  definition: {
    name: 'ghostcrab_traverse',
    description: 'Walk the knowledge graph from a start node. direction=outbound finds what this node affects; inbound finds what affects this node. Returns full path and gap nodes.',
    inputSchema: {
      type: 'object',
      required: ['start'],
      properties: {
        start:       { type: 'string', description: 'Start node ID (e.g. "task:my-project:oauth")' },
        direction:   { type: 'string', enum: ['outbound','inbound'], default: 'outbound' },
        edge_labels: { type: 'array', items: { type: 'string' },
                       description: 'Edge labels to follow (e.g. ["BLOCKS","REQUIRES"]). Empty = all.' },
        depth:       { type: 'integer', min: 1, max: 10, default: 3 },
        target:      { type: 'string', description: 'Optional: find path to specific target node' }
      }
    }
  },
  handler: async (args) => {
    const start       = args.start as string
    const direction   = (args.direction as string) ?? 'outbound'
    const edgeLabels  = (args.edge_labels as string[]) ?? []
    const depth       = Math.min((args.depth as number) ?? 3, 10)

    const srcCol = direction === 'outbound' ? 'source' : 'target'
    const dstCol = direction === 'outbound' ? 'target' : 'source'

    const labelFilter = edgeLabels.length > 0
      ? `AND e.label = ANY($3::text[])`
      : ''

    const rows = await query<{
      node_id: string; node_label: string; node_type: string;
      edge_label: string; depth: number; path: string[]
    }>(`
      WITH RECURSIVE traversal AS (
        -- Base: start node
        SELECT
          n.id         AS node_id,
          n.label      AS node_label,
          n.node_type,
          NULL::text   AS edge_label,
          0            AS depth,
          ARRAY[n.id]  AS path
        FROM mfo_nodes n
        WHERE n.id = $1

        UNION ALL

        SELECT
          n2.id,
          n2.label,
          n2.node_type,
          e.label,
          t.depth + 1,
          t.path || n2.id
        FROM traversal t
        JOIN mfo_edges e ON e.${srcCol} = t.node_id ${labelFilter}
        JOIN mfo_nodes n2 ON n2.id = e.${dstCol}
        WHERE t.depth < $2
          AND NOT n2.id = ANY(t.path)  -- cycle prevention
      )
      SELECT DISTINCT ON (node_id) *
      FROM traversal
      ORDER BY node_id, depth
    `, edgeLabels.length > 0
      ? [start, depth, edgeLabels]
      : [start, depth])

    // Detect gap nodes (no properties.mastery or mastery=0)
    const gapNodes = rows.filter(r =>
      r.node_type === 'concept' && r.node_id !== start
    )

    return {
      start_node:  start,
      direction,
      edge_labels: edgeLabels,
      depth,
      path:        rows,
      node_count:  rows.length,
      gap_candidates: gapNodes.map(n => ({
        id:    n.node_id,
        label: n.node_label,
        via:   n.edge_label
      }))
    }
  }
})
```

***

### PR 3.3 — `ghostcrab_learn`

**WHY**
Write path vers pg_dgraph. L'agent écrit ses nœuds de connaissance et arêtes après chaque tâche. Upsert sur `id` pour les nœuds, insert unique pour les arêtes.

**HOW**

```typescript
// src/tools/dgraph/learn.ts
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

registerTool({
  definition: {
    name: 'ghostcrab_learn',
    description: 'Write a new knowledge node or directed edge to the knowledge graph. Call after completing a task where you learned something structural. Learning is mandatory — a task is not done until the graph reflects what you learned.',
    inputSchema: {
      type: 'object',
      properties: {
        node: {
          type: 'object',
          description: 'Upsert a knowledge node',
          properties: {
            id:        { type: 'string', description: 'Unique ID (convention: type:domain:name)' },
            node_type: { type: 'string', description: 'concept|task|regulation|person|tool|process' },
            label:     { type: 'string' },
            properties:{ type: 'object', description: 'domain, mastery(0-1), status, source_ref, ...' }
          },
          required: ['id','node_type','label']
        },
        edge: {
          type: 'object',
          description: 'Insert a directed edge A → B',
          properties: {
            source:     { type: 'string' },
            target:     { type: 'string' },
            label:      { type: 'string',
                          description: 'REQUIRES|ENABLES|BLOCKS|CONTRADICTS|SUPERSEDES|BELONGS_TO|HAS_GAP|DELEGATES_TO' },
            weight:     { type: 'number', minimum: 0, maximum: 1, default: 1.0 },
            properties: { type: 'object' }
          },
          required: ['source','target','label']
        }
      }
    }
  },
  handler: async (args) => {
    const results: Record<string, unknown> = {}

    if (args.node) {
      const n = args.node as {
        id: string; node_type: string; label: string;
        properties?: Record<string, unknown>
      }
      await query(`
        INSERT INTO mfo_nodes (id, node_type, label, properties)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (id) DO UPDATE
          SET label      = EXCLUDED.label,
              properties = mfo_nodes.properties || EXCLUDED.properties,
              updated_at = now()
      `, [n.id, n.node_type, n.label, JSON.stringify(n.properties ?? {})])

      results.node = { learned: true, id: n.id }
    }

    if (args.edge) {
      const e = args.edge as {
        source: string; target: string; label: string;
        weight?: number; properties?: Record<string, unknown>
      }

      // Ensure source and target nodes exist (auto-create stubs)
      for (const nodeId of [e.source, e.target]) {
        await query(`
          INSERT INTO mfo_nodes (id, node_type, label)
          VALUES ($1, 'unknown', $1)
          ON CONFLICT (id) DO NOTHING
        `, [nodeId])
      }

      const rows = await query<{ id: string }>(`
        INSERT INTO mfo_edges (source, target, label, weight, properties)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
      `, [
        e.source, e.target, e.label,
        e.weight ?? 1.0,
        JSON.stringify(e.properties ?? {})
      ])

      results.edge = { learned: true, id: rows[0].id, label: e.label }
    }

    return results
  }
})
```

***

## MR 4 — pg_pragma Tools

### PR 4.1 — `ghostcrab_pack`

**WHY**
Working memory surface. Assemble un bundle ranked depuis `mfo_projections` et `mfo_facets`. Le `pack_text` est le seul output que l'agent injecte directement dans son contexte.

**HOW**

```typescript
// src/tools/pragma/pack.ts
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

registerTool({
  definition: {
    name: 'ghostcrab_pack',
    description: 'Get a ranked, compact context bundle for the current query. Inject pack_text at the top of your reasoning. This IS your working memory — call it before every non-trivial reasoning turn.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query:    { type: 'string' },
        agent_id: { type: 'string', default: 'agent:self' },
        scope:    { type: 'string', description: 'project:X or session:Y to narrow scope' },
        limit:    { type: 'integer', default: 15, maximum: 50 }
      }
    }
  },
  handler: async (args) => {
    const agentId = (args.agent_id as string) ?? 'agent:self'
    const scope   = args.scope as string | undefined
    const limit   = Math.min((args.limit as number) ?? 15, 50)
    const q       = args.query as string

    const params: unknown[] = [agentId, limit]
    let scopeFilter = ''
    if (scope) {
      scopeFilter = 'AND (scope = $3 OR scope IS NULL)'
      params.splice(2, 0, scope)
    }

    // Pull projections, ranked by weight — CONSTRAINT always floats to top
    const projRows = await query<{
      proj_type: string; content: string; weight: number;
      source_ref: string; status: string
    }>(`
      SELECT proj_type, content, weight, source_ref, status
      FROM mfo_projections
      WHERE agent_id = $1
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
        ${scopeFilter}
      ORDER BY
        CASE proj_type WHEN 'CONSTRAINT' THEN 0 ELSE 1 END,
        weight DESC
      LIMIT $2
    `, params)

    // Also pull relevant facts from mfo_facets via BM25
    const factRows = await query<{ content: string; id: string; score: number }>(`
      SELECT content, id,
        ts_rank(bm25_vector, plainto_tsquery('english', $1)) AS score
      FROM mfo_facets
      WHERE bm25_vector @@ plainto_tsquery('english', $1)
        AND (valid_until IS NULL OR valid_until > CURRENT_DATE)
      ORDER BY score DESC
      LIMIT 5
    `, [q])

    const hasBlockingConstraint = projRows.some(
      r => r.proj_type === 'CONSTRAINT' && r.status === 'blocking'
    )

    // Build pack_text — line-oriented DSL
    const lines = [
      ...projRows.map(r => `${r.proj_type}: ${r.content}`),
      ...factRows.map(r => `FACT: ${r.content}`)
    ]

    const packText = lines.join('\n')
    const tokenEstimate = Math.ceil(packText.length / 4)

    return {
      agent_id:               agentId,
      query:                  q,
      pack:                   projRows,
      pack_text:              packText,
      token_estimate:         tokenEstimate,
      has_blocking_constraint: hasBlockingConstraint,
      item_count:             lines.length
    }
  }
})
```

***

### PR 4.2 — `ghostcrab_status`

**WHY**
Snapshot opérationnel en une lecture. Lit `mfo_agent_state` + métriques depuis `mfo_facets` + gaps ouverts depuis `mfo_nodes`. Retourne des `directives[]` auto-exécutables.

**HOW**

```typescript
// src/tools/pragma/status.ts
import { registerTool } from '../registry.js'
import { query }        from '../../db/client.js'

registerTool({
  definition: {
    name: 'ghostcrab_status',
    description: 'One-read operational + epistemic snapshot. Read directives[] and execute matching conditions immediately. Call at session start and before any expensive action.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', default: 'agent:self' }
      }
    }
  },
  handler: async (args) => {
    const agentId = (args.agent_id as string) ?? 'agent:self'

    // Operational state
    const stateRows = await query<{
      health: string; state: string; metrics: Record<string,unknown>
    }>(`
      SELECT health, state, metrics
      FROM mfo_agent_state
      WHERE agent_id = $1
    `, [agentId])

    const state = stateRows[0] ?? { health: 'GREEN', state: 'IDLE', metrics: {} }

    // Open gap nodes
    const gapRows = await query<{ id: string; label: string }>(`
      SELECT n.id, n.label
      FROM mfo_edges e
      JOIN mfo_nodes n ON n.id = e.target
      WHERE e.label = 'HAS_GAP'
        AND e.source = $1
    `, [agentId])

    // Blocking projections
    const blockingRows = await query<{ content: string }>(`
      SELECT content FROM mfo_projections
      WHERE agent_id = $1
        AND proj_type = 'CONSTRAINT'
        AND status = 'blocking'
        AND (expires_at IS NULL OR expires_at > now())
    `, [agentId])

    const metrics = state.metrics as Record<string, number>

    // Build auto-executable directives
    const directives = []
    if ((metrics.avg_latency_ms ?? 0) > 500)
      directives.push({ condition: 'avg_latency_ms > 500',          action: 'throttle_parallel_tools' })
    if ((metrics.token_budget_remaining ?? 99999) < 2000)
      directives.push({ condition: 'token_budget_remaining < 2000', action: 'switch_to_compact_mode'  })
    if (gapRows.length > 0)
      directives.push({ condition: 'blocking_gaps > 0',             action: 'escalate_to_human',
                         gaps: gapRows })
    if (state.health === 'RED')
      directives.push({ condition: 'health = RED',                  action: 'pause_all_non_critical'  })

    return {
      agent_id:     agentId,
      snapshot_at:  new Date().toISOString(),
      operational: {
        health:                  state.health,
        state:                   state.state,
        ...metrics
      },
      epistemic: {
        open_gap_nodes:    gapRows.length,
        blocking_gaps:     blockingRows.length,
        gap_nodes:         gapRows
      },
      blocking_constraints: blockingRows,
      directives
    }
  }
})
```

***

## MR 5 — Bootstrap Data

### PR 5.1 — Self-Describing Seed

**WHY**
Toute la documentation du système doit être dans pg_facets au démarrage — c'est le bootstrap épistémique. Un agent qui démarre à froid trouve les règles via `ghostcrab_search`, pas via des fichiers locaux.

**WHAT**
Script `bootstrap/seed.ts` exécuté au démarrage si `mfo_facets` est vide sur `schema_id='mfo:system'`.

**HOW**

```typescript
// src/bootstrap/seed.ts
import { query } from '../db/client.js'

const SEED_ENTRIES = [
  // Tools
  {
    content: 'ghostcrab_search retrieves ranked documents. Empty query + filters = pure facet filter, fastest mode. Use before ghostcrab_pack for specific document retrieval.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_search', level: 'foundation',
              use_when: 'Retrieve specific content by topic or facet value' }
  },
  {
    content: 'ghostcrab_count returns counts grouped by facet dimensions. Zero content token cost. Call BEFORE ghostcrab_search to understand what exists. First call in any planning sequence.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_count', level: 'foundation',
              use_when: 'Understand what exists before fetching content' }
  },
  {
    content: 'ghostcrab_pack returns a pre-ranked compact context bundle. Inject pack_text at TOP of reasoning. This is your working memory. Call before every non-trivial reasoning turn.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_pack', level: 'foundation',
              use_when: 'Before any multi-step reasoning or domain task' }
  },
  {
    content: 'ghostcrab_status returns operational+epistemic snapshot in one read. Read directives[] and execute matching conditions immediately. Call at session start.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_status', level: 'foundation',
              use_when: 'Session start, before expensive actions' }
  },
  {
    content: 'ghostcrab_coverage checks domain coverage against ontology. Returns coverage_score and gap_nodes. >= 0.85 = full autonomy. 0.70-0.85 = proceed with disclosed gaps. < 0.70 = escalate.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_coverage', level: 'intermediate',
              use_when: 'Before autonomous action in a domain-specific task' }
  },
  {
    content: 'ghostcrab_traverse walks the knowledge graph. outbound=what this node affects; inbound=what affects this node. Use for dependency/impact analysis.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_traverse', level: 'intermediate',
              use_when: 'Understand structural relationships and downstream impacts' }
  },
  {
    content: 'ghostcrab_learn writes a knowledge node or directed edge. Call after every task. VALID LABELS: REQUIRES, ENABLES, BLOCKS, CONTRADICTS, SUPERSEDES, BELONGS_TO, HAS_GAP, DELEGATES_TO.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_learn', level: 'intermediate',
              use_when: 'After completing any task that involved structural knowledge' }
  },
  {
    content: 'ghostcrab_remember stores a fact or document. Returns UUID for future reference. Facets are free-form — design them to support your filtering needs.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_remember', level: 'foundation',
              use_when: 'Store any fact, observation, or document worth remembering' }
  },
  {
    content: 'ghostcrab_schema_register creates a new facet schema. Call ghostcrab_schema_list FIRST. Requires 3 examples before registering. Schema is stored as a facet — system is self-describing.',
    facets: { entry_type: 'tool', tool_name: 'ghostcrab_schema_register', level: 'intermediate',
              use_when: 'New type of information with no matching existing schema' }
  },
  // Rules
  {
    content: 'Reading sequence: (1) ghostcrab_count — shape of knowledge. (2) ghostcrab_search — right slice. (3) ghostcrab_traverse — structure. (4) ghostcrab_pack — working context. Use cheapest level that answers the question.',
    facets: { entry_type: 'rule', level: 'foundation',
              use_when: 'Any memory read operation' }
  },
  {
    content: 'Write-back is mandatory. After every session: ghostcrab_remember for facts, ghostcrab_learn for nodes/edges. A task is not done until the graph reflects what was learned. Memory not written = memory lost.',
    facets: { entry_type: 'rule', level: 'foundation',
              use_when: 'After every completed task, before session end' }
  },
  {
    content: 'Gap disclosure format — never say "I don\'t know" without structure: {escalate:true, gap_node_id, gap_label, covered_up_to, reason, resume_condition}.',
    facets: { entry_type: 'rule', level: 'foundation',
              use_when: 'Gap detected in ghostcrab_coverage or blocking constraint in ghostcrab_pack' }
  },
  {
    content: 'Schema design checklist before ghostcrab_schema_register: (1) 3 real examples ready? (2) Every required field always available? (3) Every facet dimension filterable? (4) Every edge label forms true sentence A LABEL B? (5) ghostcrab_schema_list checked first?',
    facets: { entry_type: 'rule', tool_name: 'ghostcrab_schema_register', level: 'intermediate',
              use_when: 'Before designing a new schema' }
  },
  // Concepts
  {
    content: 'Facets are application state. A status facet dimension is simultaneously a search filter, a state machine state, and a dashboard metric. Design schemas like state machines — define all states upfront.',
    facets: { entry_type: 'concept', level: 'advanced',
              use_when: 'Designing any facet schema that tracks state over time' }
  },
  {
    content: 'Three knowledge levels: WHAT EXISTS (facets_count, zero tokens), WHAT I NEED (search+filter), HOW IT CONNECTS (traverse). Not a pipeline — a toolkit. Use cheapest level that answers the question.',
    facets: { entry_type: 'concept', level: 'foundation',
              use_when: 'Deciding which read tool to use' }
  }
]

export async function seedIfEmpty() {
  const existing = await query<{ count: string }>(`
    SELECT COUNT(*) AS count FROM mfo_facets WHERE schema_id = 'mfo:system'
  `)

  if (parseInt(existing[0].count) > 0) {
    console.error('[ghostcrab] Bootstrap data already present, skipping seed')
    return
  }

  console.error(`[ghostcrab] Seeding ${SEED_ENTRIES.length} bootstrap entries...`)

  for (const entry of SEED_ENTRIES) {
    await query(`
      INSERT INTO mfo_facets (schema_id, content, facets)
      VALUES ('mfo:system', $1, $2::jsonb)
    `, [entry.content, JSON.stringify(entry.facets)])
  }

  console.error('[ghostcrab] Bootstrap complete')
}
```

Appel dans `src/index.ts`, juste avant `server.connect()` :

```typescript
import { seedIfEmpty } from './bootstrap/seed.js'
// ...
await seedIfEmpty()
await server.connect(transport)
```

***

## MR 6 — Docker + Distribution

### PR 6.1 — Dockerfile + docker-compose

**HOW**

```dockerfile
# docker/Dockerfile
FROM postgres:16-alpine

# Extensions seraient installées ici depuis les .so compilés
# Pour la version initiale : extensions via SQL pur (schema émulé)
COPY docker/init.sql /docker-entrypoint-initdb.d/

ENV POSTGRES_DB=mfo
ENV POSTGRES_USER=mfo
ENV POSTGRES_PASSWORD=mfo
```

```yaml
# docker/docker-compose.yml
services:
  postgres:
    build: .
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB:       ghostcrab
      POSTGRES_USER:     ghostcrab
      POSTGRES_PASSWORD: ghostcrab
    volumes:
      - ghostcrab_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ghostcrab"]
      interval: 5s
      timeout: 5s
      retries: 5

  mcp-server:
    image: node:20-alpine
    working_dir: /app
    command: npx @mindflight/ghostcrab
    environment:
      DATABASE_URL: postgres://ghostcrab:ghostcrab@postgres:5432/ghostcrab
    depends_on:
      postgres:
        condition: service_healthy
    stdin_open: true
    tty: true

volumes:
  ghostcrab_data:
```

### PR 6.2 — `.mcp.json` et `README` d'installation

**HOW**

```json
// .mcp.json — fichier livré avec le skill, copié par l'utilisateur
{
  "mcpServers": {
    "ghostcrab": {
      "command": "npx",
      "args": ["@mindflight/ghostcrab"],
      "env": {
        "DATABASE_URL": "postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab"
      }
    }
  }
}
```

***

## Récapitulatif des MRs

| MR | PRs | Ce qu'un agent peut faire après |
|---|---|---|
| **MR 1 — Foundation** | 1.1 DB client, 1.2 Server+Registry, 1.3 Migrations | Server démarre, DB initialisée |
| **MR 2 — pg_facets** | 2.1 `ghostcrab_search`, 2.2 `ghostcrab_remember`, 2.3 `ghostcrab_count`, 2.4 `ghostcrab_schema_*` | Stocker, chercher, compter, designer des schémas |
| **MR 3 — pg_dgraph** | 3.1 `ghostcrab_coverage`, 3.2 `ghostcrab_traverse`, 3.3 `ghostcrab_learn` | Se modéliser, traverser les dépendances, apprendre |
| **MR 4 — pg_pragma** | 4.1 `ghostcrab_pack`, 4.2 `ghostcrab_status` | Working memory, auto-régulation |
| **MR 5 — Bootstrap** | 5.1 seed | Système auto-descriptif dès le premier `ghostcrab_search` |
| **MR 6 — Docker** | 6.1 compose, 6.2 distribution | `docker run` + `npx` fonctionnels |

**Ordre d'exécution strict :** MR1 → MR2 (2.1 avant les autres) → MR3 et MR4 en parallèle → MR5 → MR6. Chaque MR est un incrément deployable indépendant.