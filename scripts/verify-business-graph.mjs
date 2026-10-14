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
  const db = new DatabaseSync(database);
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('BEGIN IMMEDIATE');
  for (const ws of ['graph-own','graph-foreign']) {
    db.prepare('INSERT INTO workspaces(id,workspace_id,label) VALUES(?,?,?)').run(ws,ws,ws);
    db.prepare('INSERT INTO ontologies(ontology_id,workspace_id,name,source_kind) VALUES(?,?,?,?)').run(ws+'::model',ws,'Existing business model','constructed');
    db.prepare('INSERT INTO ontology_entity_types(ontology_id,entity_type) VALUES(?,?)').run(ws+'::model','building');
  }
  db.prepare('INSERT INTO ontology_entity_types(ontology_id,entity_type) VALUES(?,?)').run('graph-own::model','unit');
  for (const [id,ws] of [[1,'graph-own'],[2,'graph-own'],[100,'graph-foreign'],[101,'graph-foreign']]) {
    const properties=JSON.stringify({address:'Synthetic address '+id,notes:[]});
    db.prepare('INSERT INTO entities_raw(entity_id,workspace_id,ontology_id,external_id,entity_type,name,metadata_json) VALUES(?,?,?,?,?,?,?)').run(id,ws,ws+'::model','seed-'+id,'building','seed-'+id,properties);
    db.prepare('INSERT INTO graph_entity(entity_id,workspace_id,entity_type,name,metadata_json) VALUES(?,?,?,?,?)').run(id,ws,'building','seed-'+id,properties);
  }
  for (const [rid,ws,a,b] of [[10,'graph-own',1,2],[1000,'graph-foreign',100,101]]) {
    db.prepare('INSERT INTO relations_raw(relation_id,workspace_id,ontology_id,edge_type,source_entity_id,target_entity_id) VALUES(?,?,?,?,?,?)').run(rid,ws,ws+'::model','contains',a,b);
    db.prepare('INSERT INTO graph_relation(relation_id,workspace_id,relation_type,source_id,target_id) VALUES(?,?,?,?,?)').run(rid,ws,'contains',a,b);
  }
  db.exec('COMMIT');db.close();
  const rebuild = async ws => {
    const response=await fetch(url+'/api/mindbrain/graph/business-adjacency',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace_id:ws})});
    assert.equal(response.ok,true,await response.text());
  };
  await rebuild('graph-own');await rebuild('graph-foreign');
  const ontologyBefore=inspect(db=>db.prepare('SELECT * FROM ontologies ORDER BY ontology_id').all());
  const typesBefore=inspect(db=>db.prepare('SELECT * FROM ontology_entity_types ORDER BY ontology_id,entity_type').all());
  const foreignBefore=inspect(db=>({entity:db.prepare('SELECT * FROM graph_entity WHERE workspace_id=?').all('graph-foreign'),relation:db.prepare('SELECT * FROM graph_relation WHERE workspace_id=?').all('graph-foreign'),adjacency:db.prepare('SELECT * FROM graph_lj_out WHERE entity_id=100').all()}));
  const graphCall=async (action,args)=>call('ghostcrab_graph_record_'+action,args);
  const identity={workspace_id:'graph-own',node_type:'building',id:'1'};
  const old=await graphCall('get',identity);assert.equal(old.found,true);assert.match(old.node.version,/^[a-f0-9]{64}$/);
  for (const scope of [{workspace_id:'graph-foreign'},{node_type:'unit'}]) {
    assert.equal((await graphCall('get',{...identity,...scope})).found,false);
    assert.equal((await graphCall('delete',{...identity,...scope,expected_version:old.node.version})).deleted,false);
  }
  const created=await graphCall('create',{workspace_id:'graph-own',node_type:'building',id:'operator:new-building',label:'Synthetic new building',properties:{address:'Rue Demo',notes:[]}});
  assert.equal(created.ok,true,JSON.stringify(created));assert.equal(created.created,true);
  const c={workspace_id:'graph-own',node_type:'building',id:created.node.id};
  assert.equal((await graphCall('get',c)).node.label,'Synthetic new building');
  assert.equal((await graphCall('create',{workspace_id:'graph-own',node_type:'building',id:'operator:new-building',label:'Duplicate',properties:{}})).error.code,'id_exists');
  assert.equal((await graphCall('create',{workspace_id:'graph-own',node_type:'invented-model',id:'new-model',label:'Forbidden',properties:{}})).error.code,'type_not_found');
  const declared=await graphCall('create',{workspace_id:'graph-own',node_type:'unit',id:'operator:first-unit',label:'First unit',properties:{lot:'A'}});
  assert.equal(declared.ok,true,JSON.stringify(declared));
  assert.equal((await graphCall('update',{...c,expected_version:'a'.repeat(64),properties:{address:'Wrong'}})).error.code,'version_conflict');
  const updated=await graphCall('update',{...c,expected_version:created.node.version,label:'New label',properties:{address:'Rue Updated'}});
  assert.equal(updated.ok,true,JSON.stringify(updated));assert.notEqual(updated.node.version,created.node.version);
  const note=await graphCall('update',{...c,expected_version:updated.node.version,properties:{notes:['Verified note']}});
  assert.equal(note.ok,true);assert.equal(note.node.properties.address,'Rue Updated');
  assert.deepEqual(note.node.properties.notes,['Verified note']);
  assert.equal((await graphCall('delete',{...c,expected_version:updated.node.version})).error.code,'version_conflict');
  receipt.checks.push('native explicit SQL sessions make create/update/CAS atomic; strict existing identity and type validation');
  // Synthetic fixture links exercise full incident cleanup and foreign-link refusal.
  const writable=new DatabaseSync(database);const target=Number(c.id);
  writable.prepare('INSERT INTO relations_raw(relation_id,workspace_id,ontology_id,edge_type,source_entity_id,target_entity_id) VALUES(20,?,?,?,?,?)').run('graph-own','graph-own::model','contains',1,target);
  writable.prepare('INSERT INTO graph_relation(relation_id,workspace_id,relation_type,source_id,target_id) VALUES(20,?,?,?,?)').run('graph-own','contains',1,target);
  writable.close();await rebuild('graph-own');
  const guarded=new DatabaseSync(database);
  guarded.prepare('INSERT INTO graph_relation(relation_id,workspace_id,relation_type,source_id,target_id) VALUES(21,?,?,?,?)').run('graph-foreign','cross',100,target);guarded.close();
  assert.equal((await graphCall('delete',{...c,expected_version:note.node.version})).error.code,'foreign_relation');
  assert.equal((await graphCall('get',c)).found,true);
  const clean=new DatabaseSync(database);clean.exec('DELETE FROM graph_relation WHERE relation_id=21');clean.close();
  assert.equal((await graphCall('delete',{...c,expected_version:note.node.version})).deleted,true);
  assert.equal((await graphCall('get',c)).found,false);
  inspect(db=>{
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entities_raw WHERE entity_id=?').get(target).n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM graph_relation WHERE relation_id=20').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM relations_raw WHERE relation_id=20').get().n,0);
    for(const table of ['graph_entity_alias','graph_entity_document','graph_lj_out','graph_lj_in','graph_entity_degree'])assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE entity_id=?`).get(target).n,0);
  });
  receipt.checks.push('exact deletion removes raw/runtime entity and incident relations/links; adjacency reconciled in own workspace; foreign incident relation prevents deletion');
  await stop();await start();
  assert.equal((await graphCall('get',c)).found,false);
  await call('ghostcrab_graph_reindex',{workspace_id:'graph-own'});
  assert.equal((await graphCall('get',c)).found,false);
  const foreignAfter=inspect(db=>({entity:db.prepare('SELECT * FROM graph_entity WHERE workspace_id=?').all('graph-foreign'),relation:db.prepare('SELECT * FROM graph_relation WHERE workspace_id=?').all('graph-foreign'),adjacency:db.prepare('SELECT * FROM graph_lj_out WHERE entity_id=100').all()}));
  assert.deepEqual(foreignAfter,foreignBefore);
  assert.deepEqual(inspect(db=>db.prepare('SELECT * FROM ontologies ORDER BY ontology_id').all()),ontologyBefore);
  assert.deepEqual(inspect(db=>db.prepare('SELECT * FROM ontology_entity_types ORDER BY ontology_id,entity_type').all()),typesBefore);
  receipt.checks.push('restart/reindex do not resurrect deleted objects; foreign graph rows/adjacency and ontology/type definitions unchanged');
  receipt.schema='ghostcrab/business-graph-native-proof/v1';receipt.status='passed';
  console.log(JSON.stringify(receipt,null,2));
} finally {
  await stop();
  await writeFile(join(fixture, "backend.log"), backendLog);
  await writeFile(
    join(fixture, "receipt.json"),
    JSON.stringify(receipt, null, 2)
  );
}
