#!/usr/bin/env node
/**
 * Immeuble structured-import smoke: validate → infer → register-semantics → apply → reindex → provenance.
 * Optional Phase D (STRUCTURED_IMPORT_PHASE_D=1): ddl → load-ws → apply from ws_* → reindex → provenance.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const pkgRoot = join(fileURLToPath(import.meta.url), "..", "..");
const demoRoot = join(pkgRoot, "examples", "immeuble", "structured-import");
const model = join(demoRoot, "contracts", "immeuble_structured_import_model.json");
const mapping = join(demoRoot, "contracts", "mapping_external_to_canonical.json");
const mappingWs = join(demoRoot, "contracts", "mapping_external_to_canonical_ws.json");
const fixtures = join(demoRoot, "fixtures");
const facets = join(fixtures, "import_ready", "mfo_facets_import.csv");
const edges = join(fixtures, "import_ready", "graph_edges_import.csv");
const workspaceId = "immeuble-structured-import";

const tmp = mkdtempSync(join(tmpdir(), "ghostcrab-structured-import-smoke-"));
const db = join(tmp, "ghostcrab.sqlite");
const inferOut = join(tmp, "infer.json");

const gcp = join(pkgRoot, "bin", "gcp.mjs");
const env = {
  ...process.env,
  GHOSTCRAB_SQLITE_PATH: db,
  GHOSTCRAB_DOCUMENT_ENGINE: join(
    pkgRoot,
    "vendor",
    "mindbrain",
    "zig-out",
    "bin",
    "mindbrain-standalone-tool"
  )
};

function run(args, { parseJson = false } = {}) {
  const res = spawnSync(process.execPath, [gcp, "brain", "structured-import", ...args], {
    cwd: pkgRoot,
    env,
    encoding: "utf8"
  });
  if (res.status !== 0) {
    console.error(res.stdout);
    console.error(res.stderr);
    throw new Error(`gcp brain structured-import ${args[0]} failed (${res.status})`);
  }
  const out = res.stdout.trim();
  if (parseJson) {
    const line = out.split("\n").find((l) => l.startsWith("{")) ?? out;
    return JSON.parse(line);
  }
  return out;
}

function assertPositive(name, value) {
  if (typeof value !== "number" || value <= 0) {
    throw new Error(`${name}: expected > 0, got ${value}`);
  }
}

try {
  console.log(run(["validate", "--model", model, "--mapping", mapping, "--input", fixtures]));

  const inferPayload = run([
    "infer",
    "--model",
    model,
    "--mapping",
    mapping,
    "--input",
    join(fixtures, "fake_data", "copropriete.csv"),
    "--output",
    inferOut
  ]);
  if (inferPayload) console.log(inferPayload.slice(0, 120) + "...");

  const registerOut = run(
    [
      "--force",
      "register-semantics",
      "--workspace-id",
      workspaceId,
      "--model",
      model,
      "--mapping",
      mapping
    ],
    { parseJson: true }
  );
  console.log(registerOut);
  assertPositive("register.tables", registerOut.tables);

  const applyOut = run(
    [
      "--force",
      "apply",
      "--workspace-id",
      workspaceId,
      "--mode",
      "append",
      "--mapping",
      mapping,
      "--facets",
      facets,
      "--edges",
      edges
    ],
    { parseJson: true }
  );
  console.log(applyOut);
  assertPositive("apply.facets_inserted + apply.facets_updated", applyOut.facets_inserted + applyOut.facets_updated);
  assertPositive("apply.entities_upserted", applyOut.entities_upserted);
  assertPositive("apply.edges_inserted", applyOut.edges_inserted);

  const reindexOut = run(
    ["--force", "reindex", "--workspace-id", workspaceId, "--scope", "all"],
    { parseJson: true }
  );
  console.log(reindexOut);
  assertPositive("reindex.graph_projected", reindexOut.graph_projected);

  const provOut = run(
    ["--force", "validate-provenance", "--workspace-id", workspaceId],
    { parseJson: true }
  );
  console.log(provOut);
  if (!provOut.ok) {
    throw new Error(`provenance validation failed: ${JSON.stringify(provOut)}`);
  }

  const orphanOut = run(
    ["--force", "audit-orphans", "--workspace-id", workspaceId, "--max-ratio", "0.50"],
    { parseJson: true }
  );
  console.log(orphanOut);
  if (!orphanOut.within_threshold) {
    throw new Error(`orphan ratio ${orphanOut.orphan_ratio} exceeds threshold`);
  }

  if (process.env.STRUCTURED_IMPORT_PHASE_D === "1") {
    const ddlSql = join(tmp, "ws_ddl.sql");
    run([
      "--force",
      "ddl-propose",
      "--workspace-id",
      workspaceId,
      "--output",
      ddlSql
    ]);
    run(["--force", "ddl-execute", "--sql", ddlSql]);
    const loadOut = run(
      [
        "--force",
        "load-ws",
        "--workspace-id",
        workspaceId,
        "--mapping",
        mapping,
        "--input",
        fixtures,
        "--mode",
        "append"
      ],
      { parseJson: true }
    );
    console.log(loadOut);
    assertPositive("load-ws.rows_loaded", loadOut.rows_loaded);

    const wsApplyOut = run(
      [
        "--force",
        "apply",
        "--workspace-id",
        workspaceId,
        "--mode",
        "append",
        "--mapping",
        mappingWs
      ],
      { parseJson: true }
    );
    console.log(wsApplyOut);
    assertPositive(
      "ws apply facets_inserted + facets_updated",
      wsApplyOut.facets_inserted + wsApplyOut.facets_updated
    );
    assertPositive("ws apply.entities_upserted", wsApplyOut.entities_upserted);
    if (wsApplyOut.entities_upserted < loadOut.rows_loaded) {
      throw new Error(
        `ws apply entities ${wsApplyOut.entities_upserted} < load-ws rows ${loadOut.rows_loaded}`
      );
    }

    const wsReindexOut = run(
      ["--force", "reindex", "--workspace-id", workspaceId, "--scope", "provenance"],
      { parseJson: true }
    );
    console.log(wsReindexOut);

    const wsProvOut = run(
      ["--force", "validate-provenance", "--workspace-id", workspaceId],
      { parseJson: true }
    );
    console.log(wsProvOut);
    if (!wsProvOut.ok) {
      throw new Error(`ws provenance validation failed: ${JSON.stringify(wsProvOut)}`);
    }

    console.log("structured-import phase D smoke: ok");
  }

  console.log("structured-import smoke: ok");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
