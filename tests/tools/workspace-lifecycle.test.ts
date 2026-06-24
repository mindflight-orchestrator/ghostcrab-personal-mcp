import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import { resetWorkspaceData } from "../../src/db/workspace-lifecycle.js";
import { workspaceDeleteTool } from "../../src/tools/workspace/delete.js";
import { workspaceResetTool } from "../../src/tools/workspace/reset.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";
import type { Queryable } from "../../src/db/client.js";

const sqlite3Path = "/usr/bin/sqlite3";

function hasSqlite3(): boolean {
  if (!existsSync(sqlite3Path)) return false;
  const result = spawnSync(sqlite3Path, [":memory:", "SELECT 1;"], {
    encoding: "utf8"
  });
  return result.status === 0;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindSql(sql: string, params: readonly unknown[] = []): string {
  let index = 0;
  const bound = sql.replaceAll("?", () => {
    if (index >= params.length) {
      throw new Error(`Missing SQL param for ${sql}`);
    }
    const literal = sqlLiteral(params[index]);
    index += 1;
    return literal;
  });
  if (index !== params.length) {
    throw new Error(`Unused SQL params for ${sql}`);
  }
  return bound;
}

function runSqlite(dbPath: string, sql: string): string {
  const result = spawnSync(sqlite3Path, [dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });
  if (result.status !== 0) {
    throw new Error(
      `sqlite3 failed (${result.status}): ${result.stderr}\nSQL:\n${sql}`
    );
  }
  return result.stdout;
}

function initSqliteSchema(dbPath: string): void {
  const result = spawnSync(
    sqlite3Path,
    [
      dbPath,
      `.read ${join(
        process.cwd(),
        "vendor/mindbrain/sql/sqlite_mindbrain--1.0.0.sql"
      )}`,
      "PRAGMA foreign_keys=ON;"
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10
    }
  );
  if (result.status !== 0) {
    throw new Error(
      `sqlite3 schema init failed (${result.status}): ${result.stderr}`
    );
  }
}

function runSqliteJson(dbPath: string, sql: string): string {
  const result = spawnSync(sqlite3Path, ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });
  if (result.status !== 0) {
    throw new Error(
      `sqlite3 json failed (${result.status}): ${result.stderr}\nSQL:\n${sql}`
    );
  }
  return result.stdout;
}

function createSqliteQueryable(dbPath: string): Queryable {
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = []
    ): Promise<T[]> {
      const bound = bindSql(sql, params);
      if (bound.trimStart().toUpperCase().startsWith("SELECT")) {
        runSqlite(dbPath, "PRAGMA foreign_keys=ON;");
        const stdout = runSqliteJson(dbPath, bound).trim();
        return stdout ? (JSON.parse(stdout) as T[]) : [];
      }
      runSqlite(dbPath, `PRAGMA foreign_keys=ON;\n${bound};`);
      return [];
    }
  };
}

function expectSqliteCount(
  dbPath: string,
  sql: string,
  expected: number
): void {
  runSqlite(dbPath, "PRAGMA foreign_keys=ON;");
  const stdout = runSqliteJson(dbPath, sql).trim();
  const rows = stdout
    ? (JSON.parse(stdout) as Array<Record<string, unknown>>)
    : [];
  expect(Number(rows[0]?.count ?? 0)).toBe(expected);
}

function makeContext(
  rows: unknown[][] = [[{ id: "test-ws" }]]
): ToolExecutionContext {
  let callIndex = 0;

  return {
    database: {
      kind: "sqlite",
      query: vi.fn().mockImplementation(() => {
        const result = rows[callIndex] ?? [];
        callIndex += 1;
        return Promise.resolve(result);
      }),
      transaction: vi.fn(),
      close: vi.fn(),
      ping: vi.fn()
    } as unknown as ToolExecutionContext["database"],
    embeddings: {} as ToolExecutionContext["embeddings"],
    retrieval: { hybridBm25Weight: 0.5, hybridVectorWeight: 0.5 },
    session: { workspace_id: "default", schema_id: null }
  } as unknown as ToolExecutionContext;
}

