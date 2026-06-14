#!/usr/bin/env node
/**
 * Audit GhostCrab projections, answer artifacts, and graph quality (SQLite).
 * Port of starterkit/scripts/audit_ghostcrab_projections.py for immeuble lab.
 *
 * Usage:
 *   node audit-ghostcrab-projections.mjs \
 *     --db /path/to/immeuble.sqlite \
 *     --workspace immeuble \
 *     --model ../../contracts/model_contract.json \
 *     --answer-artifacts-seed ../../contracts/answer_artifacts.seed.jsonl \
 *     [--output-dir ../../reports] \
 *     [--strict]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildObservedFacetIndex,
  edgeIsObserved,
  missingRequiredFacets,
  normalizeEdgeType
} from "./facet-prefix.mjs";
import {
  dtFromUnix,
  parseArgs,
  parseFlag,
  parseJsonMaybe,
  sqliteQuery,
  sqliteTableColumns,
  sqliteTableExists,
  workspaceWhere
} from "./sqlite-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const immeubleRoot = resolve(scriptDir, "..", "..");

const args = parseArgs(process.argv.slice(2));
const dbPath = resolve(parseFlag(args, "db", join(immeubleRoot, "..", "..", "..", "data", "immeuble-lab.sqlite")));
const workspaceId = parseFlag(args, "workspace", "immeuble") || null;
const modelPath = parseFlag(args, "model", join(immeubleRoot, "contracts", "model_contract.json"));
const seedPath = parseFlag(args, "answer-artifacts-seed", join(immeubleRoot, "contracts", "answer_artifacts.seed.jsonl"));
const outputDir = resolve(parseFlag(args, "output-dir", join(immeubleRoot, "reports")));
const strict = args.strict === "true";

function loadModelContract(path) {
  if (!path) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function loadPlannedProjections(model, ws) {
  if (!model || !model.projections) return [];
  const workspace = ws || model.workspace_id || "";
  const projections = model.projections;
  const planned = [];

  if (Array.isArray(projections)) {
    for (const value of projections) {
      if (!value || typeof value !== "object") continue;
      const name = value.name || value.label || "projection";
      const scope = value.scope || `${workspace}:catalog:${name}`;
      planned.push({
        workspace_id: workspace,
        ontology: scope.split(":")[1] ?? "catalog",
        name,
        expected_scope: scope,
        label: value.label || name,
        business_question: value.business_question || "",
        required_schemas: value.required_schemas || [],
        required_facets: value.required_facets || [],
        required_edges: value.required_edges || []
      });
    }
    return planned;
  }

  if (typeof projections === "object") {
    for (const [name, value] of Object.entries(projections)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const scope = value.scope || `${workspace}:projection:${name}`;
        planned.push({
          workspace_id: workspace,
          ontology: scope.startsWith(`${workspace}:`) ? scope.split(":")[1] : "projection",
          name,
          expected_scope: scope,
          label: value.label || name,
          business_question: value.business_question || "",
          required_schemas: value.required_schemas || [],
          required_facets: value.required_facets || [],
          required_edges: value.required_edges || []
        });
      } else if (Array.isArray(value)) {
        for (const item of value) {
          planned.push({
            workspace_id: workspace,
            ontology: name,
            name: String(item),
            expected_scope: `${workspace}:${name}:${item}`,
            label: String(item),
            business_question: "",
            required_schemas: [],
            required_facets: [],
            required_edges: []
          });
        }
      }
    }
  }
  return planned;
}

function loadPlannedLiveViews(path, ws) {
  if (!path) return [];
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const planned = [];
  for (const [lineNo, line] of text.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    try {
      const item = JSON.parse(trimmed);
      const artifact = item.artifact ?? item;
      const kind = artifact.artifact_kind || "live_answer_view";
      if (kind !== "live_answer_view") continue;
      const slug = artifact.slug || (artifact.artifact_id || "").split("__").pop() || `seed_${lineNo + 1}`;
      const artifactId = artifact.artifact_id || `live_answer_view__${slug}`;
      planned.push({
        artifact_id: artifactId,
        slug,
        workspace_id: artifact.workspace_id || ws || "",
        public_label: artifact.public_label || slug,
        scope: artifact.scope || ""
      });
    } catch {
      // skip invalid lines
    }
  }
  return planned;
}

function fetchSqlite(dbPath, workspaceId) {
  if (!existsSync(dbPath)) {
    return { backend: "sqlite", available: false, error: `SQLite database not found: ${dbPath}` };
  }

  let projectionTypes = [];
  if (sqliteTableExists(dbPath, "projection_types")) {
    projectionTypes = sqliteQuery(
      dbPath,
      `SELECT type_name, compatibility_aliases, rank_bias, pack_priority, next_hop_multiplier, structured
       FROM projection_types ORDER BY pack_priority, type_name`
    );
  }

  let projectionRows = [];
  if (sqliteTableExists(dbPath, "projections")) {
    let where = "";
    if (workspaceId) {
      where = `WHERE scope = '${workspaceId.replace(/'/g, "''")}' OR scope LIKE '${workspaceId.replace(/'/g, "''")}:%'`;
    }
    projectionRows = sqliteQuery(
      dbPath,
      `SELECT id, agent_id, scope, proj_type, content, weight, source_ref, source_type, status,
              created_at_unix, expires_at_unix
       FROM projections ${where}
       ORDER BY created_at_unix DESC, scope, proj_type`
    );
  }

  /** @type {Record<string, number>} */
  const schemaCounts = {};
  const facetRows = [];

  if (sqliteTableExists(dbPath, "facets")) {
    const columns = sqliteTableColumns(dbPath, "facets");
    const { where } = workspaceWhere(columns, workspaceId);
    for (const row of sqliteQuery(dbPath, `SELECT schema_id, facets FROM facets ${where}`)) {
      schemaCounts[String(row.schema_id)] = (schemaCounts[String(row.schema_id)] || 0) + 1;
      facetRows.push({ schema_id: row.schema_id, facets: row.facets });
    }
  }

  if (sqliteTableExists(dbPath, "agent_facts")) {
    const columns = sqliteTableColumns(dbPath, "agent_facts");
    const schemaCol = columns.has("schema_id") ? "schema_id" : "NULL";
    const facetsCol = columns.has("facets") ? "facets" : columns.has("facets_json") ? "facets_json" : "NULL";
    const { where } = workspaceWhere(columns, workspaceId);
    for (const row of sqliteQuery(
      dbPath,
      `SELECT ${schemaCol} AS schema_id, ${facetsCol} AS facets FROM agent_facts ${where}`
    )) {
      if (row.schema_id) {
        schemaCounts[String(row.schema_id)] = (schemaCounts[String(row.schema_id)] || 0) + 1;
      }
      facetRows.push({ schema_id: row.schema_id, facets: row.facets });
    }
  }

  const facetIndex = buildObservedFacetIndex(facetRows);

  let graphEntitiesCount = 0;
  /** @type {Array<{ type: string }>} */
  let graphRelations = [];
  /** @type {Array<Record<string, unknown>>} */
  let typeBProjectionResults = [];

  if (sqliteTableExists(dbPath, "graph_entity")) {
    const columns = sqliteTableColumns(dbPath, "graph_entity");
    const { where } = workspaceWhere(columns, workspaceId);
    const countRow = sqliteQuery(dbPath, `SELECT COUNT(*) AS c FROM graph_entity ${where}`)[0];
    graphEntitiesCount = Number(countRow?.c ?? 0);

    const idCol = columns.has("id") ? "id" : columns.has("entity_id") ? "entity_id" : null;
    const typeCol = columns.has("type") ? "type" : columns.has("entity_type") ? "entity_type" : null;
    const nameCol = columns.has("name") ? "name" : idCol;
    const metadataCol = columns.has("metadata") ? "metadata" : columns.has("metadata_json") ? "metadata_json" : null;
    const confidenceCol = columns.has("confidence") ? "confidence" : null;

    if (idCol && typeCol && nameCol) {
      const whereParts = [`${typeCol} = 'ProjectionResult'`];
      if (workspaceId && columns.has("workspace_id")) {
        whereParts.push(`workspace_id = '${workspaceId.replace(/'/g, "''")}'`);
      }
      for (const row of sqliteQuery(
        dbPath,
        `SELECT ${idCol} AS id, ${typeCol} AS type, ${nameCol} AS name,
                ${metadataCol || "NULL"} AS metadata, ${confidenceCol || "NULL"} AS confidence
         FROM graph_entity WHERE ${whereParts.join(" AND ")} ORDER BY name`
      )) {
        const [ok, metadata] = parseJsonMaybe(row.metadata);
        const meta = ok && metadata && typeof metadata === "object" ? metadata : {};
        typeBProjectionResults.push({
          id: String(row.id),
          type: row.type,
          name: row.name,
          projection_id: meta.projection_id || "",
          collection_id: meta.collection_id || "",
          confidence: row.confidence,
          metadata: meta
        });
      }
    }
  }

  if (sqliteTableExists(dbPath, "graph_relation")) {
    const columns = sqliteTableColumns(dbPath, "graph_relation");
    const { where } = workspaceWhere(columns, workspaceId);
    const relationCol = columns.has("relation_type")
      ? "relation_type"
      : columns.has("label")
        ? "label"
        : columns.has("type")
          ? "type"
          : "relation_type";
    graphRelations = sqliteQuery(
      dbPath,
      `SELECT ${relationCol} AS relation_type FROM graph_relation ${where}`
    ).map((row) => ({ type: String(row.relation_type ?? "") }));
  }

  let answerArtifacts = [];
  if (sqliteTableExists(dbPath, "mindbrain_answer_artifacts")) {
    let where = "";
    if (workspaceId) {
      const ws = workspaceId.replace(/'/g, "''");
      where = `WHERE workspace_id = '${ws}' OR (artifact_kind = 'analysis_plan' AND (scope = '${ws}' OR scope LIKE '${ws}:%'))`;
    }
    answerArtifacts = sqliteQuery(
      dbPath,
      `SELECT artifact_id, slug, workspace_id, agent_id, scope, artifact_kind,
              public_label, lifecycle, state, current_version, legacy_ref
       FROM mindbrain_answer_artifacts ${where}
       ORDER BY artifact_kind, slug`
    );
  }

  return {
    backend: "sqlite",
    available: true,
    projection_types: projectionTypes,
    projections: projectionRows,
    answer_artifacts: answerArtifacts,
    schema_counts: schemaCounts,
    facet_index: facetIndex,
    graph: {
      entity_count: graphEntitiesCount,
      relation_count: graphRelations.length,
      relations: graphRelations,
      orphan_relation_count: 0,
      projection_results: typeBProjectionResults
    }
  };
}

