// Replay the Studio fixture through real MCP, without seeding agent_facts.
// The source database is read-only; backend startup uses a disposable copy.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    fixture: {
      type: "string",
      default: resolve(
        root,
        "../mindbrain-personal-studio/fixtures/immeuble-demo.sqlite"
      )
    },
    output: {
      type: "string",
      default: resolve(
        root,
        "reports/validation/studio-projection-two-calls-20260913/receipt.json"
      )
    }
  }
});
const sha = (data) => createHash("sha256").update(data).digest("hex");
const fixture = resolve(values.fixture);
const directory = await mkdtemp(
  join(tmpdir(), "ghostcrab-studio-projections-")
);
const dbPath = join(directory, "candidate.sqlite");
const binary = join(root, "cmd/backend/zig-out/bin/ghostcrab-backend");
const source = new DatabaseSync(fixture, { readOnly: true });
await backup(source, dbPath);
source.close();

function inventory() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = {};
    for (const { name } of db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all()) {
      const statement = db.prepare(
        `SELECT * FROM "${name.replaceAll('"', '""')}"`
      );
      statement.setReadBigInts(true);
      const rows = statement
        .all()
        .map((row) =>
          JSON.stringify(row, (_, value) =>
            typeof value === "bigint" ? value.toString() : value
          )
        )
        .sort();
      tables[name] = { count: rows.length, sha256: sha(JSON.stringify(rows)) };
    }
    return tables;
  } finally {
    db.close();
  }
}
const db = new DatabaseSync(dbPath, { readOnly: true });
const artifacts = db
  .prepare(
    "SELECT artifact_id, artifact_kind, slug, lifecycle, state, payload_json FROM mindbrain_answer_artifacts WHERE workspace_id = 'immeuble' ORDER BY artifact_id"
  )
  .all();
const questions = artifacts
  .filter((row) => row.artifact_kind === "live_answer_view")
  .map((row) => ({
    kind: "exact",
    question: JSON.parse(row.payload_json).business_question,
    expected_artifact_id: row.artifact_id
  }));
questions.push(
  {
    kind: "near",
    question: "liste des baux actifs",
    expected_artifact_id: "live_answer_view__baux_actifs"
  },
  {
    kind: "near",
    question: "liste des quotités par immeuble",
    expected_artifact_id: "live_answer_view__quotites_par_immeuble"
  },
  {
    kind: "near",
    question: "liste annuaire des copropriétés",
    expected_artifact_id: "live_answer_view__annuaire_coproprietes"
  },
  {
    kind: "near",
    question: "Montre-moi les locations en cours.",
    expected_artifact_id: "live_answer_view__baux_actifs"
  },
  {
    kind: "near",
    question:
      "Dans quels immeubles la somme des millièmes est-elle incorrecte ?",
    expected_artifact_id: "live_answer_view__quotites_par_immeuble"
  },
  {
    kind: "near",
    question: "Quels appartements n’ont aucun propriétaire renseigné ?",
    expected_artifact_id: "live_answer_view__lots_sans_proprietaire"
  },
  {
    kind: "off_domain",
    question: "Quelle est la température sur la planète Neptune ?",
    expected_artifact_id: null
  }
);
db.close();
const receipt = {
  schema: "ghostcrab/studio-projection-two-calls-audit/v1",
  started_at: new Date().toISOString(),
  fixture,
  fixture_sha256: sha(await readFile(fixture)),
  binary_sha256: sha(await readFile(binary)),
  package_version: JSON.parse(await readFile(join(root, "package.json")))
    .version,
  directory,
  preparation: {},
  source_inventory: inventory(),
  artifacts: artifacts.map(({ payload_json: _payloadJson, ...row }) => row),
  scenarios: [],
  probes: {},
  conclusion: "running"
};
let backend, client, transport;
let backendLog = "",
  mcpLog = "";
