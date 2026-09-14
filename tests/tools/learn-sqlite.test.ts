import { afterEach, beforeEach, describe, expect, it } from "vitest";

import fc from "fast-check";
import { runSqlGraphReindex } from "../../src/db/graph-reindex-sql.js";
import {
  createRealSqlite,
  loadSqliteDatabase
} from "../helpers/real-sqlite.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
import { createToolContext } from "../helpers/tool-context.js";

const SqliteDatabase = loadSqliteDatabase();

// Node 20 remains supported. CI also runs this suite in a dedicated Node 22 job
// that requires node:sqlite, so unavailable SQLite cannot silently pass the gate.
describe.skipIf(!SqliteDatabase)("ghostcrab_learn on real SQLite", () => {
  let sqlite: ReturnType<typeof createRealSqlite>["sqlite"];
  let context: ReturnType<typeof createToolContext>;
  const workspace = "session-reuse";
  const properties = {
    scenario_id: "architecte-session-reuse",
    synthetic: true,
    started_at: "2026-09-14T09:00:00Z",
    completed_at: "2026-09-14T09:30:00Z",
    business_result: { status: "validated", reused_sessions: 3 }
  };
  const edge = { source: "session:a", target: "session:b", label: "REUSES" };
  const node = (id: string) => ({
    id,
    node_type: "Session",
    label: `Architecture ${id}`,
    properties
  });
  const learn = (args: Record<string, unknown>) =>
    learnTool.handler({ workspace_id: workspace, ...args }, context);
  const rows = (table: string, workspaceId = workspace) =>
    sqlite
      .prepare(`SELECT * FROM ${table} WHERE workspace_id = ? ORDER BY name`)
      .all(workspaceId);
  const snapshot = (workspaceId = workspace) => ({
    graph: rows("graph_entity", workspaceId),
    raw: rows("entities_raw", workspaceId)
  });
  const filteredNames = () =>
    sqlite
      .prepare(
        `
      SELECT name FROM graph_entity
      WHERE workspace_id = ?
        AND json_extract(metadata_json, '$.scenario_id') = ?
        AND json_extract(metadata_json, '$.synthetic') = 1
      ORDER BY name
    `
      )
      .all(workspace, properties.scenario_id)
      .map((row) => row.name);

  beforeEach(() => {
    const fixture = createRealSqlite();
    sqlite = fixture.sqlite;
    const database = fixture.database;
    context = createToolContext(database);
  });

  afterEach(() => sqlite?.close());

  it("uses session scope and preserves node acknowledgements, aliases and typed edge values", async () => {
    context.session.workspace_id = workspace;
    for (const id of [edge.source, edge.target]) {
      const result = await learnTool.handler({ node: node(id) }, context);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        tool: "ghostcrab_learn",
        workspace_id: workspace,
        node: { learned: true, id }
      });
    }
    const relation_properties = [
      { property_key: "reason", value_type: "text", value_text: "" },
      { property_key: "score", value_type: "number", value_number: 0 },
      {
        property_key: "cost",
        value_type: "money_minor",
        value_integer: 0,
        currency: "EUR"
      }
    ];
    for (const updating of [false, true]) {
      const result = await learnTool.handler(
        { edge: { ...edge, weight: 0, relation_properties } },
        context
      );
      expect(result.structuredContent).toMatchObject({
        ok: true,
        tool: "ghostcrab_learn",
        workspace_id: workspace,
        edge: {
          learned: true,
          label: edge.label,
          relation_properties_count: 3,
          [updating ? "updated" : "created"]: true
        }
      });
      for (const table of [
        "graph_relation_property",
        "relation_properties_raw"
      ]) {
        const actual = sqlite
          .prepare(`SELECT * FROM ${table} ORDER BY property_key`)
          .all();
        expect(actual).toHaveLength(3);
        for (const property of relation_properties)
          expect(
            actual.find((row) => row.property_key === property.property_key)
          ).toMatchObject(property);
      }
      for (const table of ["graph_relation", "relations_raw"])
        expect(sqlite.prepare(`SELECT confidence FROM ${table}`).get()).toEqual(
          { confidence: 0 }
        );
    }
    expect(
      sqlite
        .prepare(
          "SELECT a.term, e.name FROM graph_entity_alias a JOIN graph_entity e USING(entity_id) ORDER BY a.term"
        )
        .all()
    ).toEqual([
      { term: edge.source, name: edge.source },
      { term: edge.target, name: edge.target }
    ]);
  });

  it.each(["graph_entity", "graph_relation"])(
    "rejects a silently ignored %s insert instead of reporting success",
    async (table) => {
      const before = snapshot();
      sqlite.exec(
        `CREATE TEMP TRIGGER ignore_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END`
      );
      await expect(learn({ edge })).rejects.toThrow(
        table === "graph_entity"
          ? "Failed to create graph entity"
          : "Failed to create graph relation"
      );
      expect(snapshot()).toEqual(before);
    }
  );

  it.each([
    { value_type: "text", currency: "EUR", value_text: "x" },
    { value_type: "text" },
    { value_type: "number" },
    { value_type: "date_unix" },
    { value_type: "doc_ref" },
    { value_type: "number", value_number: 1, value_text: "x" },
    { value_type: "text", value_text: "x", value_number: 1 },
    { value_type: "text", value_text: "x", value_integer: 1 },
    { value_type: "text", value_text: "x", ref_doc_id: 1 }
  ])(
    "rejects incompatible typed property %j before writing",
    async (property) => {
      const before = snapshot();
      await expect(
        learn({
          edge: {
            ...edge,
            relation_properties: [{ property_key: "invalid", ...property }]
          }
        })
      ).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    }
  );

  it.each(["graph_relation", "relations_raw", "relation_properties_raw"])(
    "rolls back nodes and relations when writing %s fails",
    async (table) => {
      await learn({ node: node(edge.source) });
      const before = snapshot();
      sqlite.exec(`CREATE TEMP TRIGGER reject_write BEFORE INSERT ON ${table}
        BEGIN SELECT RAISE(ABORT, 'injected write failure'); END`);

      await expect(
        learn({
          node: { ...node(edge.source), properties: { changed: true } },
          edge: {
            ...edge,
            relation_properties: [
              {
                property_key: "reason",
                value_type: "text",
                value_text: "reuse"
              }
            ]
          }
        })
      ).rejects.toThrow("injected write failure");

      expect(snapshot()).toEqual(before);
      for (const relationTable of [
        "graph_relation",
        "relations_raw",
        "graph_relation_property",
        "relation_properties_raw"
      ]) {
        expect(
          sqlite.prepare(`SELECT COUNT(*) AS n FROM ${relationTable}`).get()
        ).toEqual({ n: 0 });
      }
    }
  );

  it("reindexes repeatedly without changing canonical data or another workspace", async () => {
    for (const workspace_id of [workspace, "unrelated"]) {
      await learn({ workspace_id, node: node(edge.source) });
      await learn({ workspace_id, node: node(edge.target) });
      await learn({ workspace_id, edge });
    }
    const before = snapshot();
    const unrelated = snapshot("unrelated");
    const rawRelations = sqlite
      .prepare("SELECT * FROM relations_raw ORDER BY relation_id")
      .all();
    for (let i = 0; i < 2; i++) {
      await context.database.transaction((db) =>
        runSqlGraphReindex(db, {
          workspaceId: workspace,
          includeDocumentLinks: false,
          includeChunkLinks: false
        })
      );
      expect(snapshot().raw).toEqual(before.raw);
      expect(
        snapshot().graph.map(({ metadata_json, entity_id }) => ({
          metadata_json,
          entity_id
        }))
      ).toEqual(
        before.graph.map(({ metadata_json, entity_id }) => ({
          metadata_json,
          entity_id
        }))
      );
      expect(snapshot("unrelated")).toEqual(unrelated);
      expect(
        sqlite.prepare("SELECT * FROM relations_raw ORDER BY relation_id").all()
      ).toEqual(rawRelations);
      expect(filteredNames()).toEqual([edge.source, edge.target]);
    }
  });

  it("preserves a simple independent state model across generated write/link sequences", async () => {
    const operation = fc.record({
      kind: fc.constantFrom("node", "edge"),
      workspace: fc.constantFrom("generated-a", "generated-b"),
      source: fc.constantFrom("n0", "n1", "n2"),
      target: fc.constantFrom("n0", "n1", "n2"),
      payload: fc.jsonValue()
    });
    await fc.assert(
      fc.asyncProperty(
        fc.array(operation, { minLength: 1, maxLength: 25 }),
        async (operations) => {
          const fixture = createRealSqlite();
          const generatedContext = createToolContext(fixture.database);
          const expected = new Map<string, Record<string, unknown>>();
          try {
            for (const op of operations) {
              if (op.kind === "node") {
                const written = {
                  ...node(op.source),
                  properties: { ...properties, payload: op.payload }
                };
                await learnTool.handler(
                  { workspace_id: op.workspace, node: written },
                  generatedContext
                );
                expected.set(`${op.workspace}/${op.source}`, {
                  ...written.properties,
                  node_type: written.node_type,
                  label: written.label,
                  schema_id: null,
                  workspace_id: op.workspace
                });
              } else {
                await learnTool.handler(
                  {
                    workspace_id: op.workspace,
                    edge: {
                      source: op.source,
                      target: op.target,
                      label: "REUSES"
                    }
                  },
                  generatedContext
                );
                for (const id of [op.source, op.target]) {
                  const key = `${op.workspace}/${id}`;
                  if (!expected.has(key))
                    expected.set(key, {
                      node_type: "unknown",
                      label: id,
                      schema_id: null,
                      workspace_id: op.workspace
                    });
                }
              }
              for (const table of ["graph_entity", "entities_raw"]) {
                const actual = fixture.sqlite
                  .prepare(
                    `SELECT name, workspace_id, metadata_json FROM ${table}`
                  )
                  .all();
                expect(actual).toHaveLength(expected.size);
                for (const row of actual) {
                  expect(JSON.parse(String(row.metadata_json))).toEqual(
                    expected.get(`${row.workspace_id}/${row.name}`)
                  );
                }
              }
            }
          } finally {
            fixture.sqlite.close();
          }
        }
      ),
      { seed: 20260914, numRuns: 75 }
    );
  });

  it.each([false, true])(
    "preserves both endpoints and metadata filters when updating=%s",
    async (updating) => {
      if (updating) await learn({ edge });
      await learn({ node: node(edge.source) });
      await learn({ node: node(edge.target) });
      const before = snapshot();
      expect(filteredNames()).toEqual([edge.source, edge.target]);

      const result = await learn({
        edge: { ...edge, weight: 0.8, properties: { reason: "reuse" } }
      });

      expect(result.structuredContent).toMatchObject({
        ok: true,
        edge: { [updating ? "updated" : "created"]: true }
      });
      expect(snapshot()).toEqual(before);
      expect(filteredNames()).toEqual([edge.source, edge.target]);
      const relations = sqlite
        .prepare("SELECT * FROM graph_relation WHERE workspace_id = ?")
        .all(workspace);
      expect(relations).toHaveLength(1);
      expect(relations[0]).toMatchObject({
        source_id: before.graph[0].entity_id,
        target_id: before.graph[1].entity_id
      });
      expect(JSON.parse(String(relations[0].metadata_json))).toEqual({
        reason: "reuse",
        weight: 0.8
      });
      expect(
        sqlite
          .prepare(
            "SELECT metadata_json FROM relations_raw WHERE workspace_id = ?"
          )
          .get(workspace)
      ).toEqual({ metadata_json: relations[0].metadata_json });
    }
  );

  it.each(["source", "target"] as const)(
    "creates a missing endpoint and preserves the existing %s",
    async (existing) => {
      const id = edge[existing];
      await learn({ node: node(id) });
      const before = snapshot();

      await learn({ edge });

      const after = snapshot();
      for (const layer of ["graph", "raw"] as const) {
        expect(after[layer]).toHaveLength(2);
        expect(after[layer].find((row) => row.name === id)).toEqual(
          before[layer][0]
        );
        const placeholder = after[layer].find((row) => row.name !== id)!;
        expect(JSON.parse(String(placeholder.metadata_json))).toEqual({
          node_type: "unknown",
          label: placeholder.name,
          schema_id: null,
          workspace_id: workspace
        });
      }
    }
  );

  it.each([false, true])(
    "keeps an explicit node write in a combined node/edge call when updating=%s",
    async (updating) => {
      if (updating)
        await learn({
          node: {
            ...node(edge.source),
            label: "Previous label",
            properties: { previous: true }
          }
        });

      await learn({ node: node(edge.source), edge });

      for (const table of ["graph_entity", "entities_raw"]) {
        const source = rows(table).find((row) => row.name === edge.source)!;
        expect(JSON.parse(String(source.metadata_json))).toEqual({
          ...properties,
          node_type: "Session",
          label: node(edge.source).label,
          schema_id: null,
          workspace_id: workspace
        });
      }
      expect(filteredNames()).toEqual([edge.source]);
    }
  );

  it("preserves a node when creating a self-relation", async () => {
    await learn({ node: node(edge.source) });
    const before = snapshot();

    await learn({ edge: { ...edge, target: edge.source } });

    expect(snapshot()).toEqual(before);
    expect(
      sqlite
        .prepare(
          "SELECT source_id, target_id FROM graph_relation WHERE workspace_id = ?"
        )
        .get(workspace)
    ).toEqual({
      source_id: before.graph[0].entity_id,
      target_id: before.graph[0].entity_id
    });
  });

  it("creates both absent endpoints in the requested workspace without reusing another workspace's nodes", async () => {
    const otherWorkspace = "other-sessions";
    for (const id of [edge.source, edge.target])
      await learn({ workspace_id: otherWorkspace, node: node(id) });
    const otherBefore = snapshot(otherWorkspace);
    context.session.workspace_id = otherWorkspace;

    await learn({ edge });

    expect(snapshot(otherWorkspace)).toEqual(otherBefore);
    const created = snapshot();
    expect(created.graph).toHaveLength(2);
    expect(created.raw).toHaveLength(2);
    for (const row of created.graph) {
      expect(otherBefore.graph.map((other) => other.entity_id)).not.toContain(
        row.entity_id
      );
      expect(JSON.parse(String(row.metadata_json))).toEqual({
        node_type: "unknown",
        label: row.name,
        schema_id: null,
        workspace_id: workspace
      });
    }
    expect(
      sqlite
        .prepare(
          "SELECT source_id, target_id FROM graph_relation WHERE workspace_id = ?"
        )
        .get(workspace)
    ).toEqual({
      source_id: created.graph[0].entity_id,
      target_id: created.graph[1].entity_id
    });
  });
});