function projectionNameFromScope(scope) {
  if (!scope) return "";
  return String(scope).split(":").pop() ?? "";
}

function audit(dbPath, workspaceId, modelPath, seedPath) {
  const model = loadModelContract(modelPath);
  const planned = loadPlannedProjections(model, workspaceId);
  const plannedLiveViews = loadPlannedLiveViews(seedPath, workspaceId);
  const backend = fetchSqlite(dbPath, workspaceId);

  const answerArtifacts = backend.answer_artifacts || [];
  const liveViews = answerArtifacts.filter((r) => r.artifact_kind === "live_answer_view");
  const evidencePacks = answerArtifacts.filter((r) => r.artifact_kind === "evidence_pack");
  const registryAnalysisPlans = answerArtifacts.filter((r) => r.artifact_kind === "analysis_plan");
  const staleLiveViews = liveViews.filter((r) => r.lifecycle === "stale");
  const materializedLiveViewIds = new Set(liveViews.map((r) => r.artifact_id).filter(Boolean));
  const materializedLiveViewSlugs = new Set(liveViews.map((r) => r.slug).filter(Boolean));
  const plannedLiveMaterialized = plannedLiveViews.filter(
    (item) => materializedLiveViewIds.has(item.artifact_id) || materializedLiveViewSlugs.has(item.slug)
  );
  const plannedLiveMissing = plannedLiveViews.filter((item) => !plannedLiveMaterialized.includes(item));

  const now = Date.now();
  /** @type {Record<string, unknown>[]} */
  const projections = [];
  const invalidJson = [];
  const expired = [];
  const customTypes = new Set();
  /** @type {Record<string, number>} */
  const scopes = {};
  /** @type {Record<string, number>} */
  const statuses = {};
  /** @type {Record<string, number>} */
  const types = {};
  const allowedTypes = new Set(
    (backend.projection_types || []).map((r) => r.type_name).filter(Boolean)
  );

  for (const row of backend.projections || []) {
    const [okJson, parsed] = parseJsonMaybe(row.content);
    if (!okJson) invalidJson.push(row.id);
    if (row.expires_at_unix) {
      const expiresAt = Number(row.expires_at_unix) * 1000;
      if (expiresAt < now) expired.push(row.id);
    }
    if (allowedTypes.size && row.proj_type && !allowedTypes.has(row.proj_type)) {
      customTypes.add(row.proj_type);
    }
    const scope = String(row.scope ?? "");
    scopes[scope] = (scopes[scope] || 0) + 1;
    statuses[String(row.status ?? "")] = (statuses[String(row.status ?? "")] || 0) + 1;
    types[String(row.proj_type ?? "")] = (types[String(row.proj_type ?? "")] || 0) + 1;

    const contentPreview =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed).slice(0, 260)
        : String(row.content ?? "").slice(0, 260);

    projections.push({
      id: row.id,
      agent_id: row.agent_id,
      scope: row.scope,
      proj_type: row.proj_type,
      status: row.status,
      weight: row.weight,
      created_at: dtFromUnix(row.created_at_unix),
      expires_at: dtFromUnix(row.expires_at_unix),
      content_is_json: okJson,
      content_preview: contentPreview,
      json_keys: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed).sort() : []
    });
  }

  const materializedScopes = new Set((backend.projections || []).map((r) => r.scope).filter(Boolean));
  for (const artifact of answerArtifacts) {
    if (artifact.scope) materializedScopes.add(String(artifact.scope));
    if (artifact.artifact_kind === "analysis_plan" && artifact.slug) {
      materializedScopes.add(`${workspaceId}:catalog:${artifact.slug}`);
      materializedScopes.add(`${workspaceId}:core:${artifact.slug}`);
      materializedScopes.add(`${workspaceId}:competency:${artifact.slug.replace(/^immeuble_/, "")}`);
    }
    if (artifact.artifact_kind === "live_answer_view" && artifact.slug) {
      materializedScopes.add(`${workspaceId}:core:${artifact.slug}`);
    }
  }
  for (const item of planned) {
    if (materializedScopes.has(item.expected_scope)) continue;
    const slugMatch = answerArtifacts.some(
      (artifact) =>
        artifact.slug === item.name ||
        artifact.artifact_id === `analysis_plan__${item.name}` ||
        artifact.artifact_id === `live_answer_view__${item.name}`
    );
    if (slugMatch) materializedScopes.add(item.expected_scope);
  }
  const plannedMissing = planned.filter((item) => !materializedScopes.has(item.expected_scope));
  const plannedMaterialized = planned.filter((item) => materializedScopes.has(item.expected_scope));

  const typeBResults = backend.graph?.projection_results || [];
  const typeBProjectionIds = new Set(typeBResults.map((r) => r.projection_id).filter(Boolean));
  const plannedTypeBMaterialized = planned.filter(
    (item) =>
      typeBProjectionIds.has(item.name) ||
      typeBProjectionIds.has(projectionNameFromScope(item.expected_scope))
  );
  const plannedTypeBMissing = planned.filter((item) => !plannedTypeBMaterialized.includes(item));

  /** @type {Record<string, number>} */
  const relationCounts = {};
  for (const row of backend.graph?.relations || []) {
    const key = normalizeEdgeType(row.type);
    relationCounts[key] = (relationCounts[key] || 0) + 1;
  }

  const schemaCounts = backend.schema_counts || {};
  const facetIndex = backend.facet_index || buildObservedFacetIndex([]);

  const requiredEdges = [...new Set(planned.flatMap((item) => item.required_edges || []))].sort();
  const requiredSchemas = [...new Set(planned.flatMap((item) => item.required_schemas || []))].sort();
  const requiredFacets = [...new Set(planned.flatMap((item) => item.required_facets || []))].sort();

  const missingRequiredEdgeTypes = requiredEdges.filter((edge) => !edgeIsObserved(edge, relationCounts));
  const requiredSchemasWithoutRecords = requiredSchemas.filter((schema) => {
    const prefixed = schema.includes(":") ? schema : `immeuble:core:${schema}`;
    return !(schemaCounts[schema] > 0 || schemaCounts[prefixed] > 0);
  });
  const requiredFacetsNotObserved = missingRequiredFacets(requiredFacets, facetIndex);

  /** @type {Record<string, Record<string, unknown>[]>} */
  const missingByFamily = {};
  for (const item of plannedMissing) {
    if (!missingByFamily[item.ontology]) missingByFamily[item.ontology] = [];
    missingByFamily[item.ontology].push(item);
  }

  const graph = backend.graph || {};
  let qualityScore = 100;
  qualityScore -= Math.min(30, plannedMissing.length * 3);
  qualityScore -= Math.min(20, missingRequiredEdgeTypes.length * 2);
  qualityScore -= Math.min(20, requiredSchemasWithoutRecords.length * 3);
  qualityScore -= Math.min(15, requiredFacetsNotObserved.length);
  qualityScore -= Math.min(15, invalidJson.length * 2 + expired.length + (graph.orphan_relation_count || 0));
  qualityScore = Math.max(0, qualityScore);

  return {
    backend: backend.backend,
    db_path: dbPath,
    workspace_filter: workspaceId,
    model_path: modelPath || "",
    answer_artifacts_seed: seedPath || "",
    generated_at: new Date().toISOString(),
    summary: {
      quality_score: qualityScore,
      projection_count: projections.length,
      analysis_plan_row_count: projections.length,
      type_a_declared_projection_count: projections.length,
      answer_snapshot_count: typeBResults.length,
      type_b_projection_result_count: typeBResults.length,
      live_answer_view_count: liveViews.length,
      evidence_pack_count: evidencePacks.length,
      registry_analysis_plan_count: registryAnalysisPlans.length,
      stale_live_view_count: staleLiveViews.length,
      planned_projection_count: planned.length,
      planned_materialized_count: plannedMaterialized.length,
      planned_missing_count: plannedMissing.length,
      planned_type_a_materialized_count: plannedMaterialized.length,
      planned_type_a_missing_count: plannedMissing.length,
      planned_analysis_plan_materialized_count: plannedMaterialized.length,
      planned_analysis_plan_missing_count: plannedMissing.length,
      planned_type_b_materialized_count: plannedTypeBMaterialized.length,
      planned_type_b_missing_count: plannedTypeBMissing.length,
      planned_answer_snapshot_materialized_count: plannedTypeBMaterialized.length,
      planned_answer_snapshot_missing_count: plannedTypeBMissing.length,
      planned_live_view_count: plannedLiveViews.length,
      planned_live_view_materialized_count: plannedLiveMaterialized.length,
      planned_live_view_missing_count: plannedLiveMissing.length,
      graph_entity_count: graph.entity_count || 0,
      graph_relation_count: graph.relation_count || 0,
      orphan_relation_count: graph.orphan_relation_count || 0,
      required_edge_type_gap_count: missingRequiredEdgeTypes.length,
      required_schema_record_gap_count: requiredSchemasWithoutRecords.length,
      required_facet_observation_gap_count: requiredFacetsNotObserved.length,
      allowed_projection_type_count: (backend.projection_types || []).length,
      custom_projection_types: [...customTypes].sort(),
      invalid_json_content_count: invalidJson.length,
      expired_projection_count: expired.length,
      observed_facet_count: facetIndex.all.size,
      observed_prefixed_facet_count: facetIndex.prefixed.size
    },
    counts: {
      by_type: Object.fromEntries(Object.entries(types).sort()),
      by_status: Object.fromEntries(Object.entries(statuses).sort()),
      by_scope: Object.fromEntries(Object.entries(scopes).sort()),
      graph_relations_by_type: Object.fromEntries(Object.entries(relationCounts).sort()),
      facets_by_schema: Object.fromEntries(Object.entries(schemaCounts).sort())
    },
    allowed_projection_types: backend.projection_types || [],
    projections,
    answer_artifacts: answerArtifacts,
    type_b_projection_results: typeBResults,
    quality_flags: {
      invalid_json_projection_ids: invalidJson,
      expired_projection_ids: expired,
      custom_projection_types_not_registered: [...customTypes].sort(),
      stale_live_answer_view_ids: staleLiveViews.map((r) => r.artifact_id).filter(Boolean),
      missing_required_edge_types: missingRequiredEdgeTypes,
      required_schemas_without_records: requiredSchemasWithoutRecords,
      required_facets_not_observed: requiredFacetsNotObserved,
      orphan_relation_count: graph.orphan_relation_count || 0
    },
    planned_projection_gap: {
      mode: "analysis_plan",
      legacy_mode: "type_a_declared_projections",
      planned_count: planned.length,
      materialized_count: plannedMaterialized.length,
      missing_count: plannedMissing.length,
      missing_by_ontology: Object.fromEntries(Object.entries(missingByFamily).sort())
    },
    analysis_plan_gap: {
      mode: "analysis_plan",
      planned_count: planned.length,
      materialized_count: plannedMaterialized.length,
      missing_count: plannedMissing.length,
      missing_by_ontology: Object.fromEntries(Object.entries(missingByFamily).sort())
    },
    type_b_projection_result_gap: {
      mode: "answer_snapshot",
      legacy_mode: "type_b_graph_projection_results",
      planned_count: planned.length,
      materialized_count: plannedTypeBMaterialized.length,
      missing_count: plannedTypeBMissing.length,
      available_projection_ids: [...typeBProjectionIds].sort(),
      missing_projection_ids: plannedTypeBMissing.map((item) => item.name)
    },
    answer_snapshot_gap: {
      mode: "answer_snapshot",
      planned_count: planned.length,
      materialized_count: plannedTypeBMaterialized.length,
      missing_count: plannedTypeBMissing.length,
      available_projection_ids: [...typeBProjectionIds].sort(),
      missing_projection_ids: plannedTypeBMissing.map((item) => item.name)
    },
    live_answer_view_gap: {
      mode: "live_answer_view",
      planned_count: plannedLiveViews.length,
      materialized_count: plannedLiveMaterialized.length,
      missing_count: plannedLiveMissing.length,
      missing_artifact_ids: plannedLiveMissing.map((item) => item.artifact_id),
      note: "stale live_answer_view after import is expected until gcp brain artifact refresh"
    }
  };
}

