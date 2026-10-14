import { beforeEach, afterEach, describe, it, expect } from "vitest";
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
      ).structuredContent as any;
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
