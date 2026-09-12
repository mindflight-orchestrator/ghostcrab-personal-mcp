// Synthetic B1 qualification using the real structured importer and MCP stdio.
// SQLite is opened read-only for receipts; preparation uses the native CLI.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const { values } = parseArgs({
  options: {
    root: { type: "string", default: resolve(import.meta.dirname, "..") },
    binary: { type: "string" },
    importer: {
      type: "string",
      default: resolve(
        import.meta.dirname,
        "../../mindbrain-perso/zig-out/bin/mindbrain-standalone-tool"
      )
    },
    output: { type: "string" }
  }
});
const root = resolve(values.root),
  binary = resolve(
    values.binary ?? join(root, "cmd/backend/zig-out/bin/ghostcrab-backend")
  );
const directory = await mkdtemp(join(tmpdir(), "ghostcrab-b1-")),
  dbPath = join(directory, "candidate.sqlite");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const receipt = {
  schema: "ghostcrab/native-knowledge-replay/v1",
  fixture: "synthetic-real-structured-import",
  exact_client_qualified: false,
  directory,
  started_at: new Date().toISOString(),
  binary,
  binary_sha256: sha(await readFile(binary)),
  importer_sha256: sha(await readFile(values.importer)),
  package_version: JSON.parse(await readFile(join(root, "package.json")))
    .version,
  phases: {},
  calls: {},
  observations: [],
  status: "running"
};
receipt.dist_sha256 = {};
for (const file of [
  "index.js",
  "tools/facets/search.js",
  "tools/facets/upsert.js",
  "tools/dgraph/traverse.js",
  "tools/dgraph/evidence-get.js",
  "db/native-facts-maintenance.js"
]) {
  receipt.dist_sha256[file] = sha(await readFile(join(root, "dist", file)));
}
const query =
  "Quand l'ordonnance de référé a-t-elle été remise au greffe par mise à disposition ?";
const source = "le 13.04.2023 à 16 heures.";
const assertion = "assertion:asrt_884ffc127f6a";
const ws = "b1",
  ontology = "b1:legal";
const reference = {
  kind: "external_id",
  value: assertion,
  ontology_id: ontology,
  entity_type: "b1:assertion"
};
const csv = (rows) =>
  rows
    .map((row) =>
      row
        .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
        .join(",")
    )
    .join("\n") + "\n";
