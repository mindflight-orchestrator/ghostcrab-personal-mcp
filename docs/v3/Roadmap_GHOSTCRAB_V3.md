Voici le SOP complet en markdown — copiable directement dans un fichier `SOP_GHOSTCRAB_V3.md`.

***

```markdown
# SOP — GhostCrab V3 : Architecture 3-Layer + intégration mindCLI

**Version** : 3.0-draft  
**Statut** : Proposition historique partiellement implémentée, à lire avec les corrections ci-dessous  
**Public cible** : Agent implémenteur (niveau 5/10), architecte humain validateur  
**Dépôts concernés** : `ghostcrab-mcp`, `mindcli`, `pg_facets`, `pg_dgraph`, `pg_pragma`

> Note 2026-03-30:
> ce document reste utile comme intention d'architecture V3, mais ce n'est plus la
> source de vérité opérationnelle. Pour l'état réellement livré dans `ghostcrab-mcp`,
> utiliser en priorité [docs/v3/RUNBOOK_V3.md](RUNBOOK_V3.md) et
> [README_ARCHITECTURE.md](../../README_ARCHITECTURE.md).
>
> Corrections importantes par rapport au draft initial:
> - le contrat livré sur `mfo_facets` est `UNIQUE (source_ref, workspace_id) WHERE source_ref IS NOT NULL`, pas `UNIQUE (source_ref)`
> - le lifecycle DDL réellement implémenté côté repo passe aujourd'hui par les tools MCP
>   `ghostcrab_ddl_*` et les commandes CLI `ghostcrab maintenance ddl-approve|ddl-execute`
> - la feature Geo est explicitement optionnelle et retourne `geo_feature_not_available`
>   sur les déploiements standard sans PostGIS

---

## 1. Vue d'ensemble — Pourquoi une V3

### 1.1 Problèmes résolus

La V2 de GhostCrab expose des outils MCP qui permettent à un agent d'explorer
et d'écrire dans une base PostgreSQL via pg_facets/pg_dgraph/pg_pragma. Cette
approche fonctionnait pour des ontologies simples et uniques. Trois limitations
bloquent le passage à des cas réels :

1. **Table unique globale** : `mfo_facets`, `graph.entity`, `graph.relation`
   sont partagées par toutes les ontologies. Impossible d'isoler "projets
   agence" de "législation" de "CRM" sans collision de clés et de workspace.

2. **Absence de couche relationnelle typée** : l'agent stocke tout en
   facettes/jsonb. Les contraintes FK, les types natifs (`TIMESTAMP`, `UUID`,
   `NUMERIC`) et le query planner PostgreSQL ne peuvent pas travailler
   correctement. Une requête sur 10M de facettes déclenche un GROUP BY pivot
   non-optimisable.

3. **Couplage fort MCP ↔ volume de données** : les appels MCP passent par le
   LLM context window. Synchroniser 50 000 tâches Odoo via des appels MCP un
   par un est structurellement impossible. Il faut un canal hors-LLM, batch,
   déterministe.

### 1.2 Principe V3 en une phrase

> L'agent décide du datamodel via MCP (avec validation humaine pour le DDL),
> mindCLI exécute les syncs en batch déterministe, PostgreSQL garantit
> l'intégrité en 3 layers complémentaires.

---

## 2. Architecture cible — Les 3 layers

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 3 — PROJECTION (read-only, dashboard unifié)              │
│  mfo_projections (workspace_id, projection_key, payload jsonb)   │
│  Vues matérialisées cross-workspace                              │
│  ← Rafraîchi par triggers Layer1 ou par mindcli refresh          │
└─────────────────────────────┬────────────────────────────────────┘
                              │ alimenté par
┌─────────────────────────────▼────────────────────────────────────┐
│  LAYER 2 — EXTENSIONS (flexible, sémantique, recherche)          │
│  mfo_facets        (workspace_id, schema_id, content, facets)    │
│  graph.entity      (workspace_id, entity_type, properties)       │
│  graph.relation    (workspace_id, src_id, dst_id, label, weight) │
│  pg_pragma packs   (contexte agent, working memory)              │
│  ← Alimenté par triggers générés au moment du DDL Layer1         │
│  ← Alimenté par mindcli ingest (bulk)                            │
└─────────────────────────────┬────────────────────────────────────┘
                              │ dual-write via triggers
┌─────────────────────────────▼────────────────────────────────────┐
│  LAYER 1 — RELATIONNEL (typé, FK, contraintes, query planner)    │
│  ws_{workspace_id}.{table_name}                                  │
│  Ex: ws_projects.tasks, ws_agency.contacts, ws_law.articles      │
│  ← Créé par ghostcrab_ddl_execute (après approbation humaine)    │
│  ← Alimenté par mindcli ingest (batch upsert)                    │
└──────────────────────────────────────────────────────────────────┘
```

### Règles invariantes des layers

| Règle | Détail |
|---|---|
| Layer 1 → Layer 2 | Toujours via trigger PostgreSQL. Jamais de write direct Layer2 depuis l'application |
| Layer 2 → Layer 1 | Interdit. Layer2 est en lecture depuis Layer1 |
| Layer 3 | Read-only. Jamais de write direct |
| DDL Layer 1 | Requiert `ghostcrab_ddl_propose` + approbation humaine explicite |
| Bulk import | Toujours via `mindcli ingest`. Jamais via appels MCP répétés |
| Raw SQL agent | Interdit. L'agent passe par le proxy `mindcli pg query` |

---

## 3. Registre des workspaces

Un workspace est un namespace logique qui correspond à un **schema PostgreSQL
dédié** pour les tables Layer1, et à un `workspace_id` TEXT pour les tables
des extensions Layer2.

### 3.1 Table `mindbrain.workspaces`

```sql
CREATE SCHEMA IF NOT EXISTS mindbrain;

CREATE TABLE mindbrain.workspaces (
  id            TEXT PRIMARY KEY,          -- ex: 'agency_projects'
  label         TEXT NOT NULL,             -- ex: 'Projets Agence Web'
  pg_schema     TEXT NOT NULL UNIQUE,      -- ex: 'ws_agency_projects'
  description   TEXT,
  created_by    TEXT,                      -- agent_id ou 'human'
  created_at    TIMESTAMPTZ DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived', 'pending'))
);
```

### 3.2 Colonnes `workspace_id` sur les tables Layer2

```sql
-- À appliquer via migration sur les tables existantes
ALTER TABLE public.mfo_facets
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE graph.entity
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE graph.relation
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE public.mfo_projections
  ADD COLUMN IF NOT EXISTS workspace_id TEXT NOT NULL DEFAULT 'default';

-- Index pour isolation par workspace
CREATE INDEX IF NOT EXISTS idx_mfo_facets_ws
  ON mfo_facets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_graph_entity_ws
  ON graph.entity(workspace_id);
CREATE INDEX IF NOT EXISTS idx_graph_relation_ws
  ON graph.relation(workspace_id);
```

---

## 4. Primitives GhostCrab MCP — Catalogue complet V3

Chaque outil MCP est défini avec : nom, paramètres Go, comportement attendu,
et règles de sécurité.

### 4.1 Outils Workspace

#### `ghostcrab_workspace_create`

```go
// Paramètres
type WorkspaceCreateParams struct {
    ID          string `json:"id"`          // snake_case, max 32 chars
    Label       string `json:"label"`
    Description string `json:"description,omitempty"`
    CreatedBy   string `json:"created_by,omitempty"`
}

// Comportement
// 1. Valide que id matche ^[a-z][a-z0-9_]{1,31}$
// 2. Génère pg_schema = "ws_" + id
// 3. Exécute CREATE SCHEMA ws_{id}
// 4. INSERT INTO mindbrain.workspaces
// 5. Retourne {workspace_id, pg_schema, status: "created"}

// Sécurité : pas de validation humaine requise
// Idempotent : retourne status: "already_exists" si id existe
```

#### `ghostcrab_workspace_list`

```go
// Retourne la liste des workspaces actifs avec leurs statistiques
// SELECT w.*, 
//   (SELECT COUNT(*) FROM mfo_facets WHERE workspace_id = w.id) as facets_count,
//   (SELECT COUNT(*) FROM graph.entity WHERE workspace_id = w.id) as entities_count
// FROM mindbrain.workspaces w WHERE status = 'active'
```

### 4.2 Outils DDL (Datamodel Layer1)

#### `ghostcrab_ddl_propose`

