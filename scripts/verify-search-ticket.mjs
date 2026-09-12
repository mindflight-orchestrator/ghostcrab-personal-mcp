// Replay the supplied Personal seed through a real, rebuilt MCP stdio server.
// Every mutation is confined to a new copy; receipts distinguish each phase.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const { values } = parseArgs({
  options: {
    kit: { type: "string" },
    output: { type: "string" },
    root: { type: "string", default: resolve(import.meta.dirname, "..") },
    binary: { type: "string" },
    baseline: { type: "boolean", default: false }
  }
});
assert.ok(
  values.kit && values.output,
  "Required: --kit <PERSO directory> --output <receipt.json>"
);
const root = resolve(values.root);
const kit = resolve(values.kit);
const binary = resolve(
  values.binary ?? join(root, "cmd/backend/zig-out/bin/ghostcrab-backend")
);
const output = resolve(values.output);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const expected = JSON.parse(
  await readFile(join(kit, "data/expected-request.json"), "utf8")
);
const seed = join(kit, "data", expected.seed.file);
assert.equal(sha(await readFile(seed)), expected.seed.sha256);
const seedDb = new DatabaseSync(seed, { readOnly: true });
const target = seedDb
  .prepare("SELECT * FROM projections WHERE scope = ? AND agent_id = ?")
  .all(expected.mcp_request.arguments.scope, expected.effective_agent_id)
  .find((row) => sha(row.id) === expected.target.id_sha256);
seedDb.close();
assert.ok(target, "Expected plan identity is absent from the supplied seed");
assert.equal(sha(target.content), expected.target.content_sha256);
const directory = await mkdtemp(join(tmpdir(), "ghostcrab-search-ticket-"));
const dbPath = join(directory, "replay.sqlite");
await copyFile(seed, dbPath);
const receipt = {
  schema: "ghostcrab/search-ticket-replay/v1",
  started_at: new Date().toISOString(),
  mode: values.baseline ? "historical-baseline" : "candidate",
  directory,
  seed_sha256: expected.seed.sha256,
  package: JSON.parse(await readFile(join(root, "package.json"), "utf8"))
    .version,
  binary,
  binary_sha256: sha(await readFile(binary)),
  dist_sha256: {},
  phases: {},
  calls: {},
  observations: [],
  status: "running"
};
for (const file of [
  "tools/pragma/pack.js",
  "db/facets-fts-search.js",
  "tools/search/combined-search.js"
])
  receipt.dist_sha256[file] = sha(await readFile(join(root, "dist", file)));

function snapshot() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec("BEGIN");
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      .all();
    const schema = db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"
      )
      .all();
    return {
      __schema__: { rows: schema.length, sha256: sha(JSON.stringify(schema)) },
      ...Object.fromEntries(
        tables.map(({ name }) => {
          const statement = db.prepare(
            `SELECT * FROM "${name.replaceAll('"', '""')}"`
          );
          statement.setReadBigInts(true);
          const rows = statement.all();
          const serialized = rows
            .map((row) =>
              JSON.stringify(row, (_, value) =>
                typeof value === "bigint"
                  ? { sqlite_integer: value.toString() }
                  : value
              )
            )
            .sort();
          return [
            name,
            { rows: rows.length, sha256: sha(JSON.stringify(serialized)) }
          ];
        })
      )
    };
  } finally {
    db.close();
  }
}
function changes(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(
      (name) => JSON.stringify(before[name]) !== JSON.stringify(after[name])
    )
    .map((table) => ({
      table,
      before: before[table] ?? null,
      after: after[table] ?? null
    }));
}
function verifyReads(name, before) {
  const after = snapshot();
  receipt.phases[name] = { before, after, changes: changes(before, after) };
  assert.deepEqual(after, before, `${name} changed SQLite tables or schema`);
}
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
const reservation = createServer();
const nativeUrl = await listen(reservation);
await new Promise((resolve) => reservation.close(resolve));
const cleanEnv = {
  PATH: process.env.PATH,
  GHOSTCRAB_ENV_PATH: join(directory, "absent.env"),
  GHOSTCRAB_CONFIG_PATH: join(directory, "absent.yaml"),
  GHOSTCRAB_SQLITE_PATH: dbPath,
  MCP_TELEMETRY: "0",
  GHOSTCRAB_TELEMETRY_STATE_DIR: directory,
  GHOSTCRAB_BOOTSTRAP_SEED: "0",
  GHOSTCRAB_ACTIVE_WORKSPACE_ID: expected.mcp_request.arguments.workspace_id,
  GHOSTCRAB_EMBEDDINGS_MODE: "disabled"
};
let backend, relay, client;
let backendLog = "",
  mcpLog = "";
