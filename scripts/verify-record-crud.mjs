#!/usr/bin/env node
// Isolated native MCP/SQLite qualification. Uses only disposable synthetic data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(import.meta.dirname, "..");
const binary = resolve(
  process.env.GHOSTCRAB_CRUD_TEST_BINARY ??
    join(root, "cmd/backend/zig-out/bin/ghostcrab-backend")
);
const fixture = await mkdtemp(join(tmpdir(), "ghostcrab-record-crud-"));
const database = join(fixture, "synthetic.sqlite");
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const workspace = "operator-crud-fixture";
const schema = "fixture:task";
const receipt = {
  schema: "ghostcrab/record-crud-native-proof/v1",
  fixture,
  binary,
  checks: []
};
let backend,
  client,
  transport,
  backendLog = "";

async function start() {
  backend = spawn(binary, ["--addr", `127.0.0.1:${port}`, "--db", database], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  for (const stream of [backend.stdout, backend.stderr])
    stream.on("data", (data) => (backendLog += data));
  for (let attempt = 0; attempt < 300; attempt++) {
    assert.equal(backend.exitCode, null, backendLog);
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      /* Owned backend is starting. */
    }
    if (attempt === 299)
      throw new Error("Owned backend did not become healthy");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "dist/index.js")],
    cwd: fixture,
    env: {
      ...process.env,
      HOME: fixture,
      GHOSTCRAB_HOME: fixture,
      GHOSTCRAB_CONFIG_DIR: fixture,
      GHOSTCRAB_DATA_DIR: fixture,
      GHOSTCRAB_SQLITE_PATH: database,
      GHOSTCRAB_MINDBRAIN_URL: url,
      GHOSTCRAB_BOOTSTRAP_SEED: "0",
      GHOSTCRAB_EMBEDDINGS_MODE: "disabled",
      MCP_TELEMETRY: "0"
    },
    stderr: "pipe"
  });
  transport.stderr?.on("data", (data) => (backendLog += data));
  client = new Client({ name: "record-crud-native-fixture", version: "1.0.0" });
  await client.connect(transport);
}
async function stop() {
  if (client) await client.close();
  client = null;
  if (transport) await transport.close();
  transport = null;
  if (backend?.exitCode === null) {
    const stopped = once(backend, "exit");
    backend.kill("SIGTERM");
    await stopped;
  }
}
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  const data =
    result.structuredContent ??
    JSON.parse(result.content.find((c) => c.type === "text").text);
  return data;
}
function inspect(callback) {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return callback(db);
  } finally {
    db.close();
  }
}
const identity = (id) => ({ workspace_id: workspace, schema_id: schema, id });
try {
  await start();
  const created = await call("ghostcrab_remember", {
    workspace_id: workspace,
    schema_id: schema,
    content: "Create synthetic project task",
    facets: { record_id: "task:42", status: "todo" }
  });
  assert.equal(created.ok, true);
  const row = (await call("ghostcrab_record_get", identity(created.id))).row;
  assert.equal(row.version, 1);
  const other = await call("ghostcrab_remember", {
    workspace_id: "other-fixture",
    schema_id: schema,
    content: "Preserve independent data",
    facets: { record_id: "task:foreign" }
  });
  for (const scope of [
    { workspace_id: "other-fixture" },
    { schema_id: "fixture:prospect" }
  ]) {
    assert.equal(
      (
        await call("ghostcrab_record_get", {
          ...identity(created.id),
          ...scope
        })
      ).found,
      false
    );
    assert.equal(
      (
        await call("ghostcrab_record_delete", {
          ...identity(created.id),
          ...scope,
          expected_version: 1
        })
      ).deleted,
      false
    );
  }
  assert.equal(
    (
      await call("ghostcrab_record_delete", {
        ...identity(created.id),
        expected_version: 9
      })
    ).error.code,
    "version_conflict"
  );
  assert.equal(
    (
      await call("ghostcrab_upsert", {
        workspace_id: workspace,
        schema_id: schema,
        match: { id: created.id },
        set_facets: { status: "done" },
        expected_version: 9
      })
    ).error.code,
    "version_conflict"
  );
  assert.equal(
    (await call("ghostcrab_record_get", identity(created.id))).row.version,
    1
  );
  receipt.checks.push(
    "wrong workspace, schema and stale versions do not alter state"
  );
  const updated = await call("ghostcrab_upsert", {
    workspace_id: workspace,
    schema_id: schema,
    match: { id: created.id },
    set_content: "uniquesyntheticcompletiontoken",
    set_facets: { status: "done" },
    expected_version: 1
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.version, 2);
  assert.equal(
    (
      await call("ghostcrab_upsert", {
        workspace_id: workspace,
        schema_id: schema,
        match: { id: created.id },
        set_facets: { status: "todo" },
        expected_version: 1
      })
    ).error.code,
    "version_conflict"
  );
  const doc = inspect(
    (db) =>
      db.prepare("SELECT doc_id FROM agent_facts WHERE id=?").get(created.id)
        .doc_id
  );
  const vector = await fetch(`${url}/api/mindbrain/search-embedding-upsert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ table_id: 1, doc_id: doc, embedding: [1, 0, 0] })
  });
  assert.equal(vector.ok, true, await vector.text());
  const historyBefore = inspect((db) =>
    db
      .prepare(
        "SELECT * FROM agent_facts WHERE workspace_id=? AND id<>? ORDER BY id"
      )
      .all(workspace, created.id)
  );
  assert.equal(
    historyBefore.length,
    1,
    "upsert must retain the prior closed version"
  );
  const fault = new DatabaseSync(database);
  fault.exec(
    "CREATE TRIGGER reject_record_delete BEFORE DELETE ON agent_facts BEGIN SELECT RAISE(ABORT,'injected deletion failure'); END"
  );
  fault.close();
  const failedDelete = await call("ghostcrab_record_delete", {
    ...identity(created.id),
    expected_version: 2
  });
  assert.equal(failedDelete.ok, false);
  assert.equal(
    (await call("ghostcrab_record_get", identity(created.id))).row.version,
    2
  );
  inspect((db) =>
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM search_embeddings WHERE table_id=1 AND doc_id=?"
        )
        .get(doc).n,
      1
    )
  );
  const repaired = new DatabaseSync(database);
  repaired.exec("DROP TRIGGER reject_record_delete");
  repaired.close();
  receipt.checks.push(
    "injected deletion failure rolls back row and vector/search cleanup through MCP"
  );
  const deleted = await call("ghostcrab_record_delete", {
    ...identity(created.id),
    expected_version: 2
  });
  assert.equal(deleted.deleted, true);
  assert.equal(
    (await call("ghostcrab_record_get", identity(created.id))).found,
    false
  );
  assert.equal(
    (
      await call("ghostcrab_record_delete", {
        ...identity(created.id),
        expected_version: 2
      })
    ).deleted,
    false
  );
  inspect((db) => {
    for (const table of [
      "search_documents",
      "search_embeddings",
      "search_fts_docs",
      "search_document_stats",
      "search_term_frequencies"
    ])
      assert.equal(
        db
          .prepare(
            `SELECT count(*) AS n FROM ${table} WHERE table_id=1 AND doc_id=?`
          )
          .get(doc).n,
        0,
        table
      );
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM agent_facts WHERE id=?")
        .get(created.id).n,
      0
    );
    assert.equal(
      db
        .prepare("SELECT count(*) AS n FROM agent_facts WHERE id=?")
        .get(other.id).n,
      1
    );
  });
  assert.deepEqual(
    inspect((db) =>
      db
        .prepare(
          "SELECT * FROM agent_facts WHERE workspace_id=? AND id<>? ORDER BY id"
        )
        .all(workspace, created.id)
    ),
    historyBefore
  );
  assert.deepEqual(
    inspect((db) => db.prepare("PRAGMA foreign_key_check").all()),
    []
  );
  receipt.checks.push(
    "native deletion removes current row and FTS, vector, BM25 term and document artifacts atomically"
  );
  await stop();
  await start();
  assert.equal(
    (await call("ghostcrab_record_get", identity(created.id))).found,
    false
  );
  const hits = await call("ghostcrab_search", {
    workspace_id: workspace,
    schema_id: schema,
    query: "uniquesyntheticcompletiontoken",
    execution: "native_required",
    mode: "bm25"
  });
  assert.equal(hits.ok, true, JSON.stringify(hits));
  assert.equal(hits.results.length, 0);
  assert.equal(
    (
      await call("ghostcrab_record_get", {
        workspace_id: "other-fixture",
        schema_id: schema,
        id: other.id
      })
    ).found,
    true
  );
  receipt.checks.push(
    "restart and native reindex do not resurrect deleted data; foreign workspace remains readable"
  );
  receipt.status = "passed";
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await stop();
  await writeFile(join(fixture, "backend.log"), backendLog);
  await writeFile(
    join(fixture, "receipt.json"),
    JSON.stringify(receipt, null, 2)
  );
}
