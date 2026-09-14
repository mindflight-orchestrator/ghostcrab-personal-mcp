import type { SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Queryable } from "../../src/db/client.js";
import {
  findGraphRelationByEndpoints,
  resolveGraphEntityId,
  upsertGraphEntity,
  upsertGraphRelation
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
