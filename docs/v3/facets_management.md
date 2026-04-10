Voici une taxonomie complète des typologies de facettes, organisée par famille, avec les implications spécifiques pour pg_facets et PostgreSQL.

## Types scalaires simples

Les types de base, chaque valeur distincte = un bucket  : [github](https://github.com/OpenRefine/OpenRefine/issues/1662)

| Type | Comportement | Type PG natif |
|---|---|---|
| `string` / `term` | Liste de valeurs distinctes, comptage | `text`, `varchar`, `enum` |
| `boolean` | 2 buckets : true / false | `bool` |
| `integer` | Valeurs discrètes ou buckets rangés | `int2`, `int4`, `int8` |
| `float` | Valeurs continues, nécessite binning | `float4`, `float8`, `numeric` |
| `uuid` | Identifiant opaque, rarement affiché brut | `uuid` |

## Types temporels

La date se décline en plusieurs granularités  : [ibm](https://www.ibm.com/docs/en/wca/3.0.0?topic=application-faceted-search-queries-in-content-analytics-collections)

- `date` — jour calendaire exact
- `datetime` / `timestamp` — précision à la seconde, avec TZ
- `date_range` — intervalle `[from, to]` avec bucket configurable (jour, semaine, mois, trimestre, année) [learn.microsoft](https://learn.microsoft.com/en-us/azure/search/search-faceted-navigation)
- `time_of_day` — tranche horaire (matin/après-midi/soir) — utile pour événements, réservations
- `relative` — "derniers 7 jours", "ce mois" — facette calculée dynamiquement

PostgreSQL dispose des types `daterange`, `tsrange`, `tstzrange` nativement, ce qui est un avantage direct pour pg_facets.

## Types range & histogram

Pour les valeurs continues  : [docs.opensearch](https://docs.opensearch.org/latest/tutorials/faceted-search/)

- `numeric_range` — buckets à gap fixe (ex. prix 0-100, 100-200…) [blog.thedigitalgroup](https://blog.thedigitalgroup.com/faceted-search-using-solr)
- `numeric_range_custom` — buckets à gap variable (ex. \[0-10\], \[10-50\], \[50-500\])
- `histogram` — distribution automatique par percentiles ou déviation standard
- `rating` — cas particulier de float discret (1 à 5 étoiles)

## Types multi-valeurs

Un document peut appartenir à plusieurs buckets simultanément  : [github](https://github.com/OpenRefine/OpenRefine/issues/1662)

- `array` / `set` — ex. tags, catégories multiples → type PG `text[]`, `int[]`
- `enum_multi` — sélection multiple depuis une liste fermée
- `bitset` — variante roaring bitmap (cohérent avec ton usage de pg_facets)

## Types hiérarchiques & taxonomiques

Pour les facettes à plusieurs niveaux  : [queryunderstanding](https://queryunderstanding.com/faceted-search-7d053cc4fada)

- `hierarchy` — arborescence de catégories (Électronique > Téléphones > Android)
- `pivot` — facette croisée sur deux dimensions (ex. catégorie × disponibilité) [solr.apache](https://solr.apache.org/guide/solr/latest/query-guide/faceting.html)
- `path` / `ltree` — chemin matérialisé, type PG `ltree` nativement

## Types géographiques

Présents dans Solr et OpenSearch, pertinents pour l'immobilier  : [solr.apache](https://solr.apache.org/guide/solr/latest/query-guide/faceting.html)

- `geo_distance` — rayon autour d'un point (ex. "dans 10 km")
- `geo_bbox` — bounding box, région rectangulaire
- `geo_cluster` — regroupement spatial par densité

Types PG : `point`, `polygon`, `PostGIS geometry`, `PostGIS geography`.

## Types structurés / sémantiques

Spécifiques à un écosystème comme MindBrain  : [microsoft](https://www.microsoft.com/en-us/research/publication/faceted-search/)

- `jsonb_path` — facette extraite dynamiquement d'un champ JSONB via JSONPath
- `tsvector` / `fulltext` — facette de tokens linguistiques (langue, lemmes)
- `embedding_cluster` — regroupement vectoriel (cohérent avec pg_dgraph)
- `query` — facette calculée par une requête arbitraire, pas par un champ [blog.thedigitalgroup](https://blog.thedigitalgroup.com/faceted-search-using-solr)
- `computed` — valeur dérivée (ex. marge = prix - coût), calculée à l'indexation

## Synthèse pour pg_facets

La nomenclature interne pourrait suivre cette hiérarchie :

```
FacetType
├── scalar       → term, boolean, integer, float, uuid
├── temporal     → date, datetime, date_range, time_of_day, relative
├── range        → numeric_range, numeric_range_custom, histogram, rating
├── multi        → array, enum_multi, bitset
├── hierarchical → hierarchy, pivot, path
├── geo          → geo_distance, geo_bbox, geo_cluster
└── computed     → jsonb_path, fulltext, embedding_cluster, query
```

La frontière clé à modéliser dans pg_facets est entre **types indexés à l'écriture** (term, array, hierarchy → pré-agrégés en bitmaps) et **types calculés à la lecture** (range, histogram, query → agrégation dynamique SQL). Les deux ont des profils de performance très différents sur PostgreSQL.

Bonne question de validation — analysons type par type sans chercher d'informations externes, c'est un exercice d'analyse pure sur l'architecture.

***

## Verdict global

L'architecture 3-layer **tient structurellement** pour toutes les familles. Mais l'implémentation actuelle du SOP a **6 gaps précis** — tous additifs, aucun ne remet en cause le modèle. Voici le détail.

***

## Ce qui passe sans aménagement

### Scalaires simples
`term`, `boolean`, `integer`, `uuid` → trigger génère `jsonb_build_object('status', NEW.status)`, le query proxy fait `facets @> $filter`. Roaring bitmaps de pg_facets indexent les valeurs discrètes. ✅

### Fulltext / tsvector
Déjà couvert par le champ `content` + `index_in_bm25: true` dans sync_spec. ✅

### Rating
Float discret 1–5 → se comporte comme un `integer`, bucket term. ✅

### `jsonb_path`
Extractable dans le trigger avec `jsonb_path_query_first(NEW.metadata, '$.author.id')`. Il suffit d'ajouter `transform: "jsonpath:$.field.path"` dans sync_spec. ✅ avec extension mineure.

### `computed`
Valeur dérivée calculable dans le trigger (`NEW.prix - NEW.cout`). Déjà faisable avec `transform: "computed:..."` dans sync_spec. ✅

### `query` dynamique et histogrammes
Ces deux types ne peuvent pas être pré-indexés par définition. Ils appartiennent au **Layer 3** (projections matérialisées) ou aux `query_templates`. Le SOP a déjà `ghostcrab_projection_create` et `query_templates` — c'est le bon endroit. ✅ conceptuellement, manque juste la documentation explicite de cette frontière.

***

## Les 6 gaps à corriger

### Gap 1 — `sync_spec` manque un champ `facet_type`

**Problème** : le trigger generator actuel traite tous les types de la même façon (valeur scalaire → JSONB). Mais `array`, `ltree`, `float`, `temporal_range`, `geo` ont des comportements de stockage et de requête différents.

**Aménagement** : ajouter `facet_type` à `SyncFieldSpec` :

```go
type SyncFieldSpec struct {
    ColumnName  string      `json:"column_name"`
    FacetKey    string      `json:"facet_key"`
    FacetType   string      `json:"facet_type"` // NOUVEAU
    // "term"|"boolean"|"integer"|"float"|"array"|"ltree"
    // |"temporal"|"temporal_range"|"geo"|"jsonpath"|"computed"|"embedding"
    IndexInBM25 bool        `json:"index_in_bm25"`
    Transform   string      `json:"transform,omitempty"`
    GraphEdge   *GraphEdgeSpec `json:"graph_edge,omitempty"`
}
```

Ce champ pilote **deux comportements distincts** dans `GenerateSyncTrigger` :
- comment stocker la valeur dans Layer 2
- quel opérateur utiliser dans le query proxy

***

### Gap 2 — Types `array` / `set` : unnesting incorrectement géré

**Problème** : `jsonb_build_object('tags', NEW.tags)` stocke `{"tags": ["Go", "PG"]}`. La requête `facets @> '{"tags": "Go"}'` échoue — il faut `facets->'tags' ? 'Go'`.

**Aménagement** : le trigger generator, quand `facet_type = "array"`, utilise `to_jsonb(NEW.tags)` et le query proxy switche vers l'opérateur `?` :

```go
// Dans GenerateSyncTrigger — cas array
// Stockage
"to_jsonb(NEW." + f.ColumnName + ")"  // → ["Go", "PG", "AI"]

// Dans ghostcrab_query_facets — cas array
// Filter :  facets -> 'tags' ? $value
// au lieu de : facets @> $jsonb
```

Pour pg_facets et les roaring bitmaps, chaque élément du array doit être enregistré comme une entrée bitmap distincte — cela implique que le trigger fasse un **unnest** dans `mfo_facets` si pg_facets indexe au niveau row :

```sql
-- trigger pour type array : une row facets par élément
INSERT INTO mfo_facets(source_ref, content, facets, schema_id, workspace_id)
SELECT
  'kanban_cards:' || NEW.id::TEXT || ':tag:' || t,
  t,
  jsonb_build_object('tag', t),
  'kanban_cards_tag',
  'agency_projects'
FROM unnest(NEW.tags) t
ON CONFLICT (source_ref) DO UPDATE SET facets = EXCLUDED.facets;
```

***

### Gap 3 — Types `ltree` / hiérarchiques : expansion des ancêtres manquante

**Problème** : stocker `Electronique.Telephones.Android` comme valeur unique dans `facets` ne permet pas de filtrer sur `Electronique` (ancêtre). Il faut indexer tous les sous-chemins.

**Aménagement** : le trigger generator, quand `facet_type = "ltree"`, génère l'expansion :

```sql
-- trigger ltree : insert un row facet par niveau de la hiérarchie
INSERT INTO mfo_facets(source_ref, facets, schema_id, workspace_id)
SELECT
  'products:' || NEW.id::TEXT || ':cat:' || level,
  jsonb_build_object('category_path', level::TEXT, 'category_depth', nlevel(level::ltree)),
  'products_category',
  ws_id
FROM (
  SELECT subpath(NEW.category_path, 0, generate_series(1, nlevel(NEW.category_path)))::text AS level
) sub
ON CONFLICT (source_ref) DO UPDATE SET facets = EXCLUDED.facets;
```

Le query proxy pour `ltree` utilise `facets->>'category_path' ~ $lquery` (matching ltree) ou une jointure sur Layer 1 directement via un query_template.

***

### Gap 4 — Types géographiques : JSONB est insuffisant

**Problème** : `ST_DWithin(geom, center, radius)` nécessite le type `GEOMETRY` natif PostGIS. Stocker des coordonnées dans `facets JSONB` comme `{"lat": 50.8, "lng": 4.3}` et faire du spatial filtering dessus est structurellement impossible via l'opérateur `@>`.

C'est le gap le plus significatif — il nécessite une **table Layer 2 spécialisée** :

```sql
-- Table supplémentaire Layer 2 pour les facettes géographiques
CREATE TABLE public.geo_entities (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ref   TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    schema_id    TEXT NOT NULL,
    geom         GEOMETRY(POINT, 4326),  -- ou GEOMETRY généralisé
    bbox         GEOMETRY(POLYGON, 4326),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (source_ref)
);

CREATE INDEX idx_geo_entities_geom ON geo_entities USING GIST(geom);
CREATE INDEX idx_geo_entities_ws ON geo_entities(workspace_id);
```

Le trigger generator, quand `facet_type = "geo"`, génère un INSERT dans `geo_entities` plutôt que dans `mfo_facets`.

Et un nouvel outil MCP correspondant :

```go
// ghostcrab_query_geo (nouveau)
type QueryGeoParams struct {
    WorkspaceID string  `json:"workspace_id"`
    SchemaID    string  `json:"schema_id,omitempty"`
    CenterLat   float64 `json:"center_lat"`
    CenterLng   float64 `json:"center_lng"`
    RadiusMeters float64 `json:"radius_meters"`
}
// WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_Point($lng,$lat),4326)::geography, $radius)
```

***

### Gap 5 — Types temporels dynamiques : le query proxy fait du match exact

**Problème** : `ghostcrab_query_facets` fait `facets @> $filter` (match exact JSONB). Pour filtrer `deadline BETWEEN '2026-01-01' AND '2026-03-31'`, ce n'est pas un match exact, c'est un range sur une valeur temporelle stockée en JSONB.

**Aménagement** : deux modes distincts dans le query proxy :

```go
type QueryFacetsParams struct {
    // ... existant
    TemporalFilters []TemporalFilter `json:"temporal_filters,omitempty"` // NOUVEAU
}

type TemporalFilter struct {
    FacetKey string `json:"facet_key"`   // ex: "deadline"
    From     string `json:"from,omitempty"` // ISO8601
    To       string `json:"to,omitempty"`
    Relative string `json:"relative,omitempty"` // "last_7_days", "this_month"
}
```

Pour `relative`, la résolution se fait côté Go avant d'appeler PostgreSQL :

```go
func resolveRelative(r string) (from, to time.Time) {
    now := time.Now()
    switch r {
    case "last_7_days":  return now.AddDate(0,0,-7), now
    case "this_month":   return time.Date(now.Year(), now.Month(), 1, 0,0,0,0, now.Location()), now
    case "this_quarter": // ...
    }
}
```

La requête générée :
```sql
AND (facets->>'deadline')::TIMESTAMPTZ BETWEEN $from AND $to
```

Les facettes `date_range` de Layer 1 (colonnes `tstzrange` nativement) sont requêtées via `query_templates` qui utilisent l'opérateur `&&` de PostgreSQL :
```sql
WHERE validity_range && tstzrange($from::TIMESTAMPTZ, $to::TIMESTAMPTZ)
```

***

### Gap 6 — Embeddings / `embedding_cluster` : non couvert

**Problème** : les vecteurs (pgvector `vector(1536)`) ne peuvent pas être stockés dans `mfo_facets.facets JSONB` — trop volumineux, pas d'opérateur vectoriel sur JSONB.

**Aménagement** : table Layer 2 spécialisée (analogue au Gap 4) :

```sql
CREATE TABLE public.embedding_vectors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_ref   TEXT NOT NULL UNIQUE,
    workspace_id TEXT NOT NULL,
    schema_id    TEXT NOT NULL,
    embedding    vector(1536),
    model_id     TEXT,         -- ex: 'text-embedding-3-small'
    updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_embedding_vectors_ivfflat
    ON embedding_vectors USING ivfflat(embedding vector_cosine_ops)
    WITH (lists = 100);
```

L'embedding n'est pas généré par le trigger (le trigger ne fait pas d'appel API) — il est produit par mindCLI lors de l'ingestion :

```bash
mindcli ingest --workspace agency_projects --entity kanban_cards \
  --embed-column description --embed-model text-embedding-3-small
```

Le tool GhostCrab correspondant serait `ghostcrab_query_similar` (recherche par proximité vectorielle, délégant à pg_dgraph).

***

## Tableau de synthèse

| Famille | Status SOP actuel | Gap | Type d'aménagement |
|---|---|---|---|
| Scalaires (term, bool, int, uuid) | ✅ | — | — |
| Float | ⚠️ | Pas de binning query-side | Query proxy : range filter |
| Temporels (date, datetime) | ✅ | — | — |
| Temporal range / relative | ⚠️ | Pas de range filter | Query proxy : `TemporalFilter` |
| Range / histogram | ✅ | Layer 3 (déjà) | Documentation de la frontière |
| Array / set | ❌ | Opérateur JSONB incorrect + unnest | Trigger + query proxy |
| LTree / hiérarchie | ❌ | Pas d'expansion des ancêtres | Trigger generator |
| Pivot | ✅ | Layer 3 projection | — |
| Géographique | ❌ | JSONB ne supporte pas PostGIS | Table `geo_entities` + tool |
| jsonb_path / computed | ✅ | Extension sync_spec | Mineure |
| Fulltext / tsvector | ✅ | — | — |
| Embedding cluster | ❌ | Pas de table vectorielle | Table `embedding_vectors` + mindCLI |

**Aucun gap ne remet en cause le modèle 3-layer.** Tous sont des extensions additives de `GenerateSyncTrigger`, du query proxy, et de deux tables Layer 2 spécialisées (`geo_entities`, `embedding_vectors`). Le PR-02 (trigger generator) et le PR-03 (query proxy) du SOP absorbent tous ces aménagements — il faut juste les étendre avant de les merger.