```go
type DDLProposeParams struct {
    WorkspaceID string `json:"workspace_id"`
    SQL         string `json:"sql"`         // CREATE TABLE statement(s)
    Rationale   string `json:"rationale"`   // Pourquoi ce schéma
    SyncSpec    []SyncFieldSpec `json:"sync_spec"` // Mapping Layer1→Layer2
}

type SyncFieldSpec struct {
    ColumnName  string `json:"column_name"`
    FacetKey    string `json:"facet_key"`    // clé dans mfo_facets.facets jsonb
    IndexInBM25 bool   `json:"index_in_bm25"` // inclure dans content BM25
    GraphEdge   *GraphEdgeSpec `json:"graph_edge,omitempty"`
}

type GraphEdgeSpec struct {
    EdgeLabel   string `json:"edge_label"`  // label de relation graph
    TargetTable string `json:"target_table"` // table référencée
}

// Comportement
// 1. Parse le SQL — extrait table_name, colonnes, contraintes
// 2. Valide que le schema cible est ws_{workspace_id}
// 3. Valide l'absence de DROP/TRUNCATE/DELETE dans le SQL
// 4. Génère un migration_id = uuid
// 5. INSERT INTO mindbrain.pending_migrations(id, workspace_id, sql, sync_spec, rationale, status='pending')
// 6. Retourne {migration_id, status: "pending_approval", preview_trigger: <SQL du trigger généré>}
// NOTE : N'exécute RIEN. Expose le trigger qui sera créé pour que l'humain valide.
```

#### `ghostcrab_ddl_list_pending`

```go
// SELECT * FROM mindbrain.pending_migrations WHERE status = 'pending'
// Utilisé par l'humain pour voir ce qui attend validation
```

#### `ghostcrab_ddl_approve`

```go
// Appelé par l'humain (ou un outil humain-in-the-loop)
type DDLApproveParams struct {
    MigrationID string `json:"migration_id"`
    ApprovedBy  string `json:"approved_by"`
}
// UPDATE mindbrain.pending_migrations SET status='approved', approved_by=..., approved_at=now()
// Ne déclenche pas encore l'exécution
```

#### `ghostcrab_ddl_execute`

```go
type DDLExecuteParams struct {
    MigrationID string `json:"migration_id"`
}

// Comportement (transaction unique)
// 1. Vérifie status = 'approved'
// 2. Exécute le SQL de création de table dans ws_{workspace_id}
// 3. Génère et exécute le trigger de sync Layer1→Layer2
//    (voir section 5 pour la génération du trigger)
// 4. Exécute un resync initial si la table contient déjà des données
// 5. UPDATE status = 'executed'
// 6. Retourne {table_created, trigger_created, rows_synced}

// ROLLBACK complet si une étape échoue
```

**Table `mindbrain.pending_migrations`** :

```sql
CREATE TABLE mindbrain.pending_migrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  TEXT NOT NULL REFERENCES mindbrain.workspaces(id),
  sql           TEXT NOT NULL,
  sync_spec     JSONB NOT NULL DEFAULT '[]',
  rationale     TEXT,
  preview_trigger TEXT,        -- SQL du trigger à créer (pour review humaine)
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','executed','rejected')),
  proposed_by   TEXT,
  proposed_at   TIMESTAMPTZ DEFAULT now(),
  approved_by   TEXT,
  approved_at   TIMESTAMPTZ,
  executed_at   TIMESTAMPTZ
);
```

### 4.3 Outils d'introspection de sources externes

#### `ghostcrab_introspect`

```go
type IntrospectParams struct {
    Source     string   `json:"source"`      // 'odoo', 'gmail', 'recall', 'openapi'
    Endpoint   string   `json:"endpoint,omitempty"` // URL API
    SpecPath   string   `json:"spec_path,omitempty"` // chemin openapi local
    Tables     []string `json:"tables,omitempty"`   // filtrer sur certaines entités
    MaxDepth   int      `json:"max_depth,omitempty"` // profondeur des relations
}

// Comportement selon source :
// - 'openapi' : charge la spec OpenAPI, extrait schemas, retourne structure normalisée
// - 'odoo'    : appelle mindcli via subprocess : `mindcli odoo introspect --tables ...`
// - 'gmail'   : appelle mindcli : `mindcli gmail introspect`
// - 'recall'  : appelle mindcli : `mindcli recall introspect`
//
// Retourne IntrospectResult{
//   source, entities[]{ name, fields[]{ name, type, required, fk_to } }, relations[]
// }
// Ce résultat est utilisé par l'agent pour construire le DDL Layer1
```

### 4.4 Outils de requête (proxy sécurisé)

Ces outils remplacent tout accès raw SQL par l'agent. L'agent ne voit jamais
de SQL directement.

#### `ghostcrab_query_facets`

```go
type QueryFacetsParams struct {
    WorkspaceID  string            `json:"workspace_id"`
    SchemaID     string            `json:"schema_id,omitempty"`
    Filters      map[string]string `json:"filters,omitempty"`  // facet_key: value
    FullText     string            `json:"full_text,omitempty"` // BM25
    Limit        int               `json:"limit,omitempty"`
    Offset       int               `json:"offset,omitempty"`
}
// Exécute un template paramétrisé contre mfo_facets
// WHERE workspace_id = $1 AND (schema_id = $2 OR $2 IS NULL)
//   AND facets @> $filters_jsonb
//   AND to_tsvector(content) @@ plainto_tsquery($full_text)
// Retourne []FacetRow{id, schema_id, content, facets, score}
```

#### `ghostcrab_query_graph_neighbors`

```go
type GraphNeighborsParams struct {
    WorkspaceID string `json:"workspace_id"`
    EntityID    string `json:"entity_id"`
    EdgeLabels  []string `json:"edge_labels,omitempty"`
    Direction   string `json:"direction"` // 'out', 'in', 'both'
    MaxHops     int    `json:"max_hops,omitempty"` // défaut: 1
}
// Utilise pg_dgraph pour traversal
// Retourne []GraphNode avec les relations
```

#### `ghostcrab_query_sql` (RESTREINT — templates seulement)

```go
type QuerySQLParams struct {
    TemplateID  string            `json:"template_id"`
    WorkspaceID string            `json:"workspace_id"`
    Params      map[string]any    `json:"params"`
}
// Les templates sont déclarés dans mindbrain.query_templates
// L'agent ne peut PAS passer du SQL libre
// Équivalent de `mindcli pg query --template $id --workspace $ws`
```

**Table `mindbrain.query_templates`** :

```sql
CREATE TABLE mindbrain.query_templates (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT,  -- NULL = disponible pour tous les workspaces
  sql_template TEXT NOT NULL,  -- utilise $1, $2 ou :param_name
  param_schema JSONB,          -- JSON Schema des paramètres autorisés
  description  TEXT,
  created_by   TEXT,
  is_public    BOOLEAN DEFAULT false
);
```

### 4.5 Outils de mapping (déclaration de sync)

#### `ghostcrab_mapping_declare`

```go
type MappingDeclareParams struct {
    WorkspaceID string `json:"workspace_id"`
    SourceRef   string `json:"source_ref"`   // ex: 'odoo:project.task'
    TargetTable string `json:"target_table"` // ex: 'ws_agency.kanban_cards'
    FieldMap    []FieldMapping `json:"field_map"`
}

type FieldMapping struct {
    SourceField string `json:"source_field"` // champ API source
    TargetColumn string `json:"target_column"` // colonne Layer1
    Transform    string `json:"transform,omitempty"` // 'identity', 'truncate:255', 'date_iso'
}

// Stocke dans mindbrain.source_mappings
// Utilisé par mindcli ingest pour savoir comment mapper les données
```

### 4.6 Outils Layer3 (projections)

#### `ghostcrab_projection_create`

```go
type ProjectionCreateParams struct {
    WorkspaceID    string `json:"workspace_id"`
    ProjectionKey  string `json:"projection_key"` // identifiant de la vue
    SourceSQL      string `json:"source_sql"`      // SELECT statement (lecture seule)
    RefreshMode    string `json:"refresh_mode"`    // 'on_write', 'scheduled', 'manual'
    Schedule       string `json:"schedule,omitempty"` // cron si scheduled
}
// Crée une MATERIALIZED VIEW dans ws_{workspace_id}
// Ou stocke le résultat dans mfo_projections selon la taille
```

#### `ghostcrab_projection_read`

```go
// Lit une projection existante
// SELECT payload FROM mfo_projections
// WHERE workspace_id = $1 AND projection_key = $2
```

### 4.7 Outils d'apprentissage (inchangés, étendus workspace)

#### `ghostcrab_learn`

