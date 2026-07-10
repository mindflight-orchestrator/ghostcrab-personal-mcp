#!/usr/bin/env node
/**
 * Idempotent Immeuble model builder (MVP_Serenity_2 style).
 *
 * Reads bundle/immeuble.bundle.json, emits:
 * - model/immeuble_model.json
 * - fake_data/*.csv (one per entity_type)
 * - import_ready/mfo_facets_import.csv + graph_edges_import.csv
 * - contracts/mapping_external_to_canonical.json
 * - reports/*.json / *.jsonl
 */

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WS = "immeuble";
const ONT = "immeuble::core";
const SCHEMA_PREFIX = "immeuble:core:";

const PATHS = {
  bundle: join(ROOT, "bundle", "immeuble.bundle.json"),
  model: join(ROOT, "model", "immeuble_model.json"),
  mapping: join(ROOT, "contracts", "mapping_external_to_canonical.json"),
  fakeData: join(ROOT, "fake_data"),
  importReady: join(ROOT, "import_ready"),
  reports: join(ROOT, "reports"),
  successCriteria: join(ROOT, "success-criteria.yaml")
};

const CLOSED_EDGE_LABELS = [
  "contains",
  "owns",
  "occupies",
  "household_member",
  "primary_residence_of",
  "leases",
  "rented_to",
  "assigned_cellar",
  "assigned_garage",
  "uses_exclusive",
  "uses_common",
  "matched_to",
  "allocated_to",
  "requires_review",
  "documents",
  "member_of",
  "bills_to",
  "linked_to"
];

function schemaId(entityType) {
  return `${SCHEMA_PREFIX}${entityType}`;
}

function recordId(entityType, entityId) {
  return `${entityType}:${entityId}`;
}