const profiles = [
  {
    id: "direct-v1",
    representation: "direct_support",
    assertion_type: "b1:assertion",
    passage_type: "b1:passage",
    document_type: "b1:document",
    steps: [
      { predicate: "SUPPORTS", direction: "inbound" },
      { predicate: "CONTAINS_PASSAGE", direction: "inbound" }
    ]
  }
];
const facts = [
  [
    "document:d",
    "Document source",
    { source_text: source, text_version: "v1", encoding: "utf-8" }
  ],
  [
    "passage:p",
    source,
    {
      document_version: "v1",
      start: 0,
      end: Buffer.byteLength(source),
      offset_unit: "utf8_bytes",
      sha256: sha(source)
    }
  ],
  [
    assertion,
    "Remise de l’ordonnance au greffe par mise à disposition.",
    { record_id: "asrt_884ffc127f6a" }
  ],
  [
    "other:duplicate-name",
    "Remise de l’ordonnance au greffe par mise à disposition.",
    { record_id: "duplicate" }
  ]
];
const edges = [
  ["document:d", "passage:p", "CONTAINS_PASSAGE"],
  ["passage:p", assertion, "SUPPORTS"]
];
function snapshot() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec("BEGIN");
    const tables = Object.fromEntries(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all()
        .map(({ name }) => {
          const statement = db.prepare(
            `SELECT * FROM "${name.replaceAll('"', '""')}"`
          );
          statement.setReadBigInts(true);
          const rows = statement
            .all()
            .map((row) =>
              JSON.stringify(row, (_, v) =>
                typeof v === "bigint" ? { integer: String(v) } : v
              )
            )
            .sort();
          return [
            name,
            { rows: rows.length, sha256: sha(JSON.stringify(rows)) }
          ];
        })
    );
    const schema = db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name"
      )
      .all();
    return {
      __schema__: { rows: schema.length, sha256: sha(JSON.stringify(schema)) },
      ...tables
    };
  } finally {
    db.close();
  }
}
function delta(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (name) => JSON.stringify(before[name]) !== JSON.stringify(after[name])
  );
}
async function prepare(
  label,
  rows,
  links,
  declared = profiles,
  mode = "append"
) {
  const facets = join(directory, label + "-facets.csv"),
    edgeFile = join(directory, label + "-edges.csv"),
    mapping = join(directory, label + "-mapping.json");
  await writeFile(
    facets,
    csv([
      ["workspace_id", "source_ref", "schema_id", "content", "facets"],
      ...rows.map(([id, content, metadata]) => [
        ws,
        id,
        "legal:" + id.split(":")[0],
        content,
        JSON.stringify({ ...metadata, entity_type: id.split(":")[0] })
      ])
    ])
  );
  await writeFile(
    edgeFile,
    csv([
      ["workspace_id", "source", "target", "label"],
      ...links.map((link) => [ws, ...link])
    ])
  );
  await writeFile(
    mapping,
    JSON.stringify(
      {
        workspace_id: ws,
        ontology_id: ontology,
        source_tag: label.replace("-replay", ""),
        edges_mode: "provided",
        evidence_profiles: declared
      },
      null,
      2
    )
  );
  const before = Object.keys(receipt.phases).length ? snapshot() : {};
  const output = execFileSync(
    values.importer,
    [
      "structured-import-apply",
      "--db",
      dbPath,
      "--workspace-id",
      ws,
      "--ontology-id",
      ontology,
      "--mode",
      mode,
      "--facets",
      facets,
      "--edges",
      edgeFile,
      "--mapping",
      mapping
    ],
    { encoding: "utf8" }
  );
  const graph = execFileSync(
    values.importer,
    [
      "structured-import-reindex",
      "--db",
      dbPath,
      "--workspace-id",
      ws,
      "--scope",
      "graph"
    ],
    { encoding: "utf8" }
  );
  const after = snapshot();
  receipt.phases[label] = {
    before,
    after,
    changes: delta(before, after),
    output,
    graph,
    inputs: {
      facets: sha(await readFile(facets)),
      edges: sha(await readFile(edgeFile)),
      mapping: sha(await readFile(mapping))
    }
  };
}
let backend, relay, client;
let mcpLog = "",
  backendLog = "";
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function call(label, name, args, expectedError) {
  assert.ok(
    [
      "ghostcrab_search",
      "ghostcrab_traverse",
      "ghostcrab_evidence_get"
    ].includes(name),
    "MCP read allowlist"
  );
  const begin = receipt.observations.length,
    before = snapshot();
  const result = await client.callTool({
    name,
    arguments: { workspace_id: ws, ...args }
  });
  receipt.calls[label] = {
    name,
    args,
    result,
    observations: receipt.observations.slice(begin)
  };
  const after = snapshot();
  receipt.calls[label].sqlite = {
    before_sha256: sha(JSON.stringify(before)),
    after_sha256: sha(JSON.stringify(after)),
    changed_tables: delta(before, after)
  };
  assert.deepEqual(after, before, `${label}: a read changed SQLite`);
  assert.ok(
    !receipt.calls[label].observations.some(
      (row) =>
        /sql|reindex/.test(row.path) ||
        (row.path.includes("facts-index") && row.method === "POST")
    ),
    `${label}: unexpected SQL or repair interface`
  );
  if (expectedError) {
    assert.equal(result.isError, true, label);
    assert.equal(result.structuredContent.error.code, expectedError, label);
  } else assert.notEqual(result.isError, true, JSON.stringify(result));
  return result.structuredContent;
}
try {
  await prepare("b1-source-v1", facts, edges);
  const prepared = snapshot();
  const reservation = createServer(),
    url = await listen(reservation);
  await new Promise((r) => reservation.close(r));
  const env = {
    PATH: process.env.PATH,
    GHOSTCRAB_ENV_PATH: join(directory, "absent.env"),
    GHOSTCRAB_CONFIG_PATH: join(directory, "absent.yaml"),
    GHOSTCRAB_SQLITE_PATH: dbPath,
    MCP_TELEMETRY: "0",
    GHOSTCRAB_TELEMETRY_STATE_DIR: directory,
    GHOSTCRAB_BOOTSTRAP_SEED: "0",
    GHOSTCRAB_ACTIVE_WORKSPACE_ID: ws,
    GHOSTCRAB_EMBEDDINGS_MODE: "disabled"
  };
  backend = spawn(binary, ["--addr", new URL(url).host, "--db", dbPath], {
    cwd: directory,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  backend.stdout.on("data", (x) => {
    backendLog += x;
  });
  backend.stderr.on("data", (x) => {
    backendLog += x;
  });
  for (let i = 0; i < 100; i++) {
    try {
      receipt.health = await (await fetch(url + "/health")).json();
      break;
    } catch {
      // The owned backend is still starting.
    }
    assert.equal(backend.exitCode, null, backendLog);
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(receipt.health?.status, "ok");
  receipt.phases.backend_startup = { changes: delta(prepared, snapshot()) };
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
      const upstream = await fetch(url + req.url, {
        method: req.method,
        headers: { "content-type": "application/json" },
        ...(body ? { body } : {})
      });
      res.writeHead(upstream.status, { "content-type": "application/json" });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(error) }));
    }
  });
  const beforeMcp = snapshot();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "dist/index.js")],
    cwd: directory,
    env: { ...env, GHOSTCRAB_MINDBRAIN_URL: await listen(relay) },
    stderr: "pipe"
  });
  transport.stderr?.on("data", (x) => {
    mcpLog += x;
  });
  client = new Client({ name: "b1-native-knowledge-replay", version: "1.0.0" });
  await client.connect(transport);
  for (let i = 0; i < 300 && !mcpLog.includes("facets FTS5 sync ready"); i++)
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(mcpLog.includes("facets FTS5 sync ready"), mcpLog);
  receipt.phases.mcp_startup = { changes: delta(beforeMcp, snapshot()) };
  const catalogue = await client.listTools();
  receipt.tools = catalogue.tools.map((tool) => tool.name);
  assert.ok(receipt.tools.includes("ghostcrab_evidence_get"));
  for (const [label, content] of [
    ["upsert-insert", "initialmarque"],
    ["upsert-update", "nouvellemarque"]
  ]) {
    const before = snapshot();
    const result = await client.callTool({
      name: "ghostcrab_upsert",
      arguments: {
        workspace_id: ws,
        schema_id: "test:lifecycle",
        match: { facets: { record_id: "lifecycle" } },
        set_content: content,
        set_facets: { record_id: "lifecycle" },
        create_if_missing: true
      }
    });
    receipt.phases[label] = { changes: delta(before, snapshot()), result };
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(result.structuredContent.native_index.ready, true);
    const hit = await call(label + "-search", "ghostcrab_search", {
      query: content,
      mode: "bm25",
      execution: "native_required",
      schema_id: "test:lifecycle"
    });
    assert.equal(hit.results.length, 1);
    assert.equal(hit.results[0].id, result.structuredContent.id);
  }
  const obsolete = await call("upsert-obsolete-term", "ghostcrab_search", {
    query: "initialmarque",
    mode: "bm25",
    execution: "native_required"
  });
  assert.equal(obsolete.results.length, 0);

  const search = await call("bm25", "ghostcrab_search", {
    query,
    mode: "bm25",
    execution: "native_required",
    schema_id: "legal:assertion",
    filters: { record_id: "asrt_884ffc127f6a" },
    limit: 1
  });
  assert.equal(search.query, query);
  assert.equal(search.results.length, 1);
  assert.equal(search.results[0].source_ref, assertion);
  assert.equal(search.results[0].entity_ref.value, assertion);
  const factRef = { kind: "fact_id", value: search.results[0].id };
  const traversal = await call("external-traverse", "ghostcrab_traverse", {
    start_ref: reference,
    direction: "inbound",
    depth: 1,
    edge_labels: ["SUPPORTS"]
  });
  assert.ok(
    traversal.path.some((row) => row.depth === 1 && row.node_label === source)
  );
  const proof = await call("direct-proof", "ghostcrab_evidence_get", {
    assertion_ref: factRef
  });
  assert.equal(proof.complete, true);
  assert.equal(proof.paths[0].representation, "direct_support");
  assert.equal(proof.paths[0].evidence_ref, null);
  assert.equal(proof.paths[0].text, source);
  await call(
    "absent",
    "ghostcrab_evidence_get",
    { assertion_ref: { kind: "external_id", value: "absent" } },
    "not_found"
  );
  await call(
    "wrong-workspace",
    "ghostcrab_evidence_get",
    { workspace_id: "foreign", assertion_ref: reference },
    "not_found"
  );
  await call(
    "wrong-ontology",
    "ghostcrab_traverse",
    { start_ref: { ...reference, ontology_id: "wrong" } },
    "not_found"
  );
  await call(
    "ambiguous-name",
    "ghostcrab_traverse",
    { start_ref: { kind: "name", value: facts[2][1] } },
    "ambiguous_reference"
  );
  const absent = await call("lexical-negative", "ghostcrab_search", {
    query: "introuvablexyzunique",
    mode: "bm25",
    execution: "native_required"
  });
  assert.equal(absent.results.length, 0);
  const enriched = {
    id: "evidence-v1",
    representation: "evidence_node",
    assertion_type: "b1:assertion",
    evidence_type: "b1:evidence",
    passage_type: "b1:passage",
    document_type: "b1:document",
    steps: [
      { predicate: "HAS_EVIDENCE", direction: "outbound" },
      { predicate: "CITES_PASSAGE", direction: "outbound" },
      { predicate: "CONTAINS_PASSAGE", direction: "inbound" }
    ]
  };
  const enrichment = [
    [
      "evidence:derived-v1",
      "Derived support record",
      { derived: true, derivation: "legacy SUPPORTS", source_version: "v1" }
    ]
  ];
  const enrichmentEdges = [
    [assertion, "evidence:derived-v1", "HAS_EVIDENCE"],
    ["evidence:derived-v1", "passage:p", "CITES_PASSAGE"]
  ];
  await prepare("b1-enrichment-v1", enrichment, enrichmentEdges, [
    ...profiles,
    enriched
  ]);
  const enrichedProof = await call("enriched-proof", "ghostcrab_evidence_get", {
    assertion_ref: reference,
    limit: 1
  });
  assert.equal(enrichedProof.paths[0].representation, "direct_support");
  assert.ok(enrichedProof.next_cursor);
  const page = await call("enriched-page", "ghostcrab_evidence_get", {
    assertion_ref: reference,
    limit: 1,
    cursor: enrichedProof.next_cursor
  });
  assert.equal(page.paths[0].representation, "evidence_node");
  assert.equal(page.paths[0].evidence_ref.external_id, "evidence:derived-v1");
  assert.equal(page.paths[0].text, source);
  await prepare(
    "b1-enrichment-v1-replay",
    enrichment,
    enrichmentEdges,
    [...profiles, enriched],
    "ignore-duplicates"
  );
  const replay = await call("enriched-idempotent", "ghostcrab_evidence_get", {
    assertion_ref: reference
  });
  assert.equal(replay.paths.length, 2);
  await prepare(
    "b1-invalid-hash",
    [[...facts[1].slice(0, 2), { ...facts[1][2], sha256: "wrong" }]],
    [],
    [...profiles, enriched]
  );
  const invalid = await call("invalid-hash", "ghostcrab_evidence_get", {
    assertion_ref: reference
  });
  assert.equal(invalid.complete, false);
  assert.equal(invalid.paths[0].text_status, "hash_mismatch");
  assert.equal(invalid.paths[0].text, null);
  await call(
    "stale-cursor",
    "ghostcrab_evidence_get",
    { assertion_ref: reference, cursor: enrichedProof.next_cursor },
    "stale_cursor"
  );
  await prepare(
    "b1-missing-source",
    [["document:d", "Document source", { text_version: "v1" }]],
    [],
    [...profiles, enriched]
  );
  const missing = await call("not-stored", "ghostcrab_evidence_get", {
    assertion_ref: reference
  });
  assert.equal(missing.paths[0].text_status, "not_stored");
  assert.equal(missing.complete, false);
  receipt.status = "passed";
} catch (error) {
  receipt.status = "failed";
  receipt.error = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  if (relay) await new Promise((r) => relay.close(r));
  if (backend && backend.exitCode === null) {
    backend.kill("SIGTERM");
    await once(backend, "exit");
  }
  receipt.finished_at = new Date().toISOString();
  await writeFile(join(directory, "mcp.log"), mcpLog);
  await writeFile(join(directory, "backend.log"), backendLog);
  const output = resolve(values.output ?? join(directory, "receipt.json"));
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: receipt.status,
      output,
      directory,
      error: receipt.error
    })
  );
}