describe("ghostcrab_workspace_reset", () => {
  it("requires confirm: true", async () => {
    const ctx = makeContext();
    await expect(
      workspaceResetTool.handler({ workspace_id: "test-ws" }, ctx)
    ).rejects.toThrow();
  });

  it("refuses the default workspace", async () => {
    const ctx = makeContext();
    const result = await workspaceResetTool.handler(
      { workspace_id: "default", confirm: true },
      ctx
    );
    const data = JSON.parse(
      (result.content[0] as { text: string }).text
    ) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect((data.error as { code: string }).code).toBe("protected_workspace");
  });

  it("returns workspace_not_found when missing", async () => {
    const ctx = makeContext([[]]);
    const result = await workspaceResetTool.handler(
      { workspace_id: "missing-ws", confirm: true },
      ctx
    );
    const data = JSON.parse(
      (result.content[0] as { text: string }).text
    ) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect((data.error as { code: string }).code).toBe("workspace_not_found");
  });

  it("clears analysis plans and legacy projections by workspace scope prefix", async () => {
    const query = vi.fn().mockResolvedValue([{ count: 0 }]);

    await resetWorkspaceData(
      {
        query
      } as unknown as Parameters<typeof resetWorkspaceData>[0],
      "serenity-v4"
    );

    const calls = query.mock.calls as Array<[string, readonly unknown[]]>;
    const answerArtifactCount = calls.find(([sql]) =>
      sql.includes("FROM mindbrain_answer_artifacts")
    );
    expect(answerArtifactCount?.[0]).toContain("workspace_id = ?");
    expect(answerArtifactCount?.[0]).not.toContain("scope LIKE ?");
    expect(answerArtifactCount?.[1]).toEqual(["serenity-v4"]);

    const projectionCount = calls.find(([sql]) =>
      sql.includes("FROM projections")
    );
    expect(projectionCount?.[0]).toContain("scope = ? OR scope LIKE ?");
    expect(projectionCount?.[1]).toEqual(["serenity-v4", "serenity-v4:%"]);
  });

  it("clears graph rule evaluation state before graph gap rules", async () => {
    const query = vi.fn().mockResolvedValue([{ count: 1 }]);

    await resetWorkspaceData(
      {
        query
      } as unknown as Parameters<typeof resetWorkspaceData>[0],
      "serenity-v4"
    );

    const deleteCalls = (
      query.mock.calls as Array<[string, readonly unknown[]]>
    )
      .filter(([sql]) => sql.trimStart().startsWith("DELETE FROM"))
      .map(([sql, params]) => ({
        sql,
        params,
        table: sql.match(/DELETE FROM\s+([a-z_]+)/)?.[1]
      }));
    const eventIndex = deleteCalls.findIndex(
      (call) => call.table === "graph_rule_events"
    );
    const evaluationIndex = deleteCalls.findIndex(
      (call) => call.table === "graph_rule_evaluations"
    );
    const entityIndex = deleteCalls.findIndex(
      (call) => call.table === "graph_entity"
    );
    const ruleIndex = deleteCalls.findIndex(
      (call) => call.table === "graph_gap_rules"
    );

    expect(eventIndex).toBeGreaterThanOrEqual(0);
    expect(evaluationIndex).toBeGreaterThan(eventIndex);
    expect(entityIndex).toBeGreaterThan(evaluationIndex);
    expect(ruleIndex).toBeGreaterThan(entityIndex);
    expect(deleteCalls[eventIndex]?.params).toEqual(["serenity-v4"]);
    expect(deleteCalls[evaluationIndex]?.params).toEqual(["serenity-v4"]);
  });

  describe.skipIf(!hasSqlite3())("real SQLite cleanup contract", () => {
    it("clears scoped rows in FK-safe order without touching other workspaces", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "ghostcrab-reset-test-"));
      const dbPath = join(tmpDir, "workspace-reset.sqlite");
      try {
        initSqliteSchema(dbPath);
        runSqlite(
          dbPath,
          `
          PRAGMA foreign_keys=ON;
          INSERT INTO workspaces(id, workspace_id, label)
            VALUES ('reset-ws', 'reset-ws', 'Reset workspace'),
                   ('other-ws', 'other-ws', 'Other workspace');
          INSERT INTO ontologies(ontology_id, workspace_id, name)
            VALUES ('ont-reset', 'reset-ws', 'Reset ontology'),
                   ('ont-other', 'other-ws', 'Other ontology');
          INSERT INTO workspace_settings(workspace_id, default_ontology_id)
            VALUES ('reset-ws', 'ont-reset');

          INSERT INTO ontology_namespaces(ontology_id, namespace)
            VALUES ('ont-reset', 'core');
          INSERT INTO ontology_dimensions(ontology_id, namespace, dimension)
            VALUES ('ont-reset', 'core', 'status');
          INSERT INTO ontology_values(ontology_id, namespace, dimension, value_id, value)
            VALUES ('ont-reset', 'core', 'status', 1, 'active');
          INSERT INTO ontology_entity_types(ontology_id, entity_type)
            VALUES ('ont-reset', 'Unit');
          INSERT INTO ontology_edge_types(ontology_id, edge_type)
            VALUES ('ont-reset', 'owns');
          INSERT INTO ontology_entities_raw(ontology_id, entity_id, entity_type, name)
            VALUES ('ont-reset', 1, 'Unit', 'A1');
          INSERT INTO ontology_relations_raw(ontology_id, relation_id, edge_type, source_entity_id, target_entity_id)
            VALUES ('ont-reset', 1, 'owns', 1, 1);
          INSERT INTO ontology_triples_raw(ontology_id, triple_index, subject_kind, subject, predicate, object_kind, object_value, source_line)
            VALUES ('ont-reset', 1, 'iri', 's', 'p', 'literal', 'o', 's p o');

          INSERT INTO graph_entity(entity_id, workspace_id, entity_type, name)
            VALUES (101, 'reset-ws', 'Unit', 'A1'),
                   (102, 'reset-ws', 'Unit', 'B1'),
                   (201, 'other-ws', 'Unit', 'C1');
          INSERT INTO graph_relation(relation_id, workspace_id, relation_type, source_id, target_id)
            VALUES (301, 'reset-ws', 'linked_to', 101, 102);
          INSERT INTO graph_relation_property(relation_id, property_key, value_type, value_text)
            VALUES (301, 'note', 'text', 'reset');
          INSERT INTO graph_entity_alias(term, entity_id)
            VALUES ('a1', 101);
          INSERT INTO graph_entity_document(entity_id, doc_id, table_id)
            VALUES (101, 1, 1);
          INSERT INTO graph_entity_chunk(entity_id, workspace_id, collection_id, doc_id, chunk_index)
            VALUES (101, 'reset-ws', 'docs', 1, 0);
          INSERT INTO graph_lj_out(entity_id, relation_ids_blob)
            VALUES (101, X'00');
          INSERT INTO graph_lj_in(entity_id, relation_ids_blob)
            VALUES (102, X'00');

          INSERT INTO graph_gap_rules(rule_id, ontology_id, workspace_id, entity_type, relation_type, direction, label)
            VALUES ('rule-reset', 'ont-reset', 'reset-ws', 'Unit', 'linked_to', 'out', 'Rule reset');
          INSERT INTO graph_rule_evaluations(workspace_id, ontology_id, rule_id, subject_entity_id, state, observed_count, expected_min)
            VALUES ('reset-ws', 'ont-reset', 'rule-reset', 101, 'valid', 1, 1);
          INSERT INTO graph_rule_events(event_id, workspace_id, ontology_id, rule_id, subject_entity_id, from_state, to_state, observed_count, expected_min, idempotency_key)
            VALUES ('event-reset', 'reset-ws', 'ont-reset', 'rule-reset', 101, 'unknown', 'valid', 1, 1, 'event-key-reset');

          INSERT INTO quality_convergence_run(run_id, workspace_id, ontology_id, input_fingerprint)
            VALUES ('quality-run-reset', 'reset-ws', 'ont-reset', 'fp');
          INSERT INTO quality_remediation_action(action_id, run_id, workspace_id, ontology_id, issue_type, severity, reason, execution_mode, idempotency_key)
            VALUES ('quality-action-reset', 'quality-run-reset', 'reset-ws', 'ont-reset', 'issue', 'warning', 'reason', 'manual', 'quality-key-reset');

          INSERT INTO collections(collection_id, workspace_id, name)
            VALUES ('docs', 'reset-ws', 'Docs');
          INSERT INTO collection_ontologies(workspace_id, collection_id, ontology_id)
            VALUES ('reset-ws', 'docs', 'ont-reset');
          INSERT INTO documents_raw(workspace_id, collection_id, doc_id, content)
            VALUES ('reset-ws', 'docs', 1, 'doc');
          INSERT INTO chunks_raw(workspace_id, collection_id, doc_id, chunk_index, content)
            VALUES ('reset-ws', 'docs', 1, 0, 'chunk');
          INSERT INTO documents_raw_vector(workspace_id, collection_id, doc_id, dim, embedding_blob)
            VALUES ('reset-ws', 'docs', 1, 1, X'00');
          INSERT INTO chunks_raw_vector(workspace_id, collection_id, doc_id, chunk_index, dim, embedding_blob)
            VALUES ('reset-ws', 'docs', 1, 0, 1, X'00');
          INSERT INTO facet_assignments_raw(workspace_id, collection_id, target_kind, doc_id, ontology_id, namespace, dimension, value)
            VALUES ('reset-ws', 'docs', 'doc', 1, 'ont-reset', 'core', 'status', 'active');
          INSERT INTO external_links_raw(workspace_id, link_id, source_collection_id, source_doc_id, target_uri)
            VALUES ('reset-ws', 1, 'docs', 1, 'https://example.test');
          INSERT INTO document_links_raw(workspace_id, link_id, ontology_id, edge_type, source_collection_id, source_doc_id, target_collection_id, target_doc_id)
            VALUES ('reset-ws', 1, 'ont-reset', 'refers_to', 'docs', 1, 'docs', 1);

          INSERT INTO entities_raw(workspace_id, ontology_id, entity_id, external_id, entity_type, name)
            VALUES ('reset-ws', 'ont-reset', 401, 'entity-a', 'Unit', 'Raw A'),
                   ('reset-ws', 'ont-reset', 402, 'entity-b', 'Unit', 'Raw B');
          INSERT INTO relations_raw(workspace_id, ontology_id, relation_id, external_id, edge_type, source_entity_id, target_entity_id)
            VALUES ('reset-ws', 'ont-reset', 501, 'rel-a', 'linked_to', 401, 402);
          INSERT INTO relation_properties_raw(workspace_id, relation_id, property_key, value_type, value_text)
            VALUES ('reset-ws', 501, 'note', 'text', 'reset');
          INSERT INTO entity_aliases_raw(workspace_id, entity_id, term)
            VALUES ('reset-ws', 401, 'raw-a');
          INSERT INTO entity_documents_raw(workspace_id, entity_id, collection_id, doc_id)
            VALUES ('reset-ws', 401, 'docs', 1);
          INSERT INTO entity_chunks_raw(workspace_id, entity_id, collection_id, doc_id, chunk_index)
            VALUES ('reset-ws', 401, 'docs', 1, 0);

          INSERT INTO table_semantics(table_id, workspace_id, table_schema, table_name)
            VALUES (601, 'reset-ws', 'public', 'things');
          INSERT INTO column_semantics(workspace_id, table_id, table_name, column_name)
            VALUES ('reset-ws', 601, 'things', 'id');
          INSERT INTO relation_semantics(workspace_id, from_table, to_table, source_table_id, target_table_id)
            VALUES ('reset-ws', 'things', 'things', 601, 601);
          INSERT INTO source_mappings(workspace_id, source_key, source_kind, target_table_id)
            VALUES ('reset-ws', 'source-a', 'csv', 601);
          INSERT INTO structured_import_provenance(workspace_id, source_ref, source_tag, table_id)
            VALUES ('reset-ws', 'source-a', 'v1', 601);
          INSERT INTO facet_tables(table_id, schema_name, table_name, chunk_bits)
            VALUES (601, 'public', 'things', 8);
          INSERT INTO facet_definitions(table_id, facet_id, facet_name)
            VALUES (601, 1, 'status');
          INSERT INTO facet_postings(table_id, facet_id, facet_value, chunk_id, posting_blob)
            VALUES (601, 1, 'active', 0, X'00');
          INSERT INTO facet_deltas(table_id, facet_id, facet_value, posting, delta)
            VALUES (601, 1, 'active', 1, 1);
          INSERT INTO facet_value_nodes(table_id, value_id, facet_id, facet_value)
            VALUES (601, 1, 1, 'active');

          INSERT INTO pending_migrations(id, workspace_id, sql)
            VALUES ('migration-reset', 'reset-ws', 'SELECT 1');
          INSERT INTO agent_facts(id, schema_id, content, workspace_id)
            VALUES ('fact-reset', 'test:schema', 'reset fact', 'reset-ws'),
                   ('fact-other', 'test:schema', 'other fact', 'other-ws');
          INSERT INTO mindbrain_answer_artifacts(artifact_id, slug, workspace_id, agent_id, scope, artifact_kind, public_label, lifecycle, state, payload_json)
            VALUES ('artifact-reset', 'artifact-reset', 'reset-ws', 'agent:test', 'reset-ws', 'analysis_plan', 'Artifact reset', 'active', 'ready', '{}');
          INSERT INTO mindbrain_answer_events(event_id, artifact_id, event_kind, signal_json)
            VALUES ('artifact-event-reset', 'artifact-reset', 'answer_update_event', '{}');
          INSERT INTO projections(id, agent_id, scope, proj_type, content)
            VALUES ('projection-reset', 'agent:test', 'reset-ws:scope', 'FACT', 'projection');
          `
        );

        const report = await resetWorkspaceData(
          createSqliteQueryable(dbPath),
          "reset-ws"
        );

        expect(report.rows_deleted).toBeGreaterThan(0);
        for (const table of [
          "graph_rule_events",
          "graph_rule_evaluations",
          "graph_gap_rules",
          "quality_remediation_action",
          "quality_convergence_run",
          "ontology_values",
          "ontology_dimensions",
          "ontology_namespaces",
          "ontology_entities_raw",
          "ontology_relations_raw",
          "ontology_triples_raw",
          "ontology_entity_types",
          "ontology_edge_types",
          "ontologies",
          "facet_postings",
          "facet_deltas",
          "facet_value_nodes",
          "facet_definitions",
          "facet_tables",
          "source_mappings",
          "structured_import_provenance",
          "table_semantics"
        ]) {
          expect(report.tables_cleared.map((entry) => entry.table)).toContain(
            table
          );
        }

        expectSqliteCount(
          dbPath,
          `SELECT COUNT(*) AS count
           FROM workspaces
           WHERE workspace_id = 'reset-ws'`,
          1
        );
        expectSqliteCount(
          dbPath,
          `SELECT COUNT(*) AS count
           FROM agent_facts
           WHERE workspace_id = 'other-ws'`,
          1
        );
        expectSqliteCount(
          dbPath,
          `SELECT COUNT(*) AS count
           FROM agent_facts
           WHERE workspace_id = 'reset-ws'`,
          0
        );
        expectSqliteCount(
          dbPath,
          `SELECT COUNT(*) AS count
           FROM ontologies
           WHERE workspace_id = 'reset-ws'`,
          0
        );
        expectSqliteCount(
          dbPath,
          `SELECT COUNT(*) AS count
           FROM quality_convergence_run
           WHERE workspace_id = 'reset-ws'`,
          0
        );
        expectSqliteCount(
          dbPath,
          `SELECT COUNT(*) AS count
           FROM table_semantics
           WHERE workspace_id = 'reset-ws'`,
          0
        );
      } finally {
        rmSync(tmpDir, { force: true, recursive: true });
      }
    });
  });
});

describe("ghostcrab_workspace_delete", () => {
  it("requires confirm: true", async () => {
    const ctx = makeContext();
    await expect(
      workspaceDeleteTool.handler({ workspace_id: "test-ws" }, ctx)
    ).rejects.toThrow();
  });

  it("refuses the default workspace", async () => {
    const ctx = makeContext();
    const result = await workspaceDeleteTool.handler(
      { workspace_id: "default", confirm: true },
      ctx
    );
    const data = JSON.parse(
      (result.content[0] as { text: string }).text
    ) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect((data.error as { code: string }).code).toBe("protected_workspace");
  });
});
