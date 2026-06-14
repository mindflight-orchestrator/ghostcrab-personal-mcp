#!/usr/bin/env node
/**
 * Read-only corpus coverage audit: ingest → qualify → extract → apply.
 *
 * Usage:
 *   node scripts/audit-corpus-coverage.mjs \
 *     --workspace-id test-immo-mcp3 \
 *     --db /path/to/ghostcrab.sqlite \
 *     [--collection-id test-immo-mcp3::docs] \
 *     [--ontology-id test-immo-mcp3::core] \
 *     [--manifest examples/immeuble/sources/documents/manifest.json] \
 *     [--expected-coverage examples/immeuble/sources/documents/expected-coverage.json] \
 *     [--parsed-json /path/to/business-extraction.parsed.json] \
 *     [--output reports/corpus-audit-test-immo-mcp3.md]
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const require = createRequire(import.meta.url);

function loadDatabaseSync() {
  try {
    return require("node:sqlite").DatabaseSync;
  } catch (error) {
    throw new Error("node:sqlite is required to run corpus audit.", { cause: error });
  }
}

function parseArgs(argv) {
  const options = {
    workspaceId: null,
    dbPath: null,
    collectionId: null,
    ontologyId: null,
    manifestPath: join(repoRoot, "examples/immeuble/sources/documents/manifest.json"),
    expectedPath: join(repoRoot, "examples/immeuble/sources/documents/expected-coverage.json"),
    parsedJsonPath: null,
    outputPath: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === "--workspace-id") options.workspaceId = next();
    else if (arg === "--db") options.dbPath = resolve(next());
    else if (arg === "--collection-id") options.collectionId = next();
    else if (arg === "--ontology-id") options.ontologyId = next();
    else if (arg === "--manifest") options.manifestPath = resolve(next());
    else if (arg === "--expected-coverage") options.expectedPath = resolve(next());
    else if (arg === "--parsed-json") options.parsedJsonPath = resolve(next());
    else if (arg === "--output") options.outputPath = resolve(next());
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.help) return options;
  if (!options.workspaceId) throw new Error("--workspace-id is required");
  if (!options.dbPath) throw new Error("--db is required");
  if (!options.collectionId) options.collectionId = `${options.workspaceId}::docs`;
  if (!options.ontologyId) options.ontologyId = `${options.workspaceId}::core`;
  if (!options.outputPath) {
    options.outputPath = join(repoRoot, "reports", `corpus-audit-${options.workspaceId}.md`);
  }
  return options;
}

function queryAll(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(db, sql, params = []) {
  return db.prepare(sql).get(...params);
}

function loadParsedExtract(parsedJsonPath) {
  if (!parsedJsonPath || !existsSync(parsedJsonPath)) {
    return { entity_documents_raw: [], entities_raw: [], relations_raw: [] };
  }
  const parsed = JSON.parse(readFileSync(parsedJsonPath, "utf8"));
  return {
    entity_documents_raw: parsed.entity_documents_raw ?? [],
    entities_raw: parsed.entities_raw ?? [],
    relations_raw: parsed.relations_raw ?? []
  };
}

function docIdsFromEntityDocuments(rows) {
  return new Set(rows.map((row) => Number(row.doc_id)).filter((id) => Number.isFinite(id)));
}

function expectedKeyToEntityType(key) {
  const map = {
    buildings: "building",
    blocks: "block",
    units: "unit",
    households: "household",
    cellars: "cellar",
    private_gardens: "private_garden",
    lease_contracts: "lease_contract",
    coda_entries: "coda_entry",
    billing_group: "billing_group",
    shared_space: "shared_space",
    shared_equipment: "shared_equipment"
  };
  return map[key] ?? key;
}

function diagnoseRow(row) {
  const issues = [];
  if (!row.ingested) issues.push("ingest missing");
  if (row.chunks === 0) issues.push("no chunks");
  if (row.facet_rows === 0) issues.push("qualify missing");
  if (row.qualified_type && row.qualified_type !== row.expected_type) {
    issues.push(`document_type mismatch (${row.qualified_type})`);
  }
  if (!row.in_parsed_extract) issues.push("LLM extract omit (parsed entity_documents)");
  if (!row.in_db_entity_docs && row.in_parsed_extract) issues.push("apply gap (parsed only)");
  if (!row.in_db_entity_docs && !row.in_parsed_extract && row.ingested) {
    issues.push("extract coverage gap");
  }
  if (issues.length === 0) return "OK";
  return issues.join("; ");
}

/**
 * @param {ReturnType<typeof parseArgs>} options
 */
