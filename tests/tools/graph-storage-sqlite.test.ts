import type { SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Queryable } from "../../src/db/client.js";
import {
  findGraphRelationByEndpoints,
  resolveGraphEntityId,
  upsertGraphEntity,
  upsertGraphRelation,
  upsertGraphRelationProperties,
  setGraphEntityWorkspaceId
} from "../../src/db/graph.js";
import {
  createRealSqlite,
  loadSqliteDatabase
} from "../helpers/real-sqlite.js";

describe.skipIf(!loadSqliteDatabase())(
  "graph storage boundaries on SQLite",
  () => {
    let fixture: ReturnType<typeof createRealSqlite>;
    let database: Queryable;
    const input = {
      nodeId: "boundary",
      nodeType: "Session",
      label: "Session",
      properties: { synthetic: true },
      schemaId: "schema:session"
    };
    beforeEach(() => {
      fixture = createRealSqlite();
      // Preserve SQLite integers exactly so the production binding guard is tested,
      // rather than Node's own out-of-range conversion error.
      database = {
        async query<T>(
          sql: string,
          params: readonly unknown[] = []
        ): Promise<T[]> {
          const statement = fixture.sqlite.prepare(sql);
          statement.setReadBigInts(true);
          if (/^\s*(select|with)/i.test(sql))
            return statement.all(...(params as SQLInputValue[])) as T[];
          statement.run(...(params as SQLInputValue[]));
          return [];
        }
      };
    });
    afterEach(() => fixture?.sqlite.close());

    it("changes only the selected runtime entity scope and preserves its metadata", async () => {
      fixture.sqlite.exec(
        "INSERT INTO graph_entity(entity_id,workspace_id,entity_type,name,metadata_json) VALUES(1,'a','entity','first','{\"keep\":1}'),(2,'a','entity','second','{\"keep\":2}')"
      );
      await setGraphEntityWorkspaceId(database, 1n, "b");
      expect(
        fixture.sqlite
          .prepare(
            "SELECT entity_id,workspace_id,metadata_json FROM graph_entity ORDER BY entity_id"
          )
          .all()
      ).toEqual([
        { entity_id: 1, workspace_id: "b", metadata_json: '{"keep":1}' },
        { entity_id: 2, workspace_id: "a", metadata_json: '{"keep":2}' }
      ]);
    });
    it("an empty typed-property batch leaves even an absent relation untouched", async () => {
      await upsertGraphRelationProperties(
        database,
        "absent",
        10n,
        { label: "REUSES", properties: {}, sourceId: 1n, targetId: 2n },
        []
      );
      for (const table of [
        "relations_raw",
        "graph_relation",
        "workspaces",
        "ontologies"
      ])
        expect(
          fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()
        ).toEqual({ n: 0 });
    });
    it.each([undefined, 0, 0.5])(
      "typed properties preserve confidence %s and their typed value",
      async (confidence) => {
        const sourceId = await upsertGraphEntity(database, input);
        const targetId = await upsertGraphEntity(database, {
          ...input,
          nodeId: "target"
        });
        const relation = {
          label: "REUSES",
          properties: { retained: true },
          sourceId,
          targetId,
          confidence
        };
        const id = await upsertGraphRelation(database, relation);
        await upsertGraphRelationProperties(
          database,
          "default",
          BigInt(id),
          relation,
          [
            {
              property_key: "reason",
              value_type: "text",
              value_text: "verified"
            }
          ]
        );
        expect(
          fixture.sqlite.prepare("SELECT confidence FROM relations_raw").get()
        ).toEqual({ confidence: confidence ?? 1 });
        for (const table of [
          "graph_relation_property",
          "relation_properties_raw"
        ])
          expect(
            fixture.sqlite.prepare(`SELECT value_text FROM ${table}`).get()
          ).toEqual({ value_text: "verified" });
      }
    );
    it.each([
      BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      BigInt(Number.MIN_SAFE_INTEGER) - 1n
    ])(
      "refuses an existing unbindable id %s without overwriting its data",
      async (id) => {
        fixture.sqlite
          .prepare(
            "INSERT INTO graph_entity(entity_id, entity_type, name, metadata_json) VALUES (?, 'entity', 'boundary', ?)"
          )
          .run(id, '{"preserve":true}');
        await expect(upsertGraphEntity(database, input)).rejects.toThrow(
          "exceeds JavaScript safe integer range"
        );
        expect(
          fixture.sqlite.prepare("SELECT metadata_json FROM graph_entity").get()
        ).toEqual({ metadata_json: '{"preserve":true}' });
        expect(
          fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM entities_raw").get()
        ).toEqual({ n: 0 });
      }
    );

    it.each([BigInt(Number.MAX_SAFE_INTEGER), BigInt(Number.MIN_SAFE_INTEGER)])(
      "keeps bindable boundary id %s, schema, default scope and aliases",
      async (id) => {
        fixture.sqlite
          .prepare(
            "INSERT INTO graph_entity(entity_id, entity_type, name) VALUES (?, 'entity', 'boundary')"
          )
          .run(id);
        expect(await upsertGraphEntity(database, input)).toBe(id);
        for (const table of ["graph_entity", "entities_raw"]) {
          const row = fixture.sqlite
            .prepare(`SELECT metadata_json FROM ${table}`)
            .get()!;
          expect(JSON.parse(String(row.metadata_json))).toEqual({
            synthetic: true,
            node_type: "Session",
            label: "Session",
            schema_id: "schema:session",
            workspace_id: "default"
          });
        }
        expect(
          fixture.sqlite.prepare("SELECT ontology_id FROM entities_raw").get()
        ).toEqual({ ontology_id: "default::ghostcrab_learn" });
        expect(
          fixture.sqlite.prepare("SELECT source_kind FROM ontologies").get()
        ).toEqual({ source_kind: "constructed" });
        expect(
          fixture.sqlite.prepare("SELECT term FROM graph_entity_alias").all()
        ).toEqual([{ term: "boundary" }]);
      }
    );

    it("refuses an exhausted safe id range instead of allocating an unsafe id", async () => {
      fixture.sqlite
        .prepare(
          "INSERT INTO graph_entity(entity_id, entity_type, name) VALUES (?, 'entity', 'last-safe-slot')"
        )
        .run(Number.MAX_SAFE_INTEGER - 1);
      await expect(upsertGraphEntity(database, input)).rejects.toThrow(
        "Could not allocate safe graph_entity.entity_id"
      );
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM graph_entity").get()
      ).toEqual({ n: 1 });
    });

    it("allocates below legacy large ids and returns the exact relation identity", async () => {
      fixture.sqlite
        .prepare(
          "INSERT INTO graph_entity(entity_id, entity_type, name) VALUES (?, 'entity', 'legacy')"
        )
        .run(BigInt(Number.MAX_SAFE_INTEGER));
      const sourceId = await upsertGraphEntity(database, input);
      const targetId = await upsertGraphEntity(database, {
        ...input,
        nodeId: "target"
      });
      expect(sourceId).toBe(1n);
      expect(targetId).toBe(2n);
      expect(await resolveGraphEntityId(database, input.nodeId)).toBe(sourceId);
      const id = await upsertGraphRelation(database, {
        label: "REUSES",
        properties: {},
        sourceId,
        targetId
      });
      expect(
        await findGraphRelationByEndpoints(database, {
          sourceName: input.nodeId,
          targetName: "target",
          label: "REUSES"
        })
      ).toEqual({ id });
      for (const table of ["graph_relation", "relations_raw"])
        expect(
          fixture.sqlite
            .prepare(`SELECT confidence, workspace_id FROM ${table}`)
            .get()
        ).toEqual({ confidence: 1, workspace_id: "default" });
    });
  }
);