function writeMarkdown(report, path) {
  const lines = [
    "# GhostCrab Projection and Graph Audit",
    "",
    `- Backend: \`${report.backend}\``,
    `- DB: \`${report.db_path}\``,
    `- Workspace filter: \`${report.workspace_filter || "all"}\``,
    `- Model: \`${report.model_path || "n/a"}\``,
    `- Answer artifacts seed: \`${report.answer_artifacts_seed || "n/a"}\``,
    `- Generated at: \`${report.generated_at}\``,
    "",
    "## Summary",
    ""
  ];
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`- \`${key}\`: ${value}`);
  }

  lines.push(
    "",
    "## Answer artifact taxonomy",
    "",
    "| `artifact_kind` | Storage | Legacy |",
    "|-----------------|---------|--------|",
    "| `analysis_plan` | `projections` | Type A |",
    "| `live_answer_view` | `mindbrain_answer_artifacts` | *(new)* |",
    "| `answer_snapshot` | `graph_entity` (`ProjectionResult`) | Type B |",
    "| `evidence_pack` | `mindbrain_answer_artifacts` | evidence links |",
    "",
    "## Personal operator commands",
    "",
    "```bash",
    `gcp brain artifact list --workspace-id ${report.workspace_filter || "<ws>"} --kind analysis_plan`,
    `gcp brain artifact list --workspace-id ${report.workspace_filter || "<ws>"} --kind live_answer_view`,
    "gcp brain artifact refresh live_answer_view__<slug>",
    "```"
  );

  lines.push("", "## Quality Flags", "");
  for (const [key, value] of Object.entries(report.quality_flags)) {
    const rendered = Array.isArray(value) && value.length ? value.map((v) => `\`${v}\``).join(", ") : value;
    lines.push(`- \`${key}\`: ${rendered || "n/a"}`);
  }

  lines.push("", "## Graph Relation Coverage", "");
  for (const [key, value] of Object.entries(report.counts.graph_relations_by_type || {})) {
    lines.push(`- \`${key}\`: ${value}`);
  }

  lines.push("", "## analysis_plan rows (projections table)", "");
  for (const item of report.projections) {
    lines.push(
      `- \`${item.scope || "(no scope)"}\` | \`${item.proj_type}\` | \`${item.status}\` | \`${item.agent_id}\``
    );
  }

  lines.push("", "## Answer artifacts (mindbrain_answer_artifacts)", "");
  if (report.answer_artifacts?.length) {
    for (const item of report.answer_artifacts) {
      lines.push(
        `- \`${item.artifact_id}\` | \`${item.artifact_kind}\` | \`${item.lifecycle}\` | \`${item.state}\` | v${item.current_version}`
      );
    }
  } else {
    lines.push("- n/a (table missing or empty)");
  }

  const analysisGap = report.analysis_plan_gap || report.planned_projection_gap;
  lines.push("", "## Planned analysis_plan gap", "");
  lines.push(`- Planned: ${analysisGap.planned_count}`);
  lines.push(`- Materialized: ${analysisGap.materialized_count}`);
  lines.push(`- Missing: ${analysisGap.missing_count}`);

  const liveGap = report.live_answer_view_gap || {};
  if (liveGap.planned_count) {
    lines.push("", "## Planned live_answer_view gap", "");
    lines.push(`- Planned: ${liveGap.planned_count}`);
    lines.push(`- Materialized: ${liveGap.materialized_count}`);
    lines.push(`- Missing: ${liveGap.missing_count}`);
    if (liveGap.note) lines.push(`- Note: ${liveGap.note}`);
  }

  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}

function strictAuditFailed(report) {
  const flags = report.quality_flags;
  return (
    report.summary.planned_missing_count > 0 ||
    flags.missing_required_edge_types.length > 0 ||
    flags.required_schemas_without_records.length > 0 ||
    flags.required_facets_not_observed.length > 0
  );
}

function main() {
  const report = audit(dbPath, workspaceId, modelPath, seedPath);
  mkdirSync(outputDir, { recursive: true });
  const suffix = workspaceId || "all";
  const jsonPath = join(outputDir, `projection_audit_${suffix}.json`);
  const mdPath = join(outputDir, `projection_audit_${suffix}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeMarkdown(report, mdPath);

  const output = {
    json: jsonPath,
    markdown: mdPath,
    summary: report.summary,
    ok: !strict || !strictAuditFailed(report)
  };
  console.log(JSON.stringify(output, null, 2));
  if (strict && strictAuditFailed(report)) {
    process.exit(1);
  }
}

main();
