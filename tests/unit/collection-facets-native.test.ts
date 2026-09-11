/** Opt-in integration with a test-owned native process and temporary SQLite. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import {
  createDatabaseClient,
  type DatabaseClient
} from "../../src/db/client.js";
import { resolveGhostcrabConfig } from "../../src/config/env.js";
import { runStandaloneReindexAll } from "../../src/db/standalone-mindbrain.js";
import { combinedSearchTool } from "../../src/tools/search/combined-search.js";
import { collectionFacetSearchTool } from "../../src/tools/facets/collection-search.js";
import { createToolContext } from "../helpers/tool-context.js";

const binary = process.env.MINDBRAIN_TEST_BINARY;
describe.skipIf(!binary)("native collection facet lifecycle", () => {
  let directory: string, child: ChildProcess, url: string, db: DatabaseClient;
  async function stop() {
    await db?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve())
      );
      child.kill("SIGTERM");
      await exited;
    }
  }
  async function start() {
    child = spawn(
      binary!,
      ["--db", join(directory, "facets.sqlite"), "--addr", new URL(url).host],
      { stdio: "ignore" }
    );
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(url + "/health")).ok) {
          ready = true;
          break;
        }
      } catch {
        /* starting */
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) throw Error("Test-owned native server did not start");
    db = createDatabaseClient({
      ...resolveGhostcrabConfig(),
      mindbrainUrl: url,
      mindbrainHttpTimeoutMs: 10000
    });
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "personal-facet-native-"));
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.stubEnv("GHOSTCRAB_MINDBRAIN_URL", url);
    await start();
  }, 15000);
  afterAll(async () => {
    await stop();
    vi.unstubAllEnvs();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  async function search(filters: Record<string, unknown> = {}) {
    const result = await collectionFacetSearchTool.handler(
      {
        workspace_id: "ws",
        collection_id: "facet-native-docs",
        namespace: "topic",
        dimension: "category",
        ...filters
      },
      createToolContext(db)
    );
    expect(result.isError).not.toBe(true);
    return result.structuredContent as {
      source: string;
      returned: number;
      matches: Array<Record<string, unknown>>;
    };
  }
  const rebuild = () =>
    runStandaloneReindexAll({
      mindbrainUrl: url,
      workspaceId: "ws",
      collectionId: "facet-native-docs",
      tableId: 7007
    });

  it("upgrades existing originals, filters bitmap targets, preserves late writes through restart", async () => {
    await db.query(
      "INSERT INTO workspaces(id,workspace_id,label) VALUES ('ws','ws','ws')"
    );
    await db.query(
      "INSERT INTO collections(collection_id,workspace_id,name,key_kind,chunk_bits) VALUES ('facet-native-docs','ws','docs','integer',8)"
    );
    await db.query(
      "INSERT INTO ontologies(ontology_id,workspace_id,name) VALUES ('a','ws','a'),('b','ws','b')"
    );
    await db.query(
      "INSERT INTO documents_raw(workspace_id,collection_id,doc_id,content) VALUES ('ws','facet-native-docs',1,'example')"
    );
    await db.query(
      "INSERT INTO chunks_raw(workspace_id,collection_id,doc_id,chunk_index,content) VALUES ('ws','facet-native-docs',1,0,'first'),('ws','facet-native-docs',1,1,'second')"
    );
    await db.query(
      "INSERT INTO table_semantics(table_id,workspace_id,table_schema,table_name) VALUES (7007,'ws','public','facet-native-docs')"
    );
    await db.query(
      "INSERT INTO facet_tables(table_id,schema_name,table_name,chunk_bits) VALUES (7007,'public','facet-native-docs',8)"
    );
    await db.query(`INSERT INTO facet_assignments_raw(workspace_id,collection_id,target_kind,doc_id,chunk_index,ontology_id,namespace,dimension,value,weight,source) VALUES
      ('ws','facet-native-docs','chunk',1,0,'a','topic','category','shared',0.4,'a-source'),
      ('ws','facet-native-docs','chunk',1,0,'b','topic','category','shared',0.9,'b-source'),
      ('ws','facet-native-docs','chunk',1,1,'a','topic','category','other',0.6,NULL),
      ('ws','facet-native-docs','doc',9007199254740993,-1,'a','topic','category','large',0.5,'large'),
      ('ws','facet-native-docs','doc',-1,-1,'a','topic','category','unsigned',0.5,'unsigned')`);
    // Recreate the old schema shape with existing originals, then let startup
    // apply only the additive projection objects. No user data is involved.
    for (const trigger of ["insert", "update", "delete"])
      await db.query(`DROP TRIGGER collection_facet_dirty_${trigger}`);
    for (const table of [
      "collection_facet_postings",
      "collection_facet_targets",
      "collection_facet_index_state"
    ])
      await db.query(`DROP TABLE ${table}`);
    await stop();
    await start();
    expect((await search({ chunk_index: 0 })).source).toBe(
      "facet_assignments_raw"
    );
    expect(
      await db.query("SELECT table_name FROM facet_tables WHERE table_id=7007")
    ).toEqual([{ table_name: "facet-native-docs" }]);
    expect((await rebuild()).facet_assignments).toBe(5);
    const exact = await search({
      target_kind: "chunk",
      doc_id: 1,
      chunk_index: 0,
      ontology_id: "a",
      limit: 1
    });
    expect(exact).toMatchObject({
      source: "facet_postings",
      returned: 1,
      matches: [
        {
          target_kind: "chunk",
          doc_id: 1,
          chunk_index: 0,
          ontology_id: "a",
          value: "shared",
          weight: expect.closeTo(0.4),
          assignment_source: "a-source"
        }
      ]
    });
    const combined = await combinedSearchTool.handler(
      {
        workspace_id: "ws",
        collection_id: "facet-native-docs",
        query: "shared",
        collection_facet_table_id: 7007,
        collection_facet_namespace: "topic",
        collection_facet_dimension: "category"
      },
      createToolContext(db)
    );
    const combinedFacts = (
      combined.structuredContent as {
        facets: {
          fallback_facts: Array<{
            id: string;
            facets: Record<string, unknown>;
          }>;
        };
      }
    ).facets.fallback_facts;
    expect(combinedFacts).toHaveLength(2);
    expect(new Set(combinedFacts.map((row) => row.id)).size).toBe(2);
    expect(combinedFacts.map((row) => row.facets.ontology_id).sort()).toEqual([
      "a",
      "b"
    ]);
    expect(await search({ doc_id: "18446744073709551615" })).toMatchObject({
      source: "facet_postings",
      returned: 1,
      matches: [{ doc_id: "18446744073709551615" }]
    });
    const large = await search({ doc_id: "9007199254740993" });
    expect(large).toMatchObject({
      source: "facet_postings",
      returned: 1,
      matches: [{ doc_id: "9007199254740993", chunk_index: null }]
    });
    await stop();
    await start();
    expect((await search({ chunk_index: 0 })).source).toBe("facet_postings");
    await Promise.all([
      rebuild(),
      db.query(
        "INSERT INTO facet_assignments_raw(workspace_id,collection_id,target_kind,doc_id,chunk_index,ontology_id,namespace,dimension,value) VALUES ('ws','facet-native-docs','chunk',1,1,'b','topic','category','late')"
      )
    ]);
    expect((await search({ value: "late", chunk_index: 1 })).returned).toBe(1);
    // Force a committed late edit after rebuild; restart must retain dirty state.
    await rebuild();
    await db.query(
      "UPDATE facet_assignments_raw SET value='edited' WHERE value='late'"
    );
    await stop();
    await start();
    expect(await search({ value: "edited", ontology_id: "b" })).toMatchObject({
      source: "facet_assignments_raw",
      returned: 1
    });
    await rebuild();
    expect(await search({ value: "edited", ontology_id: "b" })).toMatchObject({
      source: "facet_postings",
      returned: 1
    });
    await db.query("DELETE FROM facet_assignments_raw WHERE workspace_id='ws'");
    await rebuild();
    expect(await search()).toMatchObject({
      source: "facet_postings",
      returned: 0
    });
  }, 30000);
});
