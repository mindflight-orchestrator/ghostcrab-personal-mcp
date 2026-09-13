// Strict business qualification of prepared native projections through two real MCP calls.
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

const fixtureRoot = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    root: { type: "string", default: fixtureRoot },
    binary: { type: "string" },
    fixture: {
      type: "string",
      default: resolve(
        fixtureRoot,
        "../mindbrain-personal-studio/fixtures/immeuble-demo.sqlite"
      )
    },
    output: {
      type: "string",
      default: resolve(
        fixtureRoot,
        "reports/validation/studio-projection-qualified-20260913/receipt.json"
      )
    }
  }
});
const root = resolve(values.root);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const fixture = resolve(values.fixture);
const directory = await mkdtemp(
  join(tmpdir(), "ghostcrab-studio-projections-")
);
const dbPath = join(directory, "candidate.sqlite");
const binary = resolve(
  values.binary ?? join(root, "cmd/backend/zig-out/bin/ghostcrab-backend")
);
const profiles = JSON.parse(
  await readFile(
    join(fixtureRoot, "examples/immeuble/contracts/qualified_projections.json"),
    "utf8"
  )
);
const asOf = "2026-09-13";
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
const questions = profiles.flatMap((profile) => {
  const contract = profile.definition.projection_contract;
  return [contract.business_question, ...contract.paraphrases].map(
    (question) => ({
      question,
      operation: contract.operation,
      expected_artifact_id: `live_answer_view__${profile.slug}`
    })
  );
});
questions.push({
  question: "Peux-tu me donner la liste des quotités par immeuble ?",
  operation: "group_sum",
  expected_artifact_id: "live_answer_view__qualified_quotites_par_immeuble"
});
db.close();
const receipt = {
  schema: "ghostcrab/studio-projection-two-calls-qualification/v1",
  started_at: new Date().toISOString(),
  fixture,
  fixture_sha256: sha(await readFile(fixture)),
  binary_sha256: sha(await readFile(binary)),
  binary,
  mcp_root: root,
  mcp_entrypoint_sha256: sha(await readFile(join(root, "dist/index.js"))),
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
    arguments: {
      workspace_id: "immeuble",
      ...(name === "ghostcrab_business_query_answer"
        ? { projection_only: true }
        : {}),
      ...args
    }
  });
  return {
    name,
    arguments: {
      workspace_id: "immeuble",
      ...(name === "ghostcrab_business_query_answer"
        ? { projection_only: true }
        : {}),
      ...args
    },
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
  receipt.preparation.calls = [];
  for (const profile of profiles) {
    for (const [name, args] of [
      ["ghostcrab_live_create", profile],
      [
        "ghostcrab_live_refresh",
        { artifact_id: `live_answer_view__${profile.slug}` }
      ]
    ]) {
      const result = await call(name, args);
      receipt.preparation.calls.push(result);
      assert.equal(result.isError, false, JSON.stringify(result));
    }
  }
  const catalogue = await client.listTools();
  for (const name of [
    "ghostcrab_business_query_answer",
    "ghostcrab_artifact_get"
  ])
    assert.ok(
      catalogue.tools.some((tool) => tool.name === name),
      name
    );
  const beforeReads = inventory();
  receipt.preparation.inventory_after_startup = beforeReads;
  assert.equal(beforeReads.agent_facts.count, 0);
  for (const scenario of questions) {
    const first = await call("ghostcrab_business_query_answer", {
      question: scenario.question,
      as_of: asOf
    });
    assert.equal(first.isError, false, JSON.stringify(first));
    assert.equal(
      first.result.artifact_id,
      scenario.expected_artifact_id,
      scenario.question
    );
    assert.ok(first.result.next_call, JSON.stringify(first));
    const second = await call(
      first.result.next_call.name,
      first.result.next_call.arguments
    );
    assert.equal(second.isError, false, JSON.stringify(second));
    const answer = second.result.answer;
    assert.equal(answer.ontology.ontology_id, "immeuble::core");
    assert.ok(answer.columns.length > 0);
    assert.ok(answer.assumptions.length > 0);
    assert.ok(answer.ontology.entity_types.length > 0);
    assert.equal(answer.as_of, asOf);
    if (scenario.operation === "group_sum") {
      assert.equal(second.result.answer_available, true);
      assert.deepEqual(
        answer.rows.map((row) => [
          row.entity_id,
          row.total,
          row.expected,
          row.matches
        ]),
        [1227, 1228, 1383, 1499, 1615].map((id) => [id, 1000, 1000, 1])
      );
      assert.deepEqual(
        answer.rows.map((row) => row.member_count),
        [5, 8, 9, 9, 9]
      );
    } else if (scenario.operation === "missing_inbound") {
      assert.equal(second.result.answer_available, true);
      assert.deepEqual(
        answer.rows.map((row) => row.entity_id),
        [1529]
      );
      assert.equal(answer.coverage, "declared_records_only");
    } else {
      assert.equal(second.result.answer_available, false);
      assert.equal(answer.status, "indeterminate");
      assert.deepEqual(
        answer.rows.map((row) => row.entity_id),
        [1342, 1343, 1344, 1345, 1346, 1446, 1562, 1677]
      );
      assert.ok(answer.rows.some((row) => row.fields_complete === 0));
    }
    receipt.scenarios.push({
      ...scenario,
      business_call_count: 2,
      calls: [first, second],
      passed: true
    });
  }
  for (const question of [
    "Quels baux expirent dans 90 jours ?",
    "Les quotités totalisent-elles 900 ?",
    "Quels appartements ont un propriétaire déclaré ?",
    "liste des quotités par immeuble pour Érables",
    "Quelle est la température sur Neptune ?"
  ]) {
    const result = await call("ghostcrab_business_query_answer", {
      question,
      as_of: asOf
    });
    assert.equal(result.result.match_status, "unsupported", question);
    assert.equal(result.result.answer_available, false);
    receipt.scenarios.push({
      question,
      business_call_count: 1,
      calls: [result],
      passed: true
    });
  }
  receipt.probes.other_date = await call("ghostcrab_business_query_answer", {
    question: "liste des baux actifs",
    as_of: "2026-10-01"
  });
  assert.equal(receipt.probes.other_date.result.next_call, null);
  receipt.probes.other_sum_date = await call(
    "ghostcrab_business_query_answer",
    {
      question: "liste des quotités par immeuble",
      as_of: "2026-10-01"
    }
  );
  assert.equal(receipt.probes.other_sum_date.result.next_call, null);
  const binding = receipt.scenarios.find((row) => row.operation === "group_sum")
    .calls[0].result.next_call;
  receipt.probes.foreign_workspace = await call(binding.name, {
    ...binding.arguments,
    workspace_id: "foreign"
  });
  assert.equal(
    receipt.probes.foreign_workspace.result.error.code,
    "workspace_mismatch"
  );
  receipt.probes.wrong_digest = await call(binding.name, {
    ...binding.arguments,
    expected_source_digest: "f".repeat(64)
  });
  assert.equal(
    receipt.probes.wrong_digest.result.error.code,
    "projection_binding_changed"
  );
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
  // Deliberate source mutation on the disposable fixture, outside the read phase.
  const mutation = await fetch(`http://${host}/api/mindbrain/sql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sql: "UPDATE entities_raw SET metadata_json=json_set(metadata_json,'$.tantiemes',191) WHERE workspace_id='immeuble' AND ontology_id='immeuble::core' AND entity_id=1242",
      params: []
    })
  });
  assert.ok(mutation.ok, await mutation.text());
  receipt.probes.source_changed = await call(binding.name, binding.arguments);
  assert.equal(
    receipt.probes.source_changed.result.error.code,
    "projection_stale"
  );
  receipt.probes.refresh_after_change = await call("ghostcrab_live_refresh", {
    artifact_id: binding.arguments.artifact_id
  });
  assert.equal(receipt.probes.refresh_after_change.isError, false);
  receipt.probes.old_version = await call(binding.name, binding.arguments);
  assert.equal(
    receipt.probes.old_version.result.error.code,
    "projection_version_changed"
  );
  const route = await call("ghostcrab_business_query_answer", {
    question: "liste des quotités par immeuble",
    as_of: asOf
  });
  const changed = await call(
    route.result.next_call.name,
    route.result.next_call.arguments
  );
  assert.equal(changed.result.answer.rows[0].total, 1001);
  assert.equal(changed.result.answer.rows[0].matches, 0);
  receipt.probes.changed_answer = [route, changed];
  assert.equal(
    sha(await readFile(fixture)),
    receipt.fixture_sha256,
    "Source fixture changed"
  );
  receipt.summary = {
    passed_scenarios: receipt.scenarios.length,
    two_call_scenarios: questions.length,
    original_lease_data:
      "indeterminate: incomplete declared evidence; not advertised as a complete answer"
  };
  receipt.conclusion = "qualified_bounded_pilot_with_explicit_lease_gaps";
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
  receipt.conclusion = "qualification_failed";
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
