import type { SyncFieldSpec } from "../types/facets.js";

export interface TriggerGeneratorOptions {
  /**
   * Fully-qualified source table name (e.g. "public.articles").
   * The trigger is attached to this table.
   */
  sourceTable: string;
  /**
   * Workspace id written to facets.workspace_id for every synced row.
   * Must already exist in mindbrain.workspaces (migration 009).
   */
  workspaceId: string;
  /**
   * Fields to sync. "embedding" fields are silently skipped (mindCLI pipeline).
   */
  fields: SyncFieldSpec[];
  /**
   * Column on the source table used as the primary key for source_ref construction.
   * Defaults to "id". Must be castable to TEXT.
   */
  sourcePrimaryKeyColumn?: string;
  /**
   * Value written to facets.schema_id for scalar/array/ltree synced rows.
   * Defaults to TG_TABLE_NAME (the source table name without schema prefix).
   * Pass an explicit schema_id when the MCP schema is different from the table name.
   */
  targetSchemaId?: string;
}

export interface GeneratedTriggerSQL {
  triggerName: string;
  functionName: string;
  sql: string;
  /** Human-readable summary of what the trigger does, for DDL proposal review. */
  summary: string;
}

/**
 * Dangerous patterns for **agent/user-proposed DDL** (CREATE TABLE, ALTER, …).
 * Must not match legitimate server-generated sync-trigger SQL (DROP TRIGGER,
 * DELETE in trigger body, CREATE OR REPLACE FUNCTION, EXECUTE FUNCTION, …).
 */