export function runAudit(options) {
  if (!existsSync(options.dbPath)) {
    throw new Error(`SQLite database not found: ${options.dbPath}`);
  }
  if (!existsSync(options.manifestPath)) {
    throw new Error(`Manifest not found: ${options.manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(options.manifestPath, "utf8"));
  const expected = existsSync(options.expectedPath)
    ? JSON.parse(readFileSync(options.expectedPath, "utf8"))
    : { counts: {} };
  const parsed = loadParsedExtract(options.parsedJsonPath);
  const parsedDocIds = docIdsFromEntityDocuments(parsed.entity_documents_raw);

  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(options.dbPath);
  try {
    const documents = queryAll(
      db,
      `SELECT doc_id, source_ref, length(content) AS content_chars
       FROM documents_raw
       WHERE workspace_id = ? AND collection_id = ?
       ORDER BY doc_id`,
      [options.workspaceId, options.collectionId]
    );
    const docById = new Map(documents.map((row) => [Number(row.doc_id), row]));

    const chunkCounts = queryAll(
      db,
      `SELECT doc_id, COUNT(*) AS count
       FROM chunks_raw
       WHERE workspace_id = ? AND collection_id = ?
       GROUP BY doc_id`,
      [options.workspaceId, options.collectionId]
    );
    const chunksByDoc = new Map(chunkCounts.map((row) => [Number(row.doc_id), Number(row.count)]));

    const facetCounts = queryAll(
      db,
      `SELECT doc_id, COUNT(*) AS count
       FROM facet_assignments_raw
       WHERE workspace_id = ? AND collection_id = ? AND target_kind = 'doc'
       GROUP BY doc_id`,
      [options.workspaceId, options.collectionId]
    );
    const facetsByDoc = new Map(facetCounts.map((row) => [Number(row.doc_id), Number(row.count)]));

    const qualifiedTypes = queryAll(
      db,
      `SELECT doc_id, value
       FROM facet_assignments_raw
       WHERE workspace_id = ? AND collection_id = ?
         AND target_kind = 'doc'
         AND namespace = 'source' AND dimension = 'document_type'`,
      [options.workspaceId, options.collectionId]
    );
    const typeByDoc = new Map(qualifiedTypes.map((row) => [Number(row.doc_id), String(row.value)]));

    const dbEntityDocIds = new Set(
      queryAll(
        db,
        `SELECT DISTINCT doc_id
         FROM entity_documents_raw
         WHERE workspace_id = ? AND collection_id = ?`,
        [options.workspaceId, options.collectionId]
      ).map((row) => Number(row.doc_id))
    );

    const entityCounts = queryAll(
      db,
      `SELECT entity_type, COUNT(*) AS count
       FROM entities_raw
       WHERE workspace_id = ?
       GROUP BY entity_type
       ORDER BY entity_type`,
      [options.workspaceId]
    );
    const entityCountMap = new Map(
      entityCounts.map((row) => [String(row.entity_type), Number(row.count)])
    );

    const relationCounts = queryAll(
      db,
      `SELECT edge_type, COUNT(*) AS count
       FROM relations_raw
       WHERE workspace_id = ?
       GROUP BY edge_type
       ORDER BY edge_type`,
      [options.workspaceId]
    );

    const invalidTypes = queryAll(
      db,
      `SELECT e.entity_type, COUNT(*) AS count
       FROM entities_raw e
       LEFT JOIN ontology_entity_types oet
         ON oet.ontology_id = e.ontology_id AND oet.entity_type = e.entity_type
       WHERE e.workspace_id = ? AND e.ontology_id = ? AND oet.entity_type IS NULL
       GROUP BY e.entity_type
       ORDER BY e.entity_type`,
      [options.workspaceId, options.ontologyId]
    );

    const files = manifest.files ?? [];
    const perDoc = files.map((file) => {
      const docId = Number(file.doc_id);
      const ingested = docById.has(docId);
      return {
        doc_id: docId,
        filename: file.filename,
        expected_type: file.document_type,
        ingested,
        content_chars: ingested ? Number(docById.get(docId).content_chars) : 0,
        chunks: chunksByDoc.get(docId) ?? 0,
        facet_rows: facetsByDoc.get(docId) ?? 0,
        qualified_type: typeByDoc.get(docId) ?? null,
        in_parsed_extract: parsedDocIds.has(docId),
        in_db_entity_docs: dbEntityDocIds.has(docId)
      };
    });
    for (const row of perDoc) {
      row.diagnosis = diagnoseRow(row);
    }

    const expectedCounts = expected.counts ?? {};
    const countRows = Object.entries(expectedCounts).map(([entityType, expectedCount]) => {
      const mappedType = expectedKeyToEntityType(entityType);
      const actual = entityCountMap.get(mappedType) ?? 0;
      const delta = actual - Number(expectedCount);
      return { entityType, mappedType, expected: Number(expectedCount), actual, delta };
    });

    const lines = [];
    lines.push(`# Corpus audit — ${options.workspaceId}`);
    lines.push("");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|------:|`);
    lines.push(`| Manifest docs | ${files.length} |`);
    lines.push(`| Ingested (\`documents_raw\`) | ${documents.length} |`);
    lines.push(`| Parsed extract doc citations | ${parsedDocIds.size} |`);
    lines.push(`| DB \`entity_documents_raw\` doc ids | ${dbEntityDocIds.size} |`);
    lines.push(`| Entities (\`entities_raw\`) | ${[...entityCountMap.values()].reduce((a, b) => a + b, 0)} |`);
    lines.push(`| Relations (\`relations_raw\`) | ${relationCounts.reduce((a, row) => a + Number(row.count), 0)} |`);
    lines.push("");

    const parsedOnly = [...parsedDocIds].filter((id) => !dbEntityDocIds.has(id)).sort((a, b) => a - b);
    const dbOnly = [...dbEntityDocIds].filter((id) => !parsedDocIds.has(id)).sort((a, b) => a - b);
    if (parsedDocIds.size > 0) {
      lines.push(`Parsed \`entity_documents_raw\` doc_ids: ${[...parsedDocIds].sort((a, b) => a - b).join(", ")}`);
      if (parsedOnly.length) lines.push(`Parsed-only doc_ids (not in DB apply): ${parsedOnly.join(", ")}`);
      if (dbOnly.length) lines.push(`DB-only doc_ids (not in parsed extract): ${dbOnly.join(", ")}`);
      lines.push("");
    }

    lines.push("## Per-document checklist");
    lines.push("");
    lines.push(
      "| doc_id | file | expected_type | ingested | chars | chunks | facets | qualified_type | parsed | db_entity_docs | diagnosis |"
    );
    lines.push(
      "|-------:|------|---------------|:--------:|------:|-------:|-------:|----------------|:------:|:--------------:|-----------|"
    );
    for (const row of perDoc) {
      lines.push(
        `| ${row.doc_id} | ${row.filename} | ${row.expected_type} | ${row.ingested ? "yes" : "no"} | ${row.content_chars} | ${row.chunks} | ${row.facet_rows} | ${row.qualified_type ?? "-"} | ${row.in_parsed_extract ? "yes" : "no"} | ${row.in_db_entity_docs ? "yes" : "no"} | ${row.diagnosis} |`
      );
    }
    lines.push("");

    lines.push("## Entity counts vs expected-coverage");
    lines.push("");
    lines.push("| entity_type | expected | actual | delta |");
    lines.push("|-------------|---------:|-------:|------:|");
    for (const row of countRows.sort((a, b) => a.entityType.localeCompare(b.entityType))) {
      const label =
        row.mappedType === row.entityType
          ? row.entityType
          : `${row.entityType} (\`${row.mappedType}\`)`;
      lines.push(`| ${label} | ${row.expected} | ${row.actual} | ${row.delta >= 0 ? "+" : ""}${row.delta} |`);
    }
    lines.push("");

    if (invalidTypes.length) {
      lines.push("## Invalid entity types (not in ontology)");
      lines.push("");
      for (const row of invalidTypes) {
        lines.push(`- \`${row.entity_type}\`: ${row.count}`);
      }
      lines.push("");
    }

    if (relationCounts.length) {
      lines.push("## Relation edge counts");
      lines.push("");
      lines.push("| edge_type | count |");
      lines.push("|-----------|------:|");
      for (const row of relationCounts) {
        lines.push(`| ${row.edge_type} | ${row.count} |`);
      }
      lines.push("");
    }

    const keyEdges = ["owns", "occupies", "assigned_cellar", "contains"];
    lines.push("## Key relation presence");
    lines.push("");
    const relationMap = new Map(relationCounts.map((row) => [String(row.edge_type), Number(row.count)]));
    for (const edge of keyEdges) {
      const count = relationMap.get(edge) ?? 0;
      lines.push(`- \`${edge}\`: ${count}`);
    }
    lines.push("");

    lines.push("## Decision tree hint");
    lines.push("");
    if (documents.length < files.length) {
      lines.push("- **ingest**: documents_raw count below manifest.");
    } else if (perDoc.some((row) => row.facet_rows === 0)) {
      lines.push("- **qualify**: at least one doc has zero facet assignments.");
    } else if (perDoc.some((row) => !row.in_parsed_extract && row.ingested)) {
      lines.push("- **LLM extract**: ingested docs missing from parsed `entity_documents_raw` (monolithic extract bias).");
    } else if (invalidTypes.length) {
      lines.push("- **validation/normalisation**: entities with types outside ontology.");
    } else if (countRows.some((row) => row.actual < row.expected)) {
      lines.push("- **LLM omission**: entity counts below expected-coverage despite pipeline OK.");
    } else {
      lines.push("- Pipeline stages look consistent for manifest docs; review entity count deltas.");
    }
    lines.push("");

    return lines.join("\n");
  } finally {
    db.close();
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(`Usage: node scripts/audit-corpus-coverage.mjs --workspace-id <id> --db <sqlite> [options]`);
    return 0;
  }
  const report = runAudit(options);
  mkdirSync(dirname(options.outputPath), { recursive: true });
  writeFileSync(options.outputPath, report, "utf8");
  console.log(`Wrote ${options.outputPath}`);
  return 0;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