```go
// Identique V2 mais avec workspace_id obligatoire
type LearnParams struct {
    WorkspaceID string     `json:"workspace_id"`
    Edge        GraphEdge  `json:"edge"`
}
type GraphEdge struct {
    Source      string  `json:"source"`    // entity_id ou 'type:external_id'
    Target      string  `json:"target"`
    Label       string  `json:"label"`
    Weight      float64 `json:"weight,omitempty"`
    Properties  map[string]any `json:"properties,omitempty"`
}
```

#### `ghostcrab_forget`

```go
// Supprime un edge du graph
// DELETE FROM graph.relation WHERE workspace_id=$1 AND src_id=$2 AND dst_id=$3 AND label=$4
```

---

## 5. Génération automatique des triggers Layer1→Layer2

Lors de `ghostcrab_ddl_execute`, le serveur MCP génère programmatiquement un
trigger PostgreSQL à partir du `SyncSpec` fourni dans la migration.

### 5.1 Algorithme de génération (Go)

```go
func GenerateSyncTrigger(ws Workspace, table TableDef, spec []SyncFieldSpec) string {
    var contentFields []string
    var facetPairs    []string
    var graphEdges    []string

    for _, f := range spec {
        if f.IndexInBM25 {
            contentFields = append(contentFields, "COALESCE(NEW."+f.ColumnName+"::TEXT, '')")
        }
        if f.FacetKey != "" {
            facetPairs = append(facetPairs,
                fmt.Sprintf("'%s', NEW.%s", f.FacetKey, f.ColumnName))
        }
        if f.GraphEdge != nil {
            graphEdges = append(graphEdges, buildEdgeInsert(ws, f))
        }
    }

    contentExpr := strings.Join(contentFields, " || ' ' || ")
    facetsExpr  := "jsonb_build_object(" + strings.Join(facetPairs, ", ") + ")"

    return fmt.Sprintf(`
CREATE OR REPLACE FUNCTION %s.sync_%s_to_layers()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync Layer2 : mfo_facets
  INSERT INTO public.mfo_facets(
    source_ref, content, facets, schema_id, workspace_id, updated_at
  )
  VALUES (
    '%s:' || NEW.id::TEXT,
    %s,
    %s,
    '%s',
    '%s',
    now()
  )
  ON CONFLICT (source_ref, workspace_id) WHERE source_ref IS NOT NULL DO UPDATE
    SET content    = EXCLUDED.content,
        facets     = EXCLUDED.facets,
        updated_at = now();

  -- Sync Layer2 : graph.entity
  INSERT INTO graph.entity(external_id, entity_type, properties, workspace_id)
  VALUES (
    '%s:' || NEW.id::TEXT,
    '%s',
    row_to_json(NEW)::JSONB,
    '%s'
  )
  ON CONFLICT (external_id) DO UPDATE
    SET properties = EXCLUDED.properties;

  %s

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_%s_sync_layers
  AFTER INSERT OR UPDATE ON %s.%s
  FOR EACH ROW EXECUTE FUNCTION %s.sync_%s_to_layers();
`,
        ws.PgSchema, table.Name,
        table.Name,
        contentExpr,
        facetsExpr,
        table.Name,
        ws.ID,
        table.Name, table.Name, ws.ID,
        strings.Join(graphEdges, "\n"),
        table.Name, ws.PgSchema, table.Name,
        ws.PgSchema, table.Name,
    )
}
```

### 5.2 Contrainte sur `mfo_facets.source_ref`

Contrat effectivement livré dans `ghostcrab-mcp`:

- `source_ref` est **nullable**
- les rows historiques V2 gardent `source_ref = NULL`
- les rows synchronisées V3 utilisent une unicité **partielle par workspace**
- l'upsert trigger-based s'appuie sur `ON CONFLICT (source_ref, workspace_id) WHERE source_ref IS NOT NULL`

SQL réaligné avec l'implémentation :

```sql
ALTER TABLE public.mfo_facets
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS mfo_facets_source_ref_workspace_uniq
  ON mfo_facets(source_ref, workspace_id)
  WHERE source_ref IS NOT NULL;
```

---

## 6. mindCLI — Rôle, adaptations et nouvelles commandes

### 6.1 Positionnement

mindCLI est le **canal d'exécution déterministe** là où GhostCrab MCP est le
**canal de décision contextuel**. Les deux ne se substituent pas — ils se
complètent sur des contraintes différentes.

| Critère | GhostCrab MCP | mindCLI |
|---|---|---|
| Déclencheur | Agent LLM | Cron, CI/CD, webhook, human CLI |
| Volume données | < 1000 rows par appel | Illimité (streaming batch) |
| Latence acceptable | 100ms–30s | Millisecondes (pas de LLM) |
| Validation humaine | Intégrée (propose/approve) | Post-approbation uniquement |
| Sécurité SQL | Proxy template | Templates + raw pour ops humaines |
| Observabilité | Tool result JSON | stdout, logs structurés, TaskRegistry |

### 6.2 Nouvelles commandes mindCLI requises pour V3

#### 6.2.1 `mindcli workspace`

```bash
# Lister les workspaces
mindcli workspace list [--format json|table]

# Créer un workspace (miroir de ghostcrab_workspace_create)
# Utilisé par l'opérateur humain sans passer par l'agent
mindcli workspace create --id agency_projects --label "Projets Agence"

# Afficher le status d'un workspace
mindcli workspace status --id agency_projects
# Output: tables Layer1, count facets Layer2, count entities, last sync
```

**Implémentation Go** (`cmd/workspace.go`) :
```go
var workspaceCmd = &cobra.Command{Use: "workspace"}

var workspaceListCmd = &cobra.Command{
    Use: "list",
    RunE: func(cmd *cobra.Command, args []string) error {
        rows, err := db.Query(`
            SELECT w.id, w.label, w.pg_schema, w.status,
                   COUNT(f.id) as facets_count
            FROM mindbrain.workspaces w
            LEFT JOIN mfo_facets f ON f.workspace_id = w.id
            WHERE w.status = 'active'
            GROUP BY w.id, w.label, w.pg_schema, w.status
        `)
        // ... format et print
    },
}
```

#### 6.2.2 `mindcli migration`

```bash
# Lister les migrations en attente
mindcli migration list --status pending

# Approuver une migration (action humaine)
mindcli migration approve --id <migration_uuid> --by "francois"

# Rejeter
mindcli migration reject --id <migration_uuid> --reason "schéma à revoir"

# Exécuter (après approbation)
mindcli migration execute --id <migration_uuid>

# Preview du trigger généré
mindcli migration preview-trigger --id <migration_uuid>
```

**Implémentation Go** (`cmd/migration.go`) :
```go
var migrationApproveCmd = &cobra.Command{
    Use:  "approve",
    Args: cobra.NoArgs,
    RunE: func(cmd *cobra.Command, args []string) error {
        id, _  := cmd.Flags().GetString("id")
        by, _  := cmd.Flags().GetString("by")
        _, err := db.Exec(`
            UPDATE mindbrain.pending_migrations
            SET status = 'approved', approved_by = $2, approved_at = now()
            WHERE id = $1 AND status = 'pending'
        `, id, by)
        if err != nil { return err }
        fmt.Printf("Migration %s approved by %s\n", id, by)
        return nil
    },
}
```

#### 6.2.3 `mindcli ingest` (extension)

La commande `ingest` existante doit être étendue pour :

1. Lire le mapping déclaré dans `mindbrain.source_mappings`
2. Faire un upsert bulk sur la table Layer1 (pas directement dans les facettes)
3. Laisser les triggers gérer le dual-write Layer2

```bash
# Ingestion depuis Odoo vers workspace
mindcli odoo ingest \
  --workspace agency_projects \
  --entity project.task \
  --since "2026-01-01" \
  --batch-size 500

# Le flag --workspace est nouveau et obligatoire en V3
# Le flag --since permet l'ingestion incrémentale (updated_at > since)
# --batch-size contrôle les INSERT ... ON CONFLICT par batch
```

**Implémentation de l'upsert Layer1** (`internal/ingest/layer1.go`) :
```go
func UpsertLayer1(db *sql.DB, ws Workspace, tableName string, rows []map[string]any) error {
    if len(rows) == 0 { return nil }

    // Construction dynamique du COPY/INSERT batch
    cols := extractColumns(rows)
    placeholders := buildPlaceholders(len(rows), len(cols))

    sql := fmt.Sprintf(`
        INSERT INTO %s.%s (%s)
        VALUES %s
        ON CONFLICT (id) DO UPDATE SET %s, updated_at = now()
    `,
        ws.PgSchema, tableName,
        strings.Join(cols, ", "),
        placeholders,
        buildUpdateSet(cols),
    )

    // Les triggers s'occupent du Layer2 automatiquement
    _, err := db.Exec(sql, flattenRows(rows)...)
    return err
}
```