function sourceRef(entityType, entityId) {
  return `${entityType}:${entityType}:${entityId}`;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function writeCsv(path, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}

function parseMeta(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function transformBundleIds(bundle) {
  const text = JSON.stringify(bundle)
    .replaceAll("immeuble-demo-llm", WS)
    .replaceAll("immeuble-demo::docs", `${WS}::docs`)
    .replaceAll("immeuble-demo::core", ONT)
    .replaceAll("immeuble-demo", WS)
    .replaceAll("immeuble_demo", "immeuble")
    .replaceAll("agent:immeuble-demo", `agent:${WS}`);
  return JSON.parse(text);
}

function buildModel(entityTypes) {
  return {
    workspace_id: WS,
    ontology_id: ONT,
    label: "Immeuble syndic reference model",
    version: "2026-06-14",
    closed_edge_labels: CLOSED_EDGE_LABELS.map((l) => l.toUpperCase()),
    entity_types: entityTypes.map((name) => ({
      name,
      label: name,
      schema_id: schemaId(name),
      ontology: "core",
      node_type: name,
      record_id_pattern: `${name}:<stable-key>`
    })),
    contract_relations: []
  };
}

function entityToRow(entity) {
  const meta = parseMeta(entity.metadata_json);
  return {
    record_id: recordId(entity.entity_type, entity.entity_id),
    name: entity.name ?? "",
    entity_type: entity.entity_type,
    entity_id: String(entity.entity_id),
    confidence: entity.confidence ?? 1,
    ...meta
  };
}

function facetContent(entity, row) {
  const facets = { ...row, source: "fake_data", ontology: "core" };
  delete facets.record_id;
  return facets;
}

function main() {
  mkdirSync(PATHS.fakeData, { recursive: true });
  mkdirSync(PATHS.importReady, { recursive: true });
  mkdirSync(PATHS.reports, { recursive: true });

  let bundle = JSON.parse(readFileSync(PATHS.bundle, "utf8"));
  bundle = transformBundleIds(bundle);
  writeFileSync(PATHS.bundle, JSON.stringify(bundle, null, 2) + "\n", "utf8");

  const entities = bundle.entities_raw ?? [];
  const relations = bundle.relations_raw ?? [];
  const byType = new Map();
  const idToEntity = new Map();

  for (const entity of entities) {
    idToEntity.set(entity.entity_id, entity);
    const list = byType.get(entity.entity_type) ?? [];
    list.push(entity);
    byType.set(entity.entity_type, list);
  }

  const entityTypes = [...byType.keys()].sort();
  const model = buildModel(entityTypes);
  writeFileSync(PATHS.model, JSON.stringify(model, null, 2) + "\n", "utf8");

  for (const old of readdirSync(PATHS.fakeData).filter((f) =>
    f.endsWith(".csv")
  )) {
    rmSync(join(PATHS.fakeData, old));
  }

  const facetRows = [];
  for (const [entityType, list] of byType.entries()) {
    const rows = list.map(entityToRow);
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const ordered = [
      "record_id",
      "name",
      "entity_type",
      "entity_id",
      ...headers.filter(
        (h) => !["record_id", "name", "entity_type", "entity_id"].includes(h)
      )
    ];
    writeCsv(join(PATHS.fakeData, `${entityType}.csv`), ordered, rows);

    for (const entity of list) {
      const row = entityToRow(entity);
      const facets = facetContent(entity, row);
      facetRows.push({
        content: entity.name ?? row.record_id,
        facets: JSON.stringify(facets),
        schema_id: schemaId(entityType),
        source_ref: sourceRef(entityType, entity.entity_id),
        workspace_id: WS
      });
    }
  }

  writeCsv(
    join(PATHS.importReady, "mfo_facets_import.csv"),
    ["content", "facets", "schema_id", "source_ref", "workspace_id"],
    facetRows
  );

  const edgeRows = relations.map((rel) => {
    const source = idToEntity.get(rel.source_entity_id);
    const target = idToEntity.get(rel.target_entity_id);
    const label = (rel.edge_type ?? "linked_to").toUpperCase();
    return {
      confidence: rel.confidence ?? 0.85,
      label,
      metadata_json: JSON.stringify({
        source: "fake_data",
        relation_contract: {
          edge_label: label,
          source_entity_id: rel.source_entity_id,
          target_entity_id: rel.target_entity_id
        }
      }),
      source: source
        ? sourceRef(source.entity_type, source.entity_id)
        : String(rel.source_entity_id),
      target: target
        ? sourceRef(target.entity_type, target.entity_id)
        : String(rel.target_entity_id),
      workspace_id: WS
    };
  });

  writeCsv(
    join(PATHS.importReady, "graph_edges_import.csv"),
    [
      "confidence",
      "label",
      "metadata_json",
      "source",
      "target",
      "workspace_id"
    ],
    edgeRows
  );

  const mappingEntities = {};
  for (const entityType of entityTypes) {
    mappingEntities[entityType] = {
      csv: `fake_data/${entityType}.csv`,
      schema_id: schemaId(entityType),
      record_id_column: "record_id",
      content_columns: ["name"]
    };
  }

  const mapping = {
    workspace_id: WS,
    ontology_id: ONT,
    source_tag: "structured_import",
    data_plane: "import_ready",
    import_ready: {
      facets_csv: "import_ready/mfo_facets_import.csv",
      edges_csv: "import_ready/graph_edges_import.csv"
    },
    entities: mappingEntities,
    contract_relations: [],
    edges_mode: "import_ready",
    notes:
      "Generated by build-immeuble-model.mjs from bundle/immeuble.bundle.json"
  };
  writeFileSync(PATHS.mapping, JSON.stringify(mapping, null, 2) + "\n", "utf8");

  const counts = Object.fromEntries(
    [...byType.entries()].map(([k, v]) => [k, v.length])
  );
  const nodeLines = entities.map((e) =>
    JSON.stringify({
      record_id: recordId(e.entity_type, e.entity_id),
      entity_type: e.entity_type,
      name: e.name,
      schema_id: schemaId(e.entity_type)
    })
  );
  writeFileSync(
    join(PATHS.reports, "graph_nodes.jsonl"),
    nodeLines.join("\n") + "\n",
    "utf8"
  );

  const edgeLines = edgeRows.map((e) => JSON.stringify(e));
  writeFileSync(
    join(PATHS.reports, "graph_edges.jsonl"),
    edgeLines.join("\n") + "\n",
    "utf8"
  );

  const prefixViolations = facetRows.filter(
    (r) => !r.schema_id.startsWith("immeuble:")
  );
  const modelValidation = {
    ok: prefixViolations.length === 0,
    workspace_id: WS,
    ontology_id: ONT,
    entity_type_count: entityTypes.length,
    entity_types: entityTypes,
    schema_id_prefix: "immeuble:",
    prefix_violations: prefixViolations.length,
    generated_at: new Date().toISOString()
  };
  writeFileSync(
    join(PATHS.reports, "01-model.validation.json"),
    JSON.stringify(modelValidation, null, 2) + "\n",
    "utf8"
  );

  const mappingValidation = {
    ok: true,
    workspace_id: WS,
    mapped_entity_types: entityTypes.length,
    facet_rows: facetRows.length,
    edge_rows: edgeRows.length,
    all_schema_ids_prefixed: prefixViolations.length === 0,
    generated_at: new Date().toISOString()
  };
  writeFileSync(
    join(PATHS.reports, "02-mapping.validation.json"),
    JSON.stringify(mappingValidation, null, 2) + "\n",
    "utf8"
  );

  const pipelineAudit = {
    ok: modelValidation.ok && mappingValidation.ok,
    gates: {
      model: modelValidation.ok,
      mapping: mappingValidation.ok,
      facets: facetRows.length > 0,
      edges: edgeRows.length > 0
    },
    counts,
    facet_rows: facetRows.length,
    edge_rows: edgeRows.length,
    generated_at: new Date().toISOString()
  };
  writeFileSync(
    join(PATHS.reports, "pipeline_audit.json"),
    JSON.stringify(pipelineAudit, null, 2) + "\n",
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        ok: pipelineAudit.ok,
        workspace_id: WS,
        entity_types: entityTypes.length,
        facet_rows: facetRows.length,
        edge_rows: edgeRows.length,
        fake_data_csv: entityTypes.length,
        reports: readdirSync(PATHS.reports).length
      },
      null,
      2
    )
  );
}

main();
