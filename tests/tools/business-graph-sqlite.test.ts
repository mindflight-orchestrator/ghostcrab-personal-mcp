import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createDatabaseClient } from "../../src/db/client.js";
vi.mock("../../src/db/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/db/client.js")>()),
  createDatabaseClient: vi.fn()
}));
import "../../src/tools/dgraph/business-records.js";
import { getRegisteredTool } from "../../src/tools/registry.js";
import {
  createRealSqlite,
  loadSqliteDatabase
} from "../helpers/real-sqlite.js";
import { createToolContext } from "../helpers/tool-context.js";
describe.skipIf(!loadSqliteDatabase())(
  "business graph exact identities",
  () => {
    let fixture: ReturnType<typeof createRealSqlite>;
    beforeEach(() => {
      fixture = createRealSqlite();
      vi.mocked(createDatabaseClient).mockReturnValue(fixture.database);
      fixture.sqlite.exec(`
        INSERT INTO workspaces(id,workspace_id,label) VALUES('ws-a','ws-a','A'),('ws-b','ws-b','B');
        INSERT INTO ontologies(ontology_id,workspace_id,name,source_kind) VALUES('model-a','ws-a','A','constructed');
        INSERT INTO ontology_entity_types(ontology_id,entity_type) VALUES('model-a','building');
        INSERT INTO entities_raw(entity_id,workspace_id,ontology_id,external_id,entity_type,name,metadata_json)
          VALUES(1,'ws-a','model-a','B1','building','B1','{"address":"Rue A","label":"Bâtiment A"}');
      `);
      fixture.sqlite
        .prepare(
          `INSERT INTO graph_entity(entity_id,workspace_id,entity_type,name,metadata_json) VALUES(1,'ws-a','building','B1','{"address":"Rue A","label":"Bâtiment A"}')`
        )
        .run();
      fixture.sqlite
        .prepare(
          `INSERT INTO graph_entity(entity_id,workspace_id,entity_type,name,metadata_json) VALUES(2,'ws-b','building','B2','{"address":"Rue B"}')`
        )
        .run();
    });
    afterEach(() => fixture.sqlite.close());
    async function call(action: string, args: Record<string, unknown>) {
      return (
        await getRegisteredTool(`ghostcrab_graph_record_${action}`)!.handler(
          args,
          createToolContext(fixture.database)
        )
      ).structuredContent as {
        ok: boolean;
        found?: boolean;
        node: {
          id: string;
          version: string;
          label: string;
          properties: Record<string, unknown>;
        };
        error?: { code: string };
      };
    }
    it("gets only exact business workspace/type/id and opaque stable content version", async () => {
      const got = await call("get", {
        workspace_id: "ws-a",
        node_type: "building",
        id: "1"
      });
      expect(got).toMatchObject({
        found: true,
        node: {
          id: "1",
          node_type: "building",
          label: "Bâtiment A",
          properties: { address: "Rue A" }
        }
      });
      expect(got.node.properties).not.toHaveProperty("label");
      expect(got.node.version).toMatch(/^[a-f0-9]{64}$/);
      expect(
        (
          await call("get", {
            workspace_id: "ws-a",
            node_type: "building",
            id: "1"
          })
        ).node.version
      ).toBe(got.node.version);
      for (const change of [
        { workspace_id: "ws-b" },
        { node_type: "unit" },
        { id: "2" }
      ])
        expect(
          await call("get", {
            workspace_id: "ws-a",
            node_type: "building",
            id: "1",
            ...change
          })
        ).toMatchObject({ found: false, node: null });
    });
    it("creates only declared types and rejects duplicate external identities", async () => {
      const input = {
        workspace_id: "ws-a",
        node_type: "building",
        id: "external-new",
        label: "New",
        properties: { cost: 10 }
      };
      const created = await call("create", input);
      expect(created).toMatchObject({
        ok: true,
        created: true,
        node: { label: "New", properties: { cost: 10 } }
      });
      expect(
        await call("get", {
          ...input,
          id: created.node.id,
          label: undefined,
          properties: undefined
        })
      ).toMatchObject({ ok: false });
      expect(await call("create", input)).toMatchObject({
        error: { code: "id_exists" }
      });
      expect(
        await call("create", { ...input, id: "other", node_type: "unknown" })
      ).toMatchObject({ error: { code: "type_not_found" } });
    });
    it("updates raw and runtime metadata, preserves properties and rejects stale versions", async () => {
      const identity = { workspace_id: "ws-a", node_type: "building", id: "1" };
      const before = await call("get", identity);
      const updated = await call("update", {
        ...identity,
        expected_version: before.node.version,
        label: "Updated",
        properties: { notes: ["note"] }
      });
      expect(updated).toMatchObject({
        ok: true,
        updated: true,
        node: {
          label: "Updated",
          properties: { address: "Rue A", notes: ["note"] }
        }
      });
      expect(
        await call("update", {
          ...identity,
          expected_version: before.node.version,
          label: "Stale"
        })
      ).toMatchObject({ error: { code: "version_conflict" } });
      expect(
        fixture.sqlite
          .prepare("SELECT metadata_json FROM entities_raw WHERE entity_id=1")
          .get()
      ).toEqual(
        fixture.sqlite
          .prepare("SELECT metadata_json FROM graph_entity WHERE entity_id=1")
          .get()
      );
    });
    it("rolls back a create if a later alias write fails", async () => {
      fixture.sqlite.exec(
        "CREATE TRIGGER reject_alias BEFORE INSERT ON graph_entity_alias BEGIN SELECT RAISE(ABORT,'injected'); END"
      );
      expect(
        await call("create", {
          workspace_id: "ws-a",
          node_type: "building",
          id: "new",
          label: "New"
        })
      ).toMatchObject({ ok: false });
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM entities_raw").get()
      ).toEqual({ n: 1 });
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM graph_entity").get()
      ).toEqual({ n: 2 });
    });
    it("rolls back a runtime update if the raw write fails", async () => {
      const identity = { workspace_id: "ws-a", node_type: "building", id: "1" };
      const before = await call("get", identity);
      fixture.sqlite.exec(
        "CREATE TRIGGER reject_raw BEFORE UPDATE ON entities_raw BEGIN SELECT RAISE(ABORT,'injected'); END"
      );
      expect(
        await call("update", {
          ...identity,
          expected_version: before.node.version,
          label: "New"
        })
      ).toMatchObject({ ok: false });
      expect((await call("get", identity)).node).toEqual(before.node);
    });
    it("refuses a deletion with a foreign relation and preserves the node", async () => {
      const identity = { workspace_id: "ws-a", node_type: "building", id: "1" };
      const before = await call("get", identity);
      fixture.sqlite.exec(
        "INSERT INTO graph_relation(relation_id,workspace_id,relation_type,source_id,target_id) VALUES(1,'ws-b','cross',2,1)"
      );
      expect(
        await call("delete", {
          ...identity,
          expected_version: before.node.version
        })
      ).toMatchObject({ error: { code: "foreign_relation" } });
      expect((await call("get", identity)).node).toEqual(before.node);
    });
    it("deletes raw/runtime rows and aliases in the same transaction as adjacency repair", async () => {
      const identity = { workspace_id: "ws-a", node_type: "building", id: "1" };
      const before = await call("get", identity);
      const original = fixture.database.transaction.bind(fixture.database);
      const rebuild = vi.fn(async () => {});
      fixture.database.transaction = (operation) =>
        original((tx) =>
          operation({ ...tx, rebuildBusinessAdjacency: rebuild })
        );
      fixture.sqlite.exec(
        "INSERT INTO entity_aliases_raw(workspace_id,entity_id,term) VALUES('ws-a',1,'Alias'); INSERT INTO graph_entity_alias(entity_id,term) VALUES(1,'Alias')"
      );
      expect(
        await call("delete", {
          ...identity,
          expected_version: before.node.version
        })
      ).toMatchObject({ ok: true, deleted: true });
      expect(rebuild).toHaveBeenCalledWith("ws-a");
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM entities_raw").get()
      ).toEqual({ n: 0 });
      expect(
        fixture.sqlite
          .prepare("SELECT COUNT(*) AS n FROM graph_entity_alias")
          .get()
      ).toEqual({ n: 0 });
      expect(
        await call("delete", {
          ...identity,
          expected_version: before.node.version
        })
      ).toMatchObject({ ok: true, deleted: false });
      expect(
        await call("get", { ...identity, workspace_id: "ws-b", id: "2" })
      ).toMatchObject({ found: true });
    });
    it("rolls back deletion if transactional native adjacency is unavailable", async () => {
      const identity = { workspace_id: "ws-a", node_type: "building", id: "1" };
      const before = await call("get", identity);
      expect(
        await call("delete", {
          ...identity,
          expected_version: before.node.version
        })
      ).toMatchObject({ ok: false });
      expect((await call("get", identity)).node).toEqual(before.node);
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM entities_raw").get()
      ).toEqual({ n: 1 });
    });
    it("does not recycle deleted record identities or accept an old version for a replacement", async () => {
      const input = {
        workspace_id: "ws-a",
        node_type: "building",
        id: "external",
        label: "Same"
      };
      const first = await call("create", input);
      const original = fixture.database.transaction.bind(fixture.database);
      fixture.database.transaction = (operation) =>
        original((tx) =>
          operation({ ...tx, rebuildBusinessAdjacency: async () => {} })
        );
      expect(
        await call("delete", {
          workspace_id: input.workspace_id,
          node_type: input.node_type,
          id: first.node.id,
          expected_version: first.node.version
        })
      ).toMatchObject({ deleted: true });
      const second = await call("create", input);
      expect(Number(second.node.id)).toBeGreaterThan(Number(first.node.id));
      expect(second.node.version).not.toBe(first.node.version);
    });
    it("handles generic graph entities without exposing structural metadata", async () => {
      const meta = JSON.stringify({
        node_type: "building",
        schema_id: "private",
        workspace_id: "ws-a",
        label: "Generic",
        address: "Rue"
      });
      fixture.sqlite
        .prepare(
          "UPDATE graph_entity SET entity_type='entity',metadata_json=? WHERE entity_id=1"
        )
        .run(meta);
      fixture.sqlite
        .prepare(
          "UPDATE entities_raw SET entity_type='entity',metadata_json=? WHERE entity_id=1"
        )
        .run(meta);
      const got = await call("get", {
        workspace_id: "ws-a",
        node_type: "building",
        id: "1"
      });
      expect(got).toMatchObject({
        node: {
          node_type: "building",
          label: "Generic",
          properties: { address: "Rue" }
        }
      });
      expect(got.node.properties).toEqual({ address: "Rue" });
      const created = await call("create", {
        workspace_id: "ws-a",
        node_type: "building",
        id: "new",
        label: "New"
      });
      expect(created).toMatchObject({
        ok: true,
        node: { node_type: "building", label: "New", properties: {} }
      });
      expect(
        fixture.sqlite
          .prepare("SELECT entity_type FROM entities_raw WHERE entity_id=?")
          .get(Number(created.node.id))
      ).toEqual({ entity_type: "entity" });
      expect(vi.mocked(createDatabaseClient)).toHaveBeenLastCalledWith(
        expect.anything(),
        { requireTransactions: true }
      );
      fixture.sqlite.exec(
        "UPDATE graph_entity SET metadata_json='{}' WHERE entity_id=1"
      );
      expect(
        await call("get", {
          workspace_id: "ws-a",
          node_type: "entity",
          id: "1"
        })
      ).toMatchObject({ node: { node_type: "entity", label: "B1" } });
    });
    it("uses a concrete type even when metadata contains a different legacy node_type", async () => {
      fixture.sqlite.exec(
        `UPDATE graph_entity SET metadata_json='{"node_type":"legacy"}' WHERE entity_id=1`
      );
      expect(
        await call("get", {
          workspace_id: "ws-a",
          node_type: "building",
          id: "1"
        })
      ).toMatchObject({ node: { node_type: "building", properties: {} } });
      const created = await call("create", {
        workspace_id: "ws-a",
        node_type: "building",
        id: "concrete",
        label: "Concrete"
      });
      const row = fixture.sqlite
        .prepare("SELECT metadata_json FROM entities_raw WHERE entity_id=?")
        .get(Number(created.node.id)) as { metadata_json: string };
      expect(JSON.parse(row.metadata_json)).toEqual({ label: "Concrete" });
    });
    it("uses the declared type in the requested workspace even without a template node", async () => {
      fixture.sqlite.exec(
        "INSERT INTO ontology_entity_types(ontology_id,entity_type) VALUES('model-a','unit')"
      );
      expect(
        await call("create", {
          workspace_id: "ws-b",
          node_type: "unit",
          id: "foreign",
          label: "Forbidden"
        })
      ).toMatchObject({ error: { code: "type_not_found" } });
      const created = await call("create", {
        workspace_id: "ws-a",
        node_type: "unit",
        id: "first-unit",
        label: "Unit"
      });
      expect(created).toMatchObject({
        ok: true,
        node: { node_type: "unit", label: "Unit" }
      });
      expect(
        fixture.sqlite
          .prepare("SELECT ontology_id FROM entities_raw WHERE entity_id=?")
          .get(Number(created.node.id))
      ).toEqual({ ontology_id: "model-a" });
    });
    it("accepts the complete native id range and refuses overflow before a write", async () => {
      fixture.sqlite.exec(
        "UPDATE sqlite_sequence SET seq=4294967294 WHERE name='entities_raw'"
      );
      const input = {
        workspace_id: "ws-a",
        node_type: "building",
        id: "last",
        label: "Last"
      };
      const last = await call("create", input);
      expect(last).toMatchObject({ ok: true, node: { id: "4294967295" } });
      expect(
        await call("get", {
          workspace_id: "ws-a",
          node_type: "building",
          id: last.node.id
        })
      ).toMatchObject({ found: true });
      for (const id of ["4294967296", "0", "-1", "1.5"])
        expect(
          await call("get", { workspace_id: "ws-a", node_type: "building", id })
        ).toMatchObject({ error: { code: "invalid_id" } });
      expect(await call("create", { ...input, id: "overflow" })).toMatchObject({
        error: { code: "invalid_id" }
      });
      expect(
        fixture.sqlite.prepare("SELECT COUNT(*) AS n FROM entities_raw").get()
      ).toEqual({ n: 2 });
    });
    it("distinguishes an absent node from a node without raw identity", async () => {
      const identity = { workspace_id: "ws-b", node_type: "building", id: "2" };
      const before = await call("get", identity);
      expect(
        await call("update", {
          ...identity,
          expected_version: before.node.version,
          label: "Blocked"
        })
      ).toMatchObject({ error: { code: "raw_identity_missing" } });
      expect(
        await call("update", {
          ...identity,
          id: "99",
          expected_version: before.node.version,
          label: "Absent"
        })
      ).toMatchObject({ error: { code: "not_found" } });
      expect(
        await call("delete", {
          ...identity,
          id: "99",
          expected_version: before.node.version
        })
      ).toMatchObject({ ok: true, deleted: false, found: false });
      expect((await call("get", identity)).node).toEqual(before.node);
    });
    it("preserves omitted labels and updates both alias stores when a label changes", async () => {
      fixture.sqlite.exec(
        "INSERT INTO graph_entity_alias(entity_id,term) VALUES(1,'Bâtiment A'),(1,'independent'); INSERT INTO entity_aliases_raw(workspace_id,entity_id,term) VALUES('ws-a',1,'Bâtiment A'),('ws-a',1,'independent')"
      );
      const identity = { workspace_id: "ws-a", node_type: "building", id: "1" };
      const before = await call("get", identity);
      const unchangedLabel = await call("update", {
        ...identity,
        expected_version: before.node.version,
        properties: { cost: 1 }
      });
      expect(unchangedLabel).toMatchObject({
        ok: true,
        node: { label: before.node.label }
      });
      const after = await call("update", {
        ...identity,
        expected_version: unchangedLabel.node.version,
        label: "New label"
      });
      expect(after.ok).toBe(true);
      for (const table of ["graph_entity_alias", "entity_aliases_raw"])
        expect(
          fixture.sqlite
            .prepare(
              `SELECT term FROM ${table} WHERE entity_id=1 ORDER BY term`
            )
            .all()
        ).toEqual([{ term: "New label" }, { term: "independent" }]);
    });
    it("removes incident relation properties and diagnostics but preserves unrelated rows", async () => {
      fixture.sqlite.exec(`
        INSERT INTO entities_raw(entity_id,workspace_id,ontology_id,external_id,entity_type,name) VALUES(3,'ws-a','model-a','third','building','Third');
        INSERT INTO graph_entity(entity_id,workspace_id,entity_type,name) VALUES(3,'ws-a','building','Third');
        INSERT INTO relations_raw(relation_id,workspace_id,ontology_id,edge_type,source_entity_id,target_entity_id) VALUES(20,'ws-a','model-a','owns',1,3),(21,'ws-a','model-a','owns',3,1),(22,'ws-a','model-a','owns',3,3);
        INSERT INTO graph_relation(relation_id,workspace_id,relation_type,source_id,target_id) VALUES(10,'ws-a','owns',1,3),(11,'ws-a','owns',3,1),(12,'ws-a','owns',3,3);
        INSERT INTO graph_relation_property(relation_id,property_key,value_type,value_text) VALUES(10,'note','text','out'),(11,'note','text','in'),(12,'note','text','keep');
        INSERT INTO relation_properties_raw(workspace_id,relation_id,property_key,value_type,value_text) VALUES('ws-a',20,'note','text','out'),('ws-a',21,'note','text','in'),('ws-a',22,'note','text','keep');
        INSERT INTO graph_gap_rules(rule_id,ontology_id,workspace_id,entity_type,relation_type,direction,label) VALUES('rule','model-a','ws-a','building','owns','out','Rule');
        INSERT INTO graph_rule_evaluations(workspace_id,ontology_id,rule_id,subject_entity_id,state,observed_count,expected_min) VALUES('ws-a','model-a','rule',1,'valid',1,1),('ws-a','model-a','rule',3,'valid',1,1);
        INSERT INTO graph_rule_events(event_id,workspace_id,ontology_id,rule_id,subject_entity_id,from_state,to_state,observed_count,expected_min,idempotency_key) VALUES('event1','ws-a','model-a','rule',1,'unknown','valid',1,1,'key1'),('event3','ws-a','model-a','rule',3,'unknown','valid',1,1,'key3');
      `);
      const identity = { workspace_id: "ws-a", node_type: "building", id: "1" };
      const before = await call("get", identity);
      const original = fixture.database.transaction.bind(fixture.database);
      fixture.database.transaction = (operation) =>
        original((tx) =>
          operation({ ...tx, rebuildBusinessAdjacency: async () => {} })
        );
      expect(
        await call("delete", {
          ...identity,
          expected_version: before.node.version
        })
      ).toMatchObject({ ok: true, deleted: true, found: true, id: "1" });
      for (const table of [
        "graph_relation",
        "relations_raw",
        "graph_relation_property",
        "relation_properties_raw"
      ])
        expect(
          fixture.sqlite.prepare(`SELECT relation_id FROM ${table}`).all()
        ).toEqual([{ relation_id: table.endsWith("raw") ? 22 : 12 }]);
      for (const table of ["graph_rule_evaluations", "graph_rule_events"])
        expect(
          fixture.sqlite.prepare(`SELECT subject_entity_id FROM ${table}`).all()
        ).toEqual([{ subject_entity_id: 3 }]);
      expect(fixture.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual(
        []
      );
    });
    it("rejects structural properties and SQL-shaped opaque IDs before write", async () => {
      expect(
        await call("create", {
          workspace_id: "ws-a",
          node_type: "building",
          id: "new",
          label: "New",
          properties: { workspace_id: "ws-b" }
        })
      ).toMatchObject({ ok: false, error: { code: "reserved_property" } });
      expect(
        await call("get", {
          workspace_id: "ws-a",
          node_type: "building",
          id: "1 OR 1=1"
        })
      ).toMatchObject({ ok: false, error: { code: "invalid_id" } });
    });
  }
);