const beforeStartup = snapshot();
try {
  backend = spawn(binary, ["--addr", new URL(nativeUrl).host, "--db", dbPath], {
    cwd: directory,
    env: cleanEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });
  backend.stdout.on("data", (chunk) => {
    backendLog += chunk;
  });
  backend.stderr.on("data", (chunk) => {
    backendLog += chunk;
  });
  for (let i = 0; i < 100; i++) {
    try {
      receipt.health = await (await fetch(nativeUrl + "/health")).json();
      break;
    } catch {
      /* starting */
    }
    assert.equal(backend.exitCode, null, "Backend exited before health");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(receipt.health?.status, "ok");
  const afterStartup = snapshot();
  receipt.phases.backend_startup = {
    before: beforeStartup,
    after: afterStartup,
    changes: changes(beforeStartup, afterStartup)
  };
  receipt.native_baseline = [];
  for (const test of expected.native_cases) {
    const url = new URL(expected.native_endpoint_path, nativeUrl);
    const params = {
      ...expected.mcp_request.arguments,
      agent_id: expected.effective_agent_id,
      scope: expected.mcp_request.arguments.scope + test.scope_suffix
    };
    if (test.query === null) delete params.query;
    else params.query = test.query;
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    const result = await (await fetch(url)).json();
    receipt.native_baseline.push({ case: test.id, request: params, result });
    assert.equal(result.rows.length, test.expected_rows);
    if (test.expected_rows)
      assert.ok(
        result.rows.some(
          (row) =>
            sha(row.id) === expected.target.id_sha256 &&
            sha(row.content) === expected.target.content_sha256
        )
      );
  }
  verifyReads("native_reads", afterStartup);
  relay = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      receipt.observations.push({
        method: req.method,
        path: req.url,
        body: body ? JSON.parse(body) : null
      });
      const upstream = await fetch(nativeUrl + req.url, {
        method: req.method,
        headers: { "content-type": "application/json" },
        ...(body ? { body } : {})
      });
      res.writeHead(upstream.status, {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json"
      });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  const relayUrl = await listen(relay);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "dist/index.js")],
    cwd: directory,
    env: { ...cleanEnv, GHOSTCRAB_MINDBRAIN_URL: relayUrl },
    stderr: "pipe"
  });
  transport.stderr?.on("data", (chunk) => {
    mcpLog += chunk;
  });
  client = new Client({ name: "search-ticket-replay", version: "1.0.0" });
  await client.connect(transport);
  receipt.server = client.getServerVersion();
  // The MCP handshake precedes the asynchronous FTS/bootstrap work.
  // Wait for its actual completion before attributing SQLite changes to reads.
  for (
    let i = 0;
    i < 300 && !mcpLog.includes("session workspace pinned:");
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(
    mcpLog.includes("session workspace pinned:"),
    "MCP initialization did not complete"
  );
  const afterMcp = snapshot();
  receipt.phases.mcp_startup = {
    before: afterStartup,
    after: afterMcp,
    changes: changes(afterStartup, afterMcp)
  };
  async function call(label, name, args) {
    const start = receipt.observations.length;
    const result = await client.callTool({ name, arguments: args });
    const payload =
      result.structuredContent ??
      JSON.parse(result.content.find((item) => item.type === "text").text);
    receipt.calls[label] = {
      name,
      arguments: args,
      result,
      observation_range: [start, receipt.observations.length]
    };
    return payload;
  }
  const args = expected.mcp_request.arguments;
  const legacy = await call("pack_legacy", "ghostcrab_pack", args);
  assert.deepEqual(legacy.pack, []);
  assert.equal(legacy.backend, "native");
  assert.equal(
    legacy.facts.length,
    5,
    "The initialized historical seed must retain its five matching facts"
  );
  receipt.legacy_fact_count = legacy.facts.length;
  const keyword = await call("pack_keyword", "ghostcrab_pack", {
    ...args,
    query: "launch"
  });
  assert.equal(sha(keyword.pack[0].content), expected.target.content_sha256);
  if (!values.baseline) {
    for (const [label, query, plan] of [
      ["pack_exact", args.query, {}],
      [
        "pack_rephrased",
        "Which unresolved QA issues prevent the release?",
        { plan_id: target.id }
      ]
    ]) {
      const payload = await call(label, "ghostcrab_pack", {
        ...args,
        ...plan,
        selection_mode: "exact",
        query
      });
      assert.equal(payload.pack.length, 1);
      assert.equal(sha(payload.pack[0].id), expected.target.id_sha256);
      assert.equal(
        sha(payload.pack[0].content),
        expected.target.content_sha256
      );
      assert.equal(payload.query, query);
      const [start, end] = receipt.calls[label].observation_range;
      const reads = receipt.observations.slice(start, end);
      assert.ok(
        reads.some(
          (row) =>
            row.path === "/api/mindbrain/ghostcrab/search" &&
            row.body?.query === query
        )
      );
      const selection = reads.find((row) =>
        row.path.startsWith("/api/mindbrain/ghostcrab/pack-projections?")
      );
      assert.ok(selection);
      assert.ok(!new URL(selection.path, nativeUrl).searchParams.get("query"));
    }
    assert.deepEqual(
      receipt.calls.pack_exact.result.structuredContent.facts,
      legacy.facts
    );
    for (const [label, extra] of [
      ["absent", { scope: args.scope + ":absent" }],
      ["wrong_id", { plan_id: "absent-plan" }],
      ["wrong_agent", { agent_id: "absent-agent" }],
      ["wrong_workspace", { workspace_id: "default", plan_id: target.id }]
    ]) {
      const payload = await call(label, "ghostcrab_pack", {
        ...args,
        selection_mode: "exact",
        ...extra
      });
      assert.equal(payload.error.code, "plan_not_found");
    }
  }
  verifyReads("pack_reads", afterMcp);
  async function sql(sql, params = []) {
    const response = await fetch(nativeUrl + "/api/mindbrain/sql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql, params })
    });
    const result = await response.json();
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  const beforePreparation = snapshot();
  const fixtureWorkspace = "retest-search-068";
  const fixtureCollection = fixtureWorkspace + "::main";
  await sql("INSERT INTO workspaces(id,workspace_id,label) VALUES (?,?,?)", [
    fixtureWorkspace,
    fixtureWorkspace,
    "Synthetic search retest"
  ]);
  await sql(
    "INSERT INTO collections(collection_id,workspace_id,name) VALUES (?,?,?)",
    [fixtureCollection, fixtureWorkspace, "main"]
  );
  await sql(
    "INSERT INTO ontologies(ontology_id,workspace_id,name) VALUES (?,?,?)",
    [fixtureWorkspace + "::core", fixtureWorkspace, "core"]
  );
  await sql(
    "INSERT INTO facet_assignments_raw(workspace_id,collection_id,target_kind,doc_id,ontology_id,namespace,dimension,value) VALUES (?,?,'doc',42,?,'retest','status','overdue')",
    [fixtureWorkspace, fixtureCollection, fixtureWorkspace + "::core"]
  );
  const remembered = await call("setup_french_fact", "ghostcrab_remember", {
    workspace_id: fixtureWorkspace,
    schema_id: "retest:search",
    content: "La facture GC068 contient une échéance dépassée.",
    facets: { record_id: "gc068-fr" }
  });
  assert.equal(remembered.ok, true);
  const afterPreparation = snapshot();
  receipt.phases.fixture_preparation = {
    before: beforePreparation,
    after: afterPreparation,
    changes: changes(beforePreparation, afterPreparation)
  };
  const { buildFtsMatchExpression } = await import(
    pathToFileURL(join(root, "dist/db/facets-fts-search.js"))
  );
  receipt.french_expression = buildFtsMatchExpression("échéance dépassée");
  for (const [label, query, filters] of [
    ["french", "échéance dépassée", {}],
    ["ascii", "echeance depassee", {}],
    ["marker", "GC068", {}],
    ["structured", "", { record_id: "gc068-fr" }],
    ["negative", "missingtermgc069", {}]
  ]) {
    const payload = await call(label, "ghostcrab_search", {
      workspace_id: fixtureWorkspace,
      schema_id: "retest:search",
      mode: "bm25",
      query,
      filters
    });
    const shouldFind =
      label !== "negative" && !(values.baseline && label === "french");
    assert.equal(payload.returned, shouldFind ? 1 : 0, label);
    if (shouldFind) assert.equal(payload.results[0].id, remembered.id);
    if (label === "french" || label === "ascii")
      assert.equal(payload.mode_applied, "bm25");
  }
  const direct = await call(
    "facet_direct",
    "ghostcrab_collection_facet_search",
    {
      workspace_id: fixtureWorkspace,
      collection_id: fixtureCollection,
      namespace: "retest",
      dimension: "status",
      value: "overdue"
    }
  );
  assert.equal(direct.returned, 1);
  const combined = {
    workspace_id: fixtureWorkspace,
    collection_id: fixtureCollection,
    facet_mode: "bm25",
    limit: 5,
    collection_facet_namespace: "retest",
    collection_facet_dimension: "status"
  };
  const unresolved = await call("combined_human", "ghostcrab_combined_search", {
    ...combined,
    query: "Quelles factures sont en retard ?"
  });
  assert.equal(unresolved.returned, 0);
  const resolved = await call(
    "combined_resolved",
    "ghostcrab_combined_search",
    {
      ...combined,
      query: values.baseline ? "overdue" : "Quelles factures sont en retard ?",
      ...(values.baseline ? {} : { collection_facet_value: "overdue" })
    }
  );
  assert.equal(resolved.returned, 1);
  verifyReads("search_reads", afterPreparation);
  if (!values.baseline) {
    const beforeAmbiguity = snapshot();
    await sql(
      "INSERT INTO projections(id,agent_id,scope,proj_type,content,status) VALUES ('retest-second',?,?,'GOAL','Second plan','active')",
      [target.agent_id, target.scope]
    );
    const afterAmbiguity = snapshot();
    receipt.phases.ambiguity_preparation = {
      before: beforeAmbiguity,
      after: afterAmbiguity,
      changes: changes(beforeAmbiguity, afterAmbiguity)
    };
    const ambiguous = await call("ambiguous", "ghostcrab_pack", {
      ...args,
      selection_mode: "exact",
      limit: 1
    });
    assert.equal(ambiguous.error.code, "ambiguous_plan");
    const selected = await call("disambiguated", "ghostcrab_pack", {
      ...args,
      selection_mode: "exact",
      plan_id: target.id
    });
    assert.equal(selected.pack.length, 1);
    assert.equal(sha(selected.pack[0].content), expected.target.content_sha256);
    verifyReads("ambiguity_reads", afterAmbiguity);
  }
  assert.equal(sha(await readFile(seed)), expected.seed.sha256);
  receipt.seed_unchanged = true;
  receipt.status = "passed";
} catch (error) {
  receipt.status = "failed";
  receipt.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  await client?.close();
  if (relay) await new Promise((resolve) => relay.close(resolve));
  if (backend && backend.exitCode === null) {
    const stopped = once(backend, "exit");
    backend.kill("SIGTERM");
    await stopped;
  }
  receipt.finished_at = new Date().toISOString();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n");
  await writeFile(join(directory, "backend.log"), backendLog);
  await writeFile(join(directory, "mcp.log"), mcpLog);
  console.log(
    JSON.stringify(
      { status: receipt.status, output, directory, error: receipt.error },
      null,
      2
    )
  );
}