#### 6.2.4 `mindcli pg query` (extension pour templates)

```bash
# Exécuter un template de requête (proxy sécurisé)
mindcli pg query \
  --template task_by_phase \
  --workspace agency_projects \
  --param phase_id=42 \
  --format json

# Lister les templates disponibles
mindcli pg query --list --workspace agency_projects

# Créer un nouveau template (action humaine)
mindcli pg query --register \
  --id task_by_phase \
  --workspace agency_projects \
  --file query_task_by_phase.sql \
  --description "Tâches par phase avec statut"
```

**Table `mindbrain.query_templates`** (déjà définie en section 4.4)

**Implémentation Go** (`cmd/pg_query.go`) :
```go
var pgQueryCmd = &cobra.Command{
    Use: "query",
    RunE: func(cmd *cobra.Command, args []string) error {
        templateID, _ := cmd.Flags().GetString("template")
        workspaceID, _ := cmd.Flags().GetString("workspace")
        params, _      := cmd.Flags().GetStringToString("param")

        // 1. Charger le template
        var sqlTemplate, paramSchema string
        err := db.QueryRow(`
            SELECT sql_template, param_schema
            FROM mindbrain.query_templates
            WHERE id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)
        `, templateID, workspaceID).Scan(&sqlTemplate, &paramSchema)
        if err != nil { return fmt.Errorf("template not found: %s", templateID) }

        // 2. Valider les params contre le JSON Schema
        if err := validateParams(params, paramSchema); err != nil { return err }

        // 3. Exécuter
        result, err := executeTemplate(db, sqlTemplate, params, workspaceID)
        if err != nil { return err }

        // 4. Output JSON/table
        return printResult(cmd, result)
    },
}
```

#### 6.2.5 `mindcli sync` (nouveau — orchestration multi-sources)

```bash
# Définir un plan de sync depuis un fichier YAML
mindcli sync plan --file sync_plan.yaml --workspace agency_projects

# Exécuter un plan
mindcli sync run --plan agency_projects_daily

# Status d'un sync en cours
mindcli sync status --plan agency_projects_daily

# Format du fichier sync_plan.yaml :
```

```yaml
# sync_plan.yaml
id: agency_projects_daily
workspace: agency_projects
schedule: "0 */6 * * *"   # toutes les 6h
steps:
  - name: sync_odoo_tasks
    source: odoo
    entity: project.task
    target_table: ws_agency_projects.kanban_cards
    mapping: odoo_task_to_kanban
    mode: incremental     # ou 'full'
    since_column: write_date

  - name: sync_gmail_threads
    source: gmail
    entity: thread
    target_table: ws_agency_projects.email_threads
    mapping: gmail_thread_to_email
    mode: incremental
    since_hours: 24

  - name: sync_recall_transcripts
    source: recall
    entity: transcript
    target_table: ws_agency_projects.call_transcripts
    mapping: recall_to_transcript
    mode: incremental
    since_column: created_at

  - name: refresh_dashboard
    type: projection_refresh
    projection_key: agency_overview
    after: [sync_odoo_tasks, sync_gmail_threads, sync_recall_transcripts]
```

**Table `mindbrain.sync_plans`** :

```sql
CREATE TABLE mindbrain.sync_plans (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES mindbrain.workspaces(id),
  plan_yaml    TEXT NOT NULL,
  schedule     TEXT,          -- cron expression
  status       TEXT NOT NULL DEFAULT 'active',
  last_run_at  TIMESTAMPTZ,
  last_run_status TEXT        -- 'success', 'partial', 'failed'
);

CREATE TABLE mindbrain.sync_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      TEXT NOT NULL REFERENCES mindbrain.sync_plans(id),
  started_at   TIMESTAMPTZ DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running',
  steps_result JSONB DEFAULT '{}'::JSONB,  -- {step_name: {rows, errors, duration_ms}}
  error_msg    TEXT
);
```

#### 6.2.6 `mindcli resync` (réparation)

```bash
# Resynchroniser le Layer2 à partir du Layer1 existant
# Utile après un import bulk sans triggers, ou après une migration
mindcli resync \
  --workspace agency_projects \
  --table kanban_cards \
  --batch-size 1000
```

**Implémentation** : scanne la table Layer1 par batches, appelle le trigger
manuellement via `SELECT ws_agency_projects.sync_kanban_cards_to_layers()` ou
fait les inserts Layer2 directement depuis Go avec la même logique que le
trigger.

---

## 7. Phases d'implémentation — PRs détaillées

### PR-01 — Foundation : schema mindbrain + workspace isolation

**Why** : Avant toute autre chose, les tables de contrôle (workspaces,
pending_migrations, query_templates, source_mappings, sync_plans) doivent
exister. Sans elles, aucune autre PR ne peut être testée.

**What** :
- Fichier `migrations/001_mindbrain_foundation.sql`
- Toutes les tables `mindbrain.*` définies en sections 3, 4, 6
- Colonnes `workspace_id` sur `mfo_facets`, `graph.entity`, `graph.relation`
- Index sur `workspace_id`
- Contrainte UNIQUE partielle sur `(source_ref, workspace_id) WHERE source_ref IS NOT NULL` (migration 011)
- `mindbrain.workspaces` pré-peuplé avec workspace `default` (migration des données existantes)

**How** :

```sql
-- migrations/001_mindbrain_foundation.sql
BEGIN;

CREATE SCHEMA IF NOT EXISTS mindbrain;

-- (toutes les CREATE TABLE de ce SOP)

-- Migration des données existantes vers workspace 'default'
INSERT INTO mindbrain.workspaces(id, label, pg_schema, created_by)
VALUES ('default', 'Default Workspace', 'public', 'system')
ON CONFLICT DO NOTHING;

UPDATE mfo_facets    SET workspace_id = 'default' WHERE workspace_id IS NULL;
UPDATE graph.entity  SET workspace_id = 'default' WHERE workspace_id IS NULL;
UPDATE graph.relation SET workspace_id = 'default' WHERE workspace_id IS NULL;

COMMIT;
```

**Tests requis** :
- `INSERT INTO mindbrain.workspaces` avec id invalide → doit échouer la
  contrainte de naming
- Vérification que les données existantes ont `workspace_id = 'default'`

**Fichiers modifiés** :
- `ghostcrab-mcp/migrations/001_mindbrain_foundation.sql` (nouveau)
- `ghostcrab-mcp/internal/db/schema.go` (ajouter les types Go des tables)

---

### PR-02 — GhostCrab MCP : outils workspace + DDL lifecycle

**Why** : C'est le cœur de la V3 — permettre à l'agent de créer des
workspaces et de proposer des DDL sans pouvoir les exécuter directement. La
validation humaine est le garde-fou central.

**What** :
- Outil `ghostcrab_workspace_create`
- Outil `ghostcrab_workspace_list`
- Outil `ghostcrab_ddl_propose` avec génération de preview trigger
- Outil `ghostcrab_ddl_list_pending`
- Outil `ghostcrab_ddl_execute` avec génération et exécution du trigger
- Fonction `GenerateSyncTrigger` (section 5)

**How — ghostcrab_workspace_create** :