const USER_DDL_BLOCKED_PATTERNS = [
  /\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\b\s+FROM\b/i,
  /\bALTER\s+TABLE\b.*\bDROP\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  // Superuser RCE / dangerous primitives
  /\bCOPY\b[\s\S]*\bPROGRAM\b/i,
  /\bDO\s+\$/i,
  /\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i,
  // Dynamic EXECUTE in PL/pgSQL — not trigger `EXECUTE FUNCTION`
  /\bEXECUTE\b(?!\s+FUNCTION\b)/i,
  /\bpg_read_file\b/i,
  /\bpg_ls_dir\b/i,
  /\bpg_execute\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\bCREATE\s+EXTENSION\b/i,
  /\bLOAD\b\s+['$]/i,
  /\bpg_reload_conf\b/i,
  /\bpg_terminate_backend\b/i
];

/**
 * RCE-focused patterns for **generated** sync-trigger SQL only.
 * Omits DROP/DELETE/CREATE FUNCTION / EXECUTE FUNCTION, which the template uses legitimately.
 */
const GENERATED_TRIGGER_BLOCKED_PATTERNS = [
  /\bCOPY\b[\s\S]*\bPROGRAM\b/i,
  /\bDO\s+\$/i,
  /\bEXECUTE\b(?!\s+FUNCTION\b)/i,
  /\bpg_read_file\b/i,
  /\bpg_ls_dir\b/i,
  /\bpg_execute\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\bCREATE\s+EXTENSION\b/i,
  /\bLOAD\b\s+['$]/i,
  /\bpg_reload_conf\b/i,
  /\bpg_terminate_backend\b/i
];

function validateAgainstPatterns(
  sql: string,
  patterns: RegExp[]
): string | null {
  for (const pattern of patterns) {
    if (pattern.test(sql)) {
      const matched = pattern.exec(sql);
      return `Blocked DDL pattern detected: '${matched?.[0] ?? pattern.source}'`;
    }
  }
  return null;
}

/**
 * Validate agent/user-proposed DDL SQL. Returns the first violation found, or null if safe.
 */
export function validateProposedSql(sql: string): string | null {
  return validateAgainstPatterns(sql, USER_DDL_BLOCKED_PATTERNS);
}

/**
 * Validate server-generated sync-trigger SQL (stricter on RCE only; allows DROP TRIGGER, etc.).
 */
export function validateGeneratedSyncTriggerSql(sql: string): string | null {
  return validateAgainstPatterns(sql, GENERATED_TRIGGER_BLOCKED_PATTERNS);
}

/**
 * Apply a transform expression to a column reference.
 * The transform string uses `$value` as the placeholder for the column expression.
 * Example: transform = "lower($value)" → "lower(NEW.title)"
 *
 * If no transform is specified, returns the raw column expression unchanged.
 */
function applyTransform(columnExpr: string, transform?: string): string {
  if (!transform) return columnExpr;
  return transform.replace(/\$value/g, columnExpr);
}

const SCALAR_FACET_TYPES = new Set([
  "term", "boolean", "integer", "float",
  "temporal", "temporal_range", "jsonpath", "computed"
]);

/**
 * Generate a PostgreSQL trigger function + trigger that syncs rows from a Layer 1
 * source table into Layer 2 (facets) based on a SyncFieldSpec array.
 *
 * ## Contract (migration 011 required)
 *
 * facets is expected to have:
 *   - source_ref TEXT (nullable)      — set by this trigger, NULL for manual facts
 *   - workspace_id TEXT NOT NULL       — set by this trigger to options.workspaceId
 *   - UNIQUE partial index on (source_ref, workspace_id) WHERE source_ref IS NOT NULL
 *
 * ## Hypotheses
 *
 * - The source table has a primary key column (default: "id") castable to TEXT.
 * - For "array" fields: the column type must be a PostgreSQL array (TEXT[], etc.).
 * - For "ltree" fields: the column type must be ltree (requires pg_ltree extension).
 * - For "geo" fields: geo_entities table must exist (migration 010 + PostGIS).
 * - For "embedding" fields: skipped entirely (handled by mindCLI).
 *
 * ## SyncFieldSpec usage
 *
 * - `index_in_bm25`: when true, the field's value is included in the `content` column
 *   (which feeds the BM25 tsvector). When false, the field is still synced into `facets`
 *   JSONB but excluded from full-text search content.
 * - `transform`: optional SQL expression applied to the column value before writing into
 *   `facets`. Uses `$value` as placeholder for the column reference.
 *   Example: `"lower($value)"` produces `lower(NEW.title)`.
 *
 * ## facet_type semantics
 *
 * - Scalar types ("term" / "boolean" / "integer" / "float" / "temporal" /
 *   "temporal_range" / "jsonpath" / "computed"):
 *   All scalar fields from the same source row are merged into a **single INSERT**
 *   with a combined `jsonb_build_object(...)` and a `concat_ws(' ', ...)` built
 *   only from fields with `index_in_bm25 = true`.
 * - "array" → unnest() each element into a separate facets row,
 *   source_ref = "<pk>:<facet_key>:<element_ordinal>".
 * - "ltree" → expand ancestors via generate_series + subpath, one row per level,
 *   source_ref = "<pk>:<facet_key>:<level>".
 * - "geo" → INSERT/UPDATE into geo_entities (not facets).
 * - "embedding" → skipped.
 */
export function generateSyncTrigger(
  options: TriggerGeneratorOptions
): GeneratedTriggerSQL {
  const {
    sourceTable,
    workspaceId,
    fields,
    sourcePrimaryKeyColumn = "id",
    targetSchemaId
  } = options;

  const safeTableName = sourceTable.replace(/[^a-zA-Z0-9_.]/g, "_");
  const safeFunctionBase = safeTableName.replace(/\./g, "_");
  const functionName = `mindbrain_sync_${safeFunctionBase}`;
  const triggerName = `trg_mindbrain_sync_${safeFunctionBase}`;

  const schemaIdExpr = targetSchemaId
    ? `'${targetSchemaId}'`
    : "TG_TABLE_NAME";

  const scalarFields: SyncFieldSpec[] = [];
  const insertBlocks: string[] = [];
  const summaryParts: string[] = [];
  let hasGeoField = false;

  for (const field of fields) {
    const facetType = field.facet_type ?? "term";

    if (facetType === "embedding") {
      summaryParts.push(`${field.facet_key} (embedding — skipped, mindCLI)`);
      continue;
    }

    if (facetType === "geo") {
      hasGeoField = true;
      insertBlocks.push(buildGeoInsert(field, workspaceId, sourcePrimaryKeyColumn));
      summaryParts.push(`${field.facet_key} (geo → geo_entities)`);
      continue;
    }

    if (facetType === "array") {
      insertBlocks.push(buildArrayInsert(field, workspaceId, sourcePrimaryKeyColumn, schemaIdExpr));
      summaryParts.push(`${field.facet_key} (array → unnest)`);
      continue;
    }

    if (facetType === "ltree") {
      insertBlocks.push(buildLtreeInsert(field, workspaceId, sourcePrimaryKeyColumn, schemaIdExpr));
      summaryParts.push(`${field.facet_key} (ltree → ancestor expansion)`);
      continue;
    }

    if (SCALAR_FACET_TYPES.has(facetType)) {
      scalarFields.push(field);
      const bm25Tag = field.index_in_bm25 ? ", bm25" : "";
      const transformTag = field.transform ? `, transform: ${field.transform}` : "";
      summaryParts.push(`${field.facet_key} (${facetType} → scalar${bm25Tag}${transformTag})`);
    }
  }

  if (scalarFields.length > 0) {
    insertBlocks.unshift(
      buildMergedScalarInsert(scalarFields, workspaceId, sourcePrimaryKeyColumn, schemaIdExpr)
    );
  }

  const functionBody = insertBlocks.length > 0
    ? insertBlocks.join("\n\n")
    : "  -- no fields to sync";

  const sql = `
CREATE OR REPLACE FUNCTION ${functionName}()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- DELETE: remove all synced rows originating from this source row.
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM facets
    WHERE source_ref LIKE OLD.${sourcePrimaryKeyColumn}::text || '%'
      AND workspace_id = '${workspaceId}'
      AND source_ref IS NOT NULL;
${hasGeoField ? `    IF to_regclass('public.geo_entities') IS NOT NULL THEN
      DELETE FROM geo_entities
      WHERE source_ref = OLD.${sourcePrimaryKeyColumn}::text
        AND workspace_id = '${workspaceId}';
    END IF;
` : ""}
    RETURN OLD;
  END IF;

  -- INSERT / UPDATE: upsert fields into facets (or geo_entities for geo fields).
${functionBody}

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ${triggerName} ON ${safeTableName};

CREATE TRIGGER ${triggerName}
AFTER INSERT OR UPDATE OR DELETE ON ${safeTableName}
FOR EACH ROW EXECUTE FUNCTION ${functionName}();
`.trim();

  const summary = `Trigger ${triggerName} on ${safeTableName} → workspace '${workspaceId}'. Fields: ${summaryParts.join(", ") || "none"}.`;

  return { triggerName, functionName, sql, summary };
}

/**
 * Merged scalar upsert: all scalar fields produce ONE facets row per source row.
 *
 * - `facets` is built via jsonb_build_object with all scalar fields (transform applied).
 * - `content` is built via concat_ws only from fields with index_in_bm25 = true.
 *   If no field has index_in_bm25, content is '' (empty — no BM25 pollution).
 */
function buildMergedScalarInsert(
  scalarFields: SyncFieldSpec[],
  workspaceId: string,
  pkCol: string,
  schemaIdExpr: string
): string {
  const facetPairs = scalarFields.map((f) => {
    const valExpr = applyTransform(`NEW.${f.column_name}`, f.transform);
    return `'${f.facet_key}', ${valExpr}`;
  });

  const facetsExpr = `jsonb_build_object(${facetPairs.join(", ")})`;

  const bm25Fields = scalarFields.filter((f) => f.index_in_bm25);
  const contentExpr = bm25Fields.length > 0
    ? `concat_ws(' ', ${bm25Fields.map((f) => {
        const valExpr = applyTransform(`NEW.${f.column_name}`, f.transform);
        return `COALESCE(${valExpr}::text, '')`;
      }).join(", ")})`
    : "''";

  const fieldNames = scalarFields.map((f) => f.facet_key).join(", ");

  return `  -- scalar fields merged: ${fieldNames}
  INSERT INTO facets (source_ref, workspace_id, schema_id, facets, content)
  VALUES (
    NEW.${pkCol}::text,
    '${workspaceId}',
    ${schemaIdExpr},
    ${facetsExpr},
    ${contentExpr}
  )
  ON CONFLICT (source_ref, workspace_id) WHERE source_ref IS NOT NULL DO UPDATE SET
    facets    = facets.facets || ${facetsExpr},
    content   = ${contentExpr},
    schema_id = ${schemaIdExpr};`;
}

/**
 * Array upsert: delete old element rows, then re-insert via unnest.
 * source_ref = "<pk>:<facet_key>:<ordinal>" ensures uniqueness per element.
 * content gated by index_in_bm25; transform applied to each element value.
 */
function buildArrayInsert(
  field: SyncFieldSpec,
  workspaceId: string,
  pkCol: string,
  schemaIdExpr: string
): string {
  const valExpr = applyTransform("elem_val", field.transform);
  const contentExpr = field.index_in_bm25
    ? `${valExpr}::text`
    : "''";

  return `  -- ${field.facet_key}: array → delete + unnest re-insert
  DELETE FROM facets
  WHERE source_ref LIKE NEW.${pkCol}::text || ':${field.facet_key}:%'
    AND workspace_id = '${workspaceId}'
    AND source_ref IS NOT NULL;
  INSERT INTO facets (source_ref, workspace_id, schema_id, facets, content)
  SELECT
    NEW.${pkCol}::text || ':${field.facet_key}:' || elem_idx::text,
    '${workspaceId}',
    ${schemaIdExpr},
    jsonb_build_object('${field.facet_key}', ${valExpr}),
    ${contentExpr}
  FROM unnest(NEW.${field.column_name}) WITH ORDINALITY AS t(elem_val, elem_idx)
  WHERE elem_val IS NOT NULL;`;
}

/**
 * Ltree upsert: delete old ancestor rows, then re-insert one row per ltree level.
 * source_ref = "<pk>:<facet_key>:<level>" ensures uniqueness per ancestor path.
 * content gated by index_in_bm25.
 */
function buildLtreeInsert(
  field: SyncFieldSpec,
  workspaceId: string,
  pkCol: string,
  schemaIdExpr: string
): string {
  const pathExpr = `subpath(NEW.${field.column_name}, 0, level)::text`;
  const contentExpr = field.index_in_bm25
    ? pathExpr
    : "''";

  return `  -- ${field.facet_key}: ltree → delete + ancestor expansion
  DELETE FROM facets
  WHERE source_ref LIKE NEW.${pkCol}::text || ':${field.facet_key}:%'
    AND workspace_id = '${workspaceId}'
    AND source_ref IS NOT NULL;
  INSERT INTO facets (source_ref, workspace_id, schema_id, facets, content)
  SELECT
    NEW.${pkCol}::text || ':${field.facet_key}:' || level::text,
    '${workspaceId}',
    ${schemaIdExpr},
    jsonb_build_object('${field.facet_key}', ${pathExpr}),
    ${contentExpr}
  FROM generate_series(1, nlevel(NEW.${field.column_name})) AS level
  WHERE NEW.${field.column_name} IS NOT NULL;`;
}

/**
 * Geo upsert: routes into geo_entities (migration 010 + PostGIS required).
 * Falls back silently when geo_entities does not exist.
 */
function buildGeoInsert(
  field: SyncFieldSpec,
  workspaceId: string,
  pkCol: string
): string {
  return `  -- ${field.facet_key}: geo → upsert into geo_entities (PostGIS required)
  IF to_regclass('public.geo_entities') IS NOT NULL THEN
    INSERT INTO geo_entities (source_ref, workspace_id, schema_id, geom)
    VALUES (
      NEW.${pkCol}::text,
      '${workspaceId}',
      TG_TABLE_NAME,
      NEW.${field.column_name}
    )
    ON CONFLICT (source_ref, workspace_id) DO UPDATE SET
      geom      = EXCLUDED.geom,
      schema_id = EXCLUDED.schema_id;
  END IF;`;
}