async function call(name, args) {
  const result = await client.callTool({
    name,
    arguments: { workspace_id: "immeuble", ...args }
  });
  return {
    name,
    arguments: { workspace_id: "immeuble", ...args },
    isError: result.isError ?? false,
    result: result.structuredContent ?? result
  };
}
try {
  assert.equal(
    receipt.source_inventory.agent_facts.count,
    0,
    "The source fixture must have no agent_facts"
  );
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const host = `127.0.0.1:${reservation.address().port}`;
  await new Promise((done) => reservation.close(done));
  const env = {
    PATH: process.env.PATH,
    GHOSTCRAB_ENV_PATH: join(directory, "absent.env"),
    GHOSTCRAB_CONFIG_PATH: join(directory, "absent.yaml"),
    GHOSTCRAB_SQLITE_PATH: dbPath,
    GHOSTCRAB_MINDBRAIN_URL: `http://${host}`,
    GHOSTCRAB_BOOTSTRAP_SEED: "0",
    GHOSTCRAB_ACTIVE_WORKSPACE_ID: "immeuble",
    GHOSTCRAB_EMBEDDINGS_MODE: "disabled",
    MCP_TELEMETRY: "0",
    GHOSTCRAB_TELEMETRY_STATE_DIR: directory
  };
  backend = spawn(binary, ["--addr", host, "--db", dbPath], {
    cwd: directory,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  backend.stdout.on("data", (data) => {
    backendLog += data;
  });
  backend.stderr.on("data", (data) => {
    backendLog += data;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      receipt.health = await (await fetch(`http://${host}/health`)).json();
      break;
    } catch {
      /* Wait for the owned backend only. */
    }
    assert.equal(backend.exitCode, null, backendLog);
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.equal(receipt.health?.status, "ok", backendLog);
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "dist/index.js")],
    cwd: directory,
    env,
    stderr: "pipe"
  });
  transport.stderr?.on("data", (data) => {
    mcpLog += data;
  });
  client = new Client({
    name: "studio-projection-two-calls-audit",
    version: "1.0.0"
  });
  await client.connect(transport);
  for (
    let attempt = 0;
    attempt < 300 && !mcpLog.includes("facets FTS5 sync ready");
    attempt++
  ) {
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(mcpLog.includes("facets FTS5 sync ready"), mcpLog);
  const beforeReads = inventory();
  receipt.preparation.inventory_after_startup = beforeReads;
  assert.equal(beforeReads.agent_facts.count, 0);
  for (const scenario of questions) {
    const first = await call("ghostcrab_business_query_answer", {
      question: scenario.question,
      explain_route: true
    });
    const artifactId = first.result.route?.artifact_id;
    const calls = [first];
    if (artifactId)
      calls.push(
        await call("ghostcrab_artifact_get", { artifact_id: artifactId })
      );
    receipt.scenarios.push({
      ...scenario,
      selected_artifact_id: artifactId ?? null,
      expected_selection:
        (artifactId ?? null) === scenario.expected_artifact_id,
      business_call_count: calls.length,
      calls
    });
  }
  receipt.probes.pack = await call("ghostcrab_pack", {
    query: "liste des baux actifs"
  });
  receipt.probes.known_projection = await call("ghostcrab_projection_get", {
    projection_id: "chantier_erables_budget",
    collection_id: "immeuble"
  });
  receipt.probes.schema_registry = await call("ghostcrab_schema_get", {
    schema_id: "immeuble::core"
  });
  receipt.probes.known_ontology = await call("ghostcrab_schema_inspect", {
    schema_id: "immeuble::core"
  });
  assert.equal(
    receipt.probes.known_projection.result.report?.has_projection,
    true
  );
  assert.equal(receipt.probes.known_ontology.result.ontology_found, true);
  const afterReads = inventory();
  receipt.read_phase = {
    agent_facts_before: beforeReads.agent_facts.count,
    agent_facts_after: afterReads.agent_facts.count,
    changed_tables: [
      ...new Set([...Object.keys(beforeReads), ...Object.keys(afterReads)])
    ].filter(
      (name) =>
        JSON.stringify(beforeReads[name]) !== JSON.stringify(afterReads[name])
    )
  };
  assert.deepEqual(
    receipt.read_phase.changed_tables,
    [],
    "Business reads must not mutate SQLite"
  );
  // Separate mutation probe on the disposable database, after the read audit.
  // A successful refresh must not be mistaken for a business calculation.
  receipt.probes.refresh = await call("ghostcrab_live_refresh", {
    artifact_id: "live_answer_view__baux_actifs"
  });
  receipt.probes.refreshed_artifact = await call("ghostcrab_artifact_get", {
    artifact_id: "live_answer_view__baux_actifs"
  });
  assert.equal(
    sha(await readFile(fixture)),
    receipt.fixture_sha256,
    "Source fixture changed"
  );
  receipt.summary = Object.fromEntries(
    ["exact", "near", "off_domain"].map((kind) => {
      const rows = receipt.scenarios.filter((row) => row.kind === kind);
      return [
        kind,
        {
          total: rows.length,
          expected_selection: rows.filter((row) => row.expected_selection)
            .length
        }
      ];
    })
  );
  receipt.conclusion = "audit_completed_review_business_payloads";
  console.log(
    JSON.stringify(
      {
        output: values.output,
        summary: receipt.summary,
        read_phase: receipt.read_phase
      },
      null,
      2
    )
  );
} catch (error) {
  receipt.conclusion = "audit_failed";
  receipt.error = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  if (client) await client.close();
  else if (transport) await transport.close();
  if (backend && backend.exitCode === null) {
    backend.kill("SIGTERM");
    await once(backend, "exit");
  }
  receipt.completed_at = new Date().toISOString();
  await mkdir(dirname(resolve(values.output)), { recursive: true });
  await writeFile(values.output, JSON.stringify(receipt, null, 2) + "\n");
  await writeFile(join(directory, "backend.log"), backendLog);
  await writeFile(join(directory, "mcp.log"), mcpLog);
}