```go
// internal/tools/workspace.go

func (s *Server) WorkspaceCreate(ctx context.Context, p WorkspaceCreateParams) (*WorkspaceResult, error) {
    // Validation
    if !regexp.MustCompile(`^[a-z][a-z0-9_]{1,31}$`).MatchString(p.ID) {
        return nil, fmt.Errorf("workspace id must match ^[a-z][a-z0-9_]{1,31}$")
    }
    pgSchema := "ws_" + p.ID

    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil { return nil, err }
    defer tx.Rollback()

    // Créer le schema PostgreSQL
    if _, err := tx.ExecContext(ctx,
        "CREATE SCHEMA IF NOT EXISTS "+pgSchema); err != nil {
        return nil, fmt.Errorf("create schema: %w", err)
    }

    // Insérer dans le registre
    _, err = tx.ExecContext(ctx, `
        INSERT INTO mindbrain.workspaces(id, label, pg_schema, description, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
    `, p.ID, p.Label, pgSchema, p.Description, p.CreatedBy)
    if err != nil { return nil, err }

    tx.Commit()
    return &WorkspaceResult{ID: p.ID, PgSchema: pgSchema, Status: "created"}, nil
}
```

**How — ghostcrab_ddl_propose** :

```go
// internal/tools/ddl.go

func (s *Server) DDLPropose(ctx context.Context, p DDLProposeParams) (*DDLProposeResult, error) {
    // 1. Vérifier que workspace existe
    ws, err := s.getWorkspace(ctx, p.WorkspaceID)
    if err != nil { return nil, err }

    // 2. Parser le SQL (extraction simple du nom de table)
    tableName, err := extractTableName(p.SQL)
    if err != nil { return nil, fmt.Errorf("sql parse: %w", err) }

    // 3. Sécurité : pas de DROP/TRUNCATE/DELETE
    upperSQL := strings.ToUpper(p.SQL)
    for _, kw := range []string{"DROP", "TRUNCATE", "DELETE", "GRANT", "REVOKE"} {
        if strings.Contains(upperSQL, kw) {
            return nil, fmt.Errorf("DDL contains forbidden keyword: %s", kw)
        }
    }

    // 4. Générer le preview du trigger
    tableDef := TableDef{Name: tableName, Schema: ws.PgSchema}
    previewTrigger := GenerateSyncTrigger(ws, tableDef, p.SyncSpec)

    // 5. Insérer la migration en pending
    var migrationID string
    err = s.db.QueryRowContext(ctx, `
        INSERT INTO mindbrain.pending_migrations
          (workspace_id, sql, sync_spec, rationale, preview_trigger, proposed_by)
        VALUES ($1, $2, $3, $4, $5, 'agent')
        RETURNING id::TEXT
    `,
        p.WorkspaceID,
        p.SQL,
        toJSON(p.SyncSpec),
        p.Rationale,
        previewTrigger,
    ).Scan(&migrationID)
    if err != nil { return nil, err }

    return &DDLProposeResult{
        MigrationID:    migrationID,
        Status:         "pending_approval",
        PreviewTrigger: previewTrigger,
        Message:        "Run `mindcli migration approve --id " + migrationID + "` to approve",
    }, nil
}
```

**How — ghostcrab_ddl_execute** :

```go
func (s *Server) DDLExecute(ctx context.Context, p DDLExecuteParams) (*DDLExecuteResult, error) {
    // 1. Charger la migration
    var m PendingMigration
    err := s.db.QueryRowContext(ctx, `
        SELECT id, workspace_id, sql, sync_spec, status, preview_trigger
        FROM mindbrain.pending_migrations WHERE id = $1
    `, p.MigrationID).Scan(&m.ID, &m.WorkspaceID, &m.SQL, &m.SyncSpec, &m.Status, &m.PreviewTrigger)
    if err != nil { return nil, err }

    if m.Status != "approved" {
        return nil, fmt.Errorf("migration %s is not approved (status: %s)", p.MigrationID, m.Status)
    }

    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil { return nil, err }
    defer tx.Rollback()

    // 2. Exécuter le DDL
    if _, err := tx.ExecContext(ctx, m.SQL); err != nil {
        return nil, fmt.Errorf("DDL execution: %w", err)
    }

    // 3. Exécuter le trigger généré
    if _, err := tx.ExecContext(ctx, m.PreviewTrigger); err != nil {
        return nil, fmt.Errorf("trigger creation: %w", err)
    }

    // 4. Update status
    if _, err := tx.ExecContext(ctx, `
        UPDATE mindbrain.pending_migrations
        SET status='executed', executed_at=now()
        WHERE id = $1
    `, p.MigrationID); err != nil {
        return nil, err
    }

    tx.Commit()
    return &DDLExecuteResult{
        MigrationID:  p.MigrationID,
        TableCreated: true,
        TriggerCreated: true,
        Status:       "executed",
    }, nil
}
```

**Tests requis** :
- `WorkspaceCreate` avec id invalide → erreur
- `DDLPropose` avec DROP dans le SQL → erreur
- `DDLPropose` sans workspace existant → erreur
- `DDLExecute` sur migration non-approuvée → erreur
- Cycle complet : propose → approve (mindcli) → execute → vérification trigger

**Fichiers modifiés** :
- `ghostcrab-mcp/internal/tools/workspace.go` (nouveau)
- `ghostcrab-mcp/internal/tools/ddl.go` (nouveau)
- `ghostcrab-mcp/internal/trigger/generator.go` (nouveau)
- `ghostcrab-mcp/server.go` (enregistrement des nouveaux outils)

---

### PR-03 — GhostCrab MCP : proxy query sécurisé

**Why** : L'agent ne doit jamais construire de SQL arbitraire. Tous les accès
en lecture passent par des templates paramétrés. C'est aussi la base sur
laquelle repose `mindcli pg query`.

**What** :
- Outil `ghostcrab_query_facets`
- Outil `ghostcrab_query_graph_neighbors`
- Outil `ghostcrab_query_sql` (templates)
- Outil `ghostcrab_introspect` (appel mindCLI subprocess)

**How — ghostcrab_query_facets** :

```go
func (s *Server) QueryFacets(ctx context.Context, p QueryFacetsParams) (*QueryFacetsResult, error) {
    // Construction sécurisée de la requête — aucun string format avec entrée user
    args := []any{p.WorkspaceID}
    conditions := []string{"workspace_id = $1"}
    argIdx := 2

    if p.SchemaID != "" {
        conditions = append(conditions, fmt.Sprintf("schema_id = $%d", argIdx))
        args = append(args, p.SchemaID)
        argIdx++
    }

    if len(p.Filters) > 0 {
        filtersJSON, _ := json.Marshal(p.Filters)
        conditions = append(conditions, fmt.Sprintf("facets @> $%d", argIdx))
        args = append(args, string(filtersJSON))
        argIdx++
    }

    if p.FullText != "" {
        conditions = append(conditions,
            fmt.Sprintf("to_tsvector('french', content) @@ plainto_tsquery('french', $%d)", argIdx))
        args = append(args, p.FullText)
        argIdx++
    }

    limit := 50
    if p.Limit > 0 && p.Limit <= 500 { limit = p.Limit }

    sql := fmt.Sprintf(`
        SELECT id, schema_id, content, facets, source_ref
        FROM mfo_facets
        WHERE %s
        ORDER BY updated_at DESC
        LIMIT %d OFFSET %d
    `, strings.Join(conditions, " AND "), limit, p.Offset)

    rows, err := s.db.QueryContext(ctx, sql, args...)
    // ... scan et retour
}
```

**How — ghostcrab_introspect** :

```go
func (s *Server) Introspect(ctx context.Context, p IntrospectParams) (*IntrospectResult, error) {
    // Appel à mindCLI comme subprocess sécurisé
    var args []string
    switch p.Source {
    case "odoo":
        args = append([]string{"odoo", "introspect"}, buildOdooArgs(p)...)
    case "gmail":
        args = append([]string{"gmail", "introspect"}, buildGmailArgs(p)...)
    case "recall":
        args = append([]string{"recall", "introspect"}, buildRecallArgs(p)...)
    case "openapi":
        args = append([]string{"adapter", "introspect", "--spec", p.SpecPath}, buildOpenAPIArgs(p)...)
    default:
        return nil, fmt.Errorf("unknown source: %s", p.Source)
    }

    // Timeout de 30s pour l'introspection
    execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
    defer cancel()

    cmd := exec.CommandContext(execCtx, s.config.MindCLIBin, args...)
    cmd.Env = append(os.Environ(), "MINDCLI_OUTPUT_FORMAT=json")

    out, err := cmd.Output()
    if err != nil { return nil, fmt.Errorf("mindcli introspect: %w", err) }

    var result IntrospectResult
    if err := json.Unmarshal(out, &result); err != nil {
        return nil, fmt.Errorf("parse introspect result: %w", err)
    }
    return &result, nil
}
```

**Config à ajouter dans GhostCrab** :

```go
type ServerConfig struct {
    // ... existant
    MindCLIBin     string // chemin vers le binaire mindcli
    MindCLITimeout int    // timeout en secondes (défaut: 30)
}
```

```yaml
# ghostcrab.yaml
mindcli:
  bin: /usr/local/bin/mindcli
  timeout: 30
```

---

### PR-04 — mindCLI : commandes workspace + migration

**Why** : L'approbation des migrations est une action humaine qui passe par le
CLI. Il faut que ces commandes existent avant que le workflow DDL puisse être
testé end-to-end.

**What** :
- `cmd/workspace.go` avec sous-commandes `list`, `create`, `status`
- `cmd/migration.go` avec sous-commandes `list`, `approve`, `reject`,
  `execute`, `preview-trigger`
- Enregistrement dans `cmd/root.go`

**How — migration.go complet** :

```go
// cmd/migration.go
package cmd

import (
    "fmt"
    "github.com/spf13/cobra"
)

var migrationCmd = &cobra.Command{
    Use:   "migration",
    Short: "Manage DDL migrations proposed by agents",
}

var migrationListCmd = &cobra.Command{
    Use:  "list",
    RunE: func(cmd *cobra.Command, args []string) error {
        status, _ := cmd.Flags().GetString("status")
        if status == "" { status = "pending" }

        rows, err := getDB().Query(`
            SELECT id, workspace_id, rationale, proposed_at, status
            FROM mindbrain.pending_migrations
            WHERE status = $1
            ORDER BY proposed_at DESC
        `, status)
        if err != nil { return err }
        defer rows.Close()

        format, _ := cmd.Flags().GetString("format")
        return printMigrations(rows, format)
    },
}

var migrationApproveCmd = &cobra.Command{
    Use:  "approve",
    RunE: func(cmd *cobra.Command, args []string) error {
        id, _  := cmd.Flags().GetString("id")
        by, _  := cmd.Flags().GetString("by")
        if id == "" { return fmt.Errorf("--id required") }
        if by == "" { by = "operator" }

        result, err := getDB().Exec(`
            UPDATE mindbrain.pending_migrations
            SET status = 'approved', approved_by = $2, approved_at = now()
            WHERE id = $1 AND status = 'pending'
        `, id, by)
        if err != nil { return err }

        n, _ := result.RowsAffected()
        if n == 0 {
            return fmt.Errorf("migration %s not found or not in 'pending' status", id)
        }
        fmt.Printf("✓ Migration %s approved by %s\n", id, by)
        fmt.Printf("  Run: mindcli migration execute --id %s\n", id)
        return nil
    },
}

var migrationPreviewTriggerCmd = &cobra.Command{
    Use:  "preview-trigger",
    RunE: func(cmd *cobra.Command, args []string) error {
        id, _ := cmd.Flags().GetString("id")
        var trigger string
        err := getDB().QueryRow(`
            SELECT preview_trigger FROM mindbrain.pending_migrations WHERE id = $1
        `, id).Scan(&trigger)
        if err != nil { return err }
        fmt.Println(trigger)
        return nil
    },
}

func init() {
    migrationListCmd.Flags().String("status", "pending", "Filter by status")
    migrationListCmd.Flags().String("format", "table", "Output format: table|json")
    migrationApproveCmd.Flags().String("id", "", "Migration UUID")
    migrationApproveCmd.Flags().String("by", "", "Approver name")
    migrationPreviewTriggerCmd.Flags().String("id", "", "Migration UUID")

    migrationCmd.AddCommand(migrationListCmd, migrationApproveCmd,
        migrationPreviewTriggerCmd)
    rootCmd.AddCommand(migrationCmd)
}
```

---

### PR-05 — mindCLI : ingest Layer1 + resync

**Why** : La synchronisation bulk est le cas d'usage qui ne peut pas passer
par MCP. C'est la PR qui débouche les flux Odoo → PostgreSQL à volume réel.

**What** :
- Extension de `cmd/odoo.go` : flag `--workspace`, upsert Layer1
- Nouveau fichier `internal/ingest/layer1.go`
- Nouveau `cmd/resync.go`
- Support du `sync_spec` depuis `mindbrain.source_mappings`

**How — internal/ingest/layer1.go** :

```go
package ingest

import (
    "context"
    "database/sql"
    "encoding/json"
    "fmt"
    "strings"
)

type Layer1Ingestor struct {
    DB          *sql.DB
    WorkspaceID string
    PgSchema    string
    TableName   string
    BatchSize   int
}

type FieldMapping struct {
    SourceField  string `json:"source_field"`
    TargetColumn string `json:"target_column"`
    Transform    string `json:"transform"`
}

func (ing *Layer1Ingestor) LoadMapping(ctx context.Context, sourceRef string) ([]FieldMapping, error) {
    var mappingJSON string
    err := ing.DB.QueryRowContext(ctx, `
        SELECT field_map FROM mindbrain.source_mappings
        WHERE workspace_id = $1 AND source_ref = $2
    `, ing.WorkspaceID, sourceRef).Scan(&mappingJSON)
    if err != nil { return nil, fmt.Errorf("mapping not found for %s: %w", sourceRef, err) }

    var mappings []FieldMapping
    return mappings, json.Unmarshal([]byte(mappingJSON), &mappings)
}

func (ing *Layer1Ingestor) UpsertBatch(ctx context.Context, rows []map[string]any, mappings []FieldMapping) (int64, error) {
    if len(rows) == 0 { return 0, nil }

    // Construire les colonnes cibles à partir du mapping
    colSet := map[string]bool{"id": true, "updated_at": true}
    for _, m := range mappings { colSet[m.TargetColumn] = true }

    cols := sortedKeys(colSet)
    var placeholderGroups []string
    var allValues []any
    argIdx := 1

    for _, row := range rows {
        var placeholders []string
        for _, col := range cols {
            placeholders = append(placeholders, fmt.Sprintf("$%d", argIdx))
            allValues = append(allValues, applyMapping(row, col, mappings))
            argIdx++
        }
        placeholderGroups = append(placeholderGroups, "("+strings.Join(placeholders, ", ")+")")
    }

    // Construction de l'UPDATE SET (tous les cols sauf id)
    var updateParts []string
    for _, col := range cols {
        if col != "id" {
            updateParts = append(updateParts, fmt.Sprintf("%s = EXCLUDED.%s", col, col))
        }
    }
    updateParts = append(updateParts, "updated_at = now()")

    upsertSQL := fmt.Sprintf(`
        INSERT INTO %s.%s (%s)
        VALUES %s
        ON CONFLICT (id) DO UPDATE SET %s
    `,
        ing.PgSchema, ing.TableName,
        strings.Join(cols, ", "),
        strings.Join(placeholderGroups, ", "),
        strings.Join(updateParts, ", "),
    )

    result, err := ing.DB.ExecContext(ctx, upsertSQL, allValues...)
    if err != nil { return 0, fmt.Errorf("upsert batch: %w", err) }

    affected, _ := result.RowsAffected()
    return affected, nil
}

// applyMapping transforme une valeur source selon le mapping défini
func applyMapping(row map[string]any, targetCol string, mappings []FieldMapping) any {
    for _, m := range mappings {
        if m.TargetColumn == targetCol {
            val := row[m.SourceField]
            switch m.Transform {
            case "truncate:255":
                if s, ok := val.(string); ok && len(s) > 255 { return s[:255] }
            case "date_iso":
                // conversion date Odoo vers TIMESTAMPTZ
                if s, ok := val.(string); ok { return parseOdooDate(s) }
            }
            return val
        }
    }
    return row[targetCol] // fallback : même nom
}
```

**How — cmd/resync.go** :

```go
// cmd/resync.go
var resyncCmd = &cobra.Command{
    Use:   "resync",
    Short: "Resync Layer2 from existing Layer1 data",
    Long: `Scans Layer1 table and rebuilds Layer2 (mfo_facets + graph.entity).
Use after bulk import without triggers or after trigger recreation.`,
    RunE: func(cmd *cobra.Command, args []string) error {
        workspaceID, _ := cmd.Flags().GetString("workspace")
        tableName, _    := cmd.Flags().GetString("table")
        batchSize, _    := cmd.Flags().GetInt("batch-size")
        if batchSize <= 0 { batchSize = 1000 }

        ws, err := loadWorkspace(workspaceID)
        if err != nil { return err }

        // Appeler la fonction trigger pour chaque row
        // Le trigger a été créé par ghostcrab_ddl_execute
        // On peut le réappeler via: SELECT ws_xxx.sync_yyy_to_layers() pour chaque row
        // Alternative : lire les rows et faire les INSERTs directement en Go

        var offset int
        var totalProcessed int64
        for {
            rows, err := getDB().Query(fmt.Sprintf(`
                SELECT * FROM %s.%s
                ORDER BY id
                LIMIT $1 OFFSET $2
            `, ws.PgSchema, tableName), batchSize, offset)
            if err != nil { return err }

            n, err := resyncBatch(rows, ws, tableName)
            rows.Close()
            if err != nil { return err }
            if n == 0 { break }

            totalProcessed += n
            offset += batchSize
            fmt.Printf("\r  Processed: %d rows", totalProcessed)
        }
        fmt.Printf("\n✓ Resync complete: %d rows\n", totalProcessed)
        return nil
    },
}
```

---

### PR-06 — mindCLI : commandes sync plan + TaskRegistry persistant

**Why** : Le `TaskStatusRegistry` actuel est in-memory — les syncs longs
disparaissent si mindCLI est tué. Pour observer des syncs multi-sources (Odoo
+ Gmail + Recall), l'état doit être persisté en PostgreSQL et interrogeable par
GhostCrab.

**What** :
- `cmd/sync.go` avec sous-commandes `plan`, `run`, `status`
- Migration de `TaskStatusRegistry` vers `mindbrain.sync_runs`
- Nouveau `internal/registry/pg_registry.go`

**How — internal/registry/pg_registry.go** :

```go
package registry

import (
    "context"
    "database/sql"
    "encoding/json"
    "time"

    "github.com/google/uuid"
)

type PgTaskRegistry struct {
    DB *sql.DB
}

type TaskStatus struct {
    ID        string
    PlanID    string
    Status    string    // running, success, partial, failed
    StartedAt time.Time
    FinishedAt *time.Time
    Steps     map[string]StepResult
    Error     string
}

type StepResult struct {
    Rows      int64
    Errors    int
    DurationMs int64
}

func (r *PgTaskRegistry) Start(ctx context.Context, planID string) (string, error) {
    id := uuid.New().String()
    _, err := r.DB.ExecContext(ctx, `
        INSERT INTO mindbrain.sync_runs(id, plan_id, status)
        VALUES ($1, $2, 'running')
    `, id, planID)
    return id, err
}

func (r *PgTaskRegistry) UpdateStep(ctx context.Context, runID, stepName string, result StepResult) error {
    resultJSON, _ := json.Marshal(result)
    _, err := r.DB.ExecContext(ctx, `
        UPDATE mindbrain.sync_runs
        SET steps_result = steps_result || jsonb_build_object($2::TEXT, $3::JSONB)
        WHERE id = $1
    `, runID, stepName, string(resultJSON))
    return err
}

func (r *PgTaskRegistry) Finish(ctx context.Context, runID, status, errMsg string) error {
    _, err := r.DB.ExecContext(ctx, `
        UPDATE mindbrain.sync_runs
        SET status = $2, finished_at = now(), error_msg = $3
        WHERE id = $1
    `, runID, status, errMsg)
    return err
}

func (r *PgTaskRegistry) Get(ctx context.Context, runID string) (*TaskStatus, error) {
    var t TaskStatus
    var stepsJSON string
    var finishedAt sql.NullTime
    err := r.DB.QueryRowContext(ctx, `
        SELECT id, plan_id, status, started_at, finished_at, steps_result, COALESCE(error_msg,'')
        FROM mindbrain.sync_runs WHERE id = $1
    `, runID).Scan(&t.ID, &t.PlanID, &t.Status, &t.StartedAt, &finishedAt, &stepsJSON, &t.Error)
    if err != nil { return nil, err }
    if finishedAt.Valid { t.FinishedAt = &finishedAt.Time }
    json.Unmarshal([]byte(stepsJSON), &t.Steps)
    return &t, nil
}
```

**Nouveau tool GhostCrab : `ghostcrab_sync_status`** :

```go
func (s *Server) SyncStatus(ctx context.Context, p SyncStatusParams) (*SyncStatusResult, error) {
    // Appelle r.Get(ctx, p.RunID) via le PgTaskRegistry
    // Permet à l'agent de monitorer un sync en cours
    t, err := s.registry.Get(ctx, p.RunID)
    if err != nil { return nil, err }
    return &SyncStatusResult{
        RunID:      t.ID,
        Status:     t.Status,
        Steps:      t.Steps,
        StartedAt:  t.StartedAt,
        FinishedAt: t.FinishedAt,
        Error:      t.Error,
    }, nil
}
```

---

### PR-07 — GhostCrab MCP : mapping + projection

**Why** : L'agent doit pouvoir déclarer comment les données source se mappent
vers les tables Layer1, et créer des vues Layer3 cross-workspace pour les
dashboards.

**What** :
- Outil `ghostcrab_mapping_declare`
- Outil `ghostcrab_projection_create`
- Outil `ghostcrab_projection_read`
- Outil `ghostcrab_sync_status`

**How — ghostcrab_mapping_declare** :

```go
func (s *Server) MappingDeclare(ctx context.Context, p MappingDeclareParams) error {
    fieldMapJSON, _ := json.Marshal(p.FieldMap)
    _, err := s.db.ExecContext(ctx, `
        INSERT INTO mindbrain.source_mappings(
            workspace_id, source_ref, target_table, field_map
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (workspace_id, source_ref) DO UPDATE
            SET target_table = EXCLUDED.target_table,
                field_map = EXCLUDED.field_map,
                updated_at = now()
    `, p.WorkspaceID, p.SourceRef, p.TargetTable, string(fieldMapJSON))
    return err
}
```

**Table `mindbrain.source_mappings`** :

```sql
CREATE TABLE mindbrain.source_mappings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES mindbrain.workspaces(id),
  source_ref   TEXT NOT NULL,   -- ex: 'odoo:project.task'
  target_table TEXT NOT NULL,   -- ex: 'ws_agency_projects.kanban_cards'
  field_map    JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, source_ref)
);
```

---

## 8. Workflow complet — Scénario Odoo + Gmail + Recall → Kanban

Ce scénario sert de test d'intégration end-to-end et de documentation vivante.

### Étape 1 — Agent A explore Odoo (via GhostCrab MCP)

```
Agent A → ghostcrab_introspect({
  source: "odoo",
  tables: ["project.task", "project.project", "res.partner"]
})
← IntrospectResult{
  entities: [
    {name: "project.task", fields: [
      {name: "id",          type: "integer",   required: true},
      {name: "name",        type: "string",    required: true},
      {name: "stage_id",    type: "many2one",  fk_to: "project.task.type"},
      {name: "user_ids",    type: "many2many", fk_to: "res.users"},
      {name: "date_deadline", type: "datetime"},
      {name: "description", type: "html"},
      {name: "priority",    type: "selection", values: ["0","1"]},
      {name: "write_date",  type: "datetime",  required: true}
    ]},
    ...
  ]
}
```

### Étape 2 — Agent A crée le workspace

```
Agent A → ghostcrab_workspace_create({
  id: "agency_projects",
  label: "Projets Agence Web",
  description: "Kanban tasks from Odoo + Gmail + Recall"
})
← {workspace_id: "agency_projects", pg_schema: "ws_agency_projects", status: "created"}
```

### Étape 3 — Agent A propose le DDL

```
Agent A → ghostcrab_ddl_propose({
  workspace_id: "agency_projects",
  sql: `
    CREATE TABLE ws_agency_projects.kanban_cards (
      id             BIGINT PRIMARY KEY,
      title          TEXT NOT NULL,
      stage          TEXT,
      assignee_id    INTEGER,
      deadline       TIMESTAMPTZ,
      priority       SMALLINT DEFAULT 0 CHECK (priority IN (0, 1)),
      description    TEXT,
      source_ref     TEXT,        -- 'odoo:project.task:42'
      created_at     TIMESTAMPTZ DEFAULT now(),
      updated_at     TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX idx_kanban_cards_stage ON ws_agency_projects.kanban_cards(stage);
    CREATE INDEX idx_kanban_cards_assignee ON ws_agency_projects.kanban_cards(assignee_id);
  `,
  rationale: "Représente les tâches Odoo en Kanban cards. Stage = stage_id.name. Assignee = user_ids.",
  sync_spec: [
    {column_name: "title",       facet_key: "title",    index_in_bm25: true},
    {column_name: "stage",       facet_key: "stage",    index_in_bm25: false},
    {column_name: "assignee_id", facet_key: "assignee", index_in_bm25: false},
    {column_name: "priority",    facet_key: "priority", index_in_bm25: false},
    {column_name: "description", facet_key: null,       index_in_bm25: true},
    {column_name: "stage",       graph_edge: {
      edge_label: "IN_STAGE", target_table: "ws_agency_projects.stages"
    }}
  ]
})
← {
  migration_id: "a1b2c3d4-...",
  status: "pending_approval",
  preview_trigger: "CREATE OR REPLACE FUNCTION ws_agency_projects.sync_kanban_cards_to_layers()..."
}
```

### Étape 4 — Humain valide (mindCLI)

```bash
# Voir les migrations en attente
$ mindcli migration list
ID                                    WORKSPACE          RATIONALE                    STATUS
a1b2c3d4-...  agency_projects   Représente les tâches Odoo...  pending

# Preview du trigger généré
$ mindcli migration preview-trigger --id a1b2c3d4-...
CREATE OR REPLACE FUNCTION ws_agency_projects.sync_kanban_cards_to_layers()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.mfo_facets(source_ref, content, facets, schema_id, workspace_id, updated_at)
  VALUES (
    'kanban_cards:' || NEW.id::TEXT,
    COALESCE(NEW.title::TEXT, '') || ' ' || COALESCE(NEW.description::TEXT, ''),
    jsonb_build_object('title', NEW.title, 'stage', NEW.stage, 'assignee', NEW.assignee_id, 'priority', NEW.priority),
    'kanban_cards',
    'agency_projects'
  )
  ON CONFLICT (source_ref, workspace_id) WHERE source_ref IS NOT NULL DO UPDATE ...
...

# Approbation
$ ghostcrab maintenance ddl-approve --id a1b2c3d4-... --by francois
✓ Migration a1b2c3d4-... approved by francois
  Run: ghostcrab maintenance ddl-execute --id a1b2c3d4-...

$ ghostcrab maintenance ddl-execute --id a1b2c3d4-...
✓ Table ws_agency_projects.kanban_cards created
✓ Trigger ws_agency_projects.sync_kanban_cards_to_layers created
```

### Étape 5 — Agent A déclare le mapping

```
Agent A → ghostcrab_mapping_declare({
  workspace_id: "agency_projects",
  source_ref: "odoo:project.task",
  target_table: "ws_agency_projects.kanban_cards",
  field_map: [
    {source_field: "id",           target_column: "id",          transform: "identity"},
    {source_field: "name",         target_column: "title",       transform: "truncate:255"},
    {source_field: "stage_id/name",target_column: "stage",       transform: "identity"},
    {source_field: "user_ids/0",   target_column: "assignee_id", transform: "identity"},
    {source_field: "date_deadline",target_column: "deadline",    transform: "date_iso"},
    {source_field: "priority",     target_column: "priority",    transform: "identity"},
    {source_field: "description",  target_column: "description", transform: "identity"}
  ]
})
```

### Étape 6 — mindCLI exécute le sync (déterministe, schedulé)

```bash
# Premier sync complet
$ mindcli odoo ingest \
    --workspace agency_projects \
    --entity project.task \
    --batch-size 500
  Fetching odoo:project.task...
  Batch 1/12: 500 rows → ws_agency_projects.kanban_cards
  ...
  ✓ 5847 rows ingested, 5847 facets synced (via triggers)

# Création du plan de sync récurrent
$ mindcli sync plan --file agency_sync_plan.yaml --workspace agency_projects
✓ Plan 'agency_projects_daily' created

$ mindcli schedule seed  # charge les crons depuis les plans
$ mindcli schedule enable agency_projects_daily
✓ Cron enabled: 0 */6 * * * → mindcli sync run --plan agency_projects_daily
```

### Étape 7 — Agent lit via proxy sécurisé

```
Agent → ghostcrab_query_facets({
  workspace_id: "agency_projects",
  schema_id: "kanban_cards",
  filters: {"stage": "En cours"},
  full_text: "migration odoo",
  limit: 20
})
← [{id, schema_id: "kanban_cards", content: "Migration Odoo vers Tryton...",
    facets: {stage: "En cours", assignee: 5, priority: 1}, source_ref: "kanban_cards:142"}, ...]
```

---

## 9. Conventions de nommage — Référence rapide

| Élément | Convention | Exemple |
|---|---|---|
| Workspace ID | snake_case, max 32 | `agency_projects` |
| PG Schema | `ws_` + workspace_id | `ws_agency_projects` |
| Table Layer1 | snake_case pluriel | `kanban_cards`, `email_threads` |
| Trigger function | `sync_{table}_to_layers` | `sync_kanban_cards_to_layers` |
| Trigger name | `trg_{table}_sync_layers` | `trg_kanban_cards_sync_layers` |
| Source ref (facets) | `{table}:{id}` | `kanban_cards:142` |
| Source ref (mapping) | `{source}:{entity}` | `odoo:project.task` |
| Entity type (graph) | table name | `kanban_cards` |
| Graph edge labels | UPPER_SNAKE_CASE | `IN_STAGE`, `ASSIGNED_TO`, `MIRRORS` |
| Projection key | snake_case | `agency_overview` |
| Template ID | snake_case | `tasks_by_phase` |
| Migration ID | UUID v4 | `a1b2c3d4-5678-...` |

---

## 10. Checklist d'intégration

### Pour une nouvelle source de données

- [ ] `ghostcrab_introspect` retourne le schéma correctement
- [ ] `ghostcrab_workspace_create` crée le workspace et le schema PG
- [ ] `ghostcrab_ddl_propose` génère un preview trigger lisible
- [ ] `ghostcrab maintenance ddl-approve` change le status
- [ ] `ghostcrab maintenance ddl-execute` crée la table ET le trigger
- [ ] INSERT dans la table Layer1 → vérifier row dans `mfo_facets`
- [ ] INSERT dans la table Layer1 → vérifier node dans `graph.entity`
- [ ] `ghostcrab_mapping_declare` stocke le mapping
- [ ] `mindcli {source} ingest --workspace ...` insère les données
- [ ] `mindcli resync --workspace ... --table ...` fonctionne sans erreur
- [ ] `ghostcrab_query_facets` retourne les données avec workspace isolation
- [ ] `ghostcrab_query_graph_neighbors` traverse les edges inter-workspace

### Pour un agent qui modélise une ontologie

- [ ] Agent appelle `ghostcrab_introspect` avant de proposer un DDL
- [ ] DDL inclut au minimum : `id`, `updated_at`, colonnes métier typées
- [ ] `sync_spec` couvre toutes les colonnes à indexer en BM25
- [ ] `sync_spec` inclut les edges graph pour les FK importantes
- [ ] Trigger preview relu par un humain avant `approve`
- [ ] `ghostcrab maintenance ddl-execute` retourne sans erreur
- [ ] Tests : INSERT → check Layer2, UPDATE → check Layer2, resync → pas de doublons

---

## 11. Points d'attention — Pièges d'implémentation

### Unicité de `source_ref` dans `mfo_facets`
Contrat réellement livré:

- `source_ref` peut être `NULL` pour les rows historiques
- le trigger utilise `ON CONFLICT (source_ref, workspace_id) WHERE source_ref IS NOT NULL`
- l'index à vérifier est `mfo_facets_source_ref_workspace_uniq`

Sans cet index partiel, les rows synchronisées peuvent dériver et produire des
doublons par workspace.

### Geo / PostGIS
`ghostcrab_query_geo` est une feature optionnelle. Sur le stack standard sans
PostGIS, l'outil retourne une erreur structurée `geo_feature_not_available`
avec instructions de setup, au lieu d'échouer implicitement.

### Schema PG et search_path
Les fonctions trigger doivent toujours qualifier explicitement les tables :
`public.mfo_facets`, `graph.entity`. Ne jamais dépendre du `search_path` car
il peut différer selon la connexion.

### Transaction du DDLExecute
La création de la table et la création du trigger doivent être dans la MÊME
transaction. Si le trigger échoue après que la table est créée, PostgreSQL
annule tout. Ne pas faire deux transactions séparées.

### mindCLI subprocess timeout
`ghostcrab_introspect` appelle mindCLI en subprocess. Le timeout doit être
configurable et ne pas bloquer le serveur MCP. Utiliser
`context.WithTimeout` et logguer l'erreur clairement si mindCLI est absent.

### Resync et triggers désactivés
`mindcli resync` contourne les triggers en écrivant directement dans Layer2.
Si les triggers sont actifs pendant le resync ET que le resync écrit aussi en
Layer2, cela crée des doubles écritures. Désactiver les triggers pendant le
resync ou vérifier ON CONFLICT idempotent.

### workspace_id dans les edges graph inter-workspace
Un edge `graph.relation` peut relier deux entities de workspaces différents.
La colonne `workspace_id` sur `graph.relation` indique le workspace qui
**possède** la relation, pas les deux nodes. Les nodes source/target ont chacun
leur propre `workspace_id`. Ne pas contraindre src et dst au même workspace.
```

***

Le document est complet. Pour le sauvegarder :

```bash
# Dans votre repo ghostcrab-mcp :
curl -o SOP_GHOSTCRAB_V3.md <url_de_ce_document>
# ou copier-coller le bloc markdown ci-dessus
```

Les 7 PRs couvrent dans l'ordre : fondation schema → DDL lifecycle → proxy query → mindCLI workspace/migration → ingest Layer1 → TaskRegistry persistant → mapping/projection. Chaque PR est indépendante et testable sans attendre les suivantes, à l'exception de PR-03 qui dépend de PR-01 pour les tables `mindbrain.*`.
