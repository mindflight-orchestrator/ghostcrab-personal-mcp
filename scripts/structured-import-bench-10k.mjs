#!/usr/bin/env node
/**
 * Dev-only benchmark: 10k lot rows through load-ws + apply (data_plane=ws).
 * Not part of CI — prints rows/sec for manual profiling.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const ROWS = 10_000;
const pkgRoot = join(fileURLToPath(import.meta.url), "..", "..");
const demoRoot = join(pkgRoot, "examples", "immeuble", "structured-import");
const model = join(demoRoot, "contracts", "immeuble_structured_import_model.json");
const mapping = join(demoRoot, "contracts", "mapping_external_to_canonical.json");
const mappingWs = join(demoRoot, "contracts", "mapping_external_to_canonical_ws.json");
const workspaceId = "bench-structured-import-10k";

const tmp = mkdtempSync(join(tmpdir(), "ghostcrab-structured-import-bench-"));
const db = join(tmp, "ghostcrab.sqlite");
const fixtures = join(tmp, "fixtures");
const fakeData = join(fixtures, "fake_data");
mkdirSync(fakeData, { recursive: true });

writeFileSync(
  join(fakeData, "copropriete.csv"),
  [
    "record_id,code_abrege,nom_usuel,numero_bce,adresse_siege,nombre_lots,langue_gestion,statut,exercice_comptable_standard,compte_bancaire_principal_iban",
    "copropriete:0001,BENCH,Bench Copro,BE0000000000,\"Bench addr\",10000,fr,active,1er janvier,BE0000000000000000"
  ].join("\n") + "\n"
);

const lotLines = [
  "record_id,numero_lot,type,copropriete_id,statut_occupation,destination_actuelle"
];
for (let i = 1; i <= ROWS; i += 1) {
  const id = String(i).padStart(4, "0");
  lotLines.push(`lot:${id},${i}.01,cave,copropriete:0001,vacant,residentiel`);
}
writeFileSync(join(fakeData, "lot.csv"), lotLines.join("\n") + "\n");

writeFileSync(
  join(fakeData, "personne.csv"),
  "record_id,nom,prenom\npersonne:0001,Bench,User\n"
);

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

function run(args) {
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
  const line = res.stdout.trim().split("\n").find((l) => l.startsWith("{"));
  return line ? JSON.parse(line) : res.stdout.trim();
}

function timed(label, fn) {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  console.log(JSON.stringify({ bench: label, ms: Math.round(ms), ...out }));
  return { ms, out };
}

try {
  run([
    "--force",
    "register-semantics",
    "--workspace-id",
    workspaceId,
    "--model",
    model,
    "--mapping",
    mapping
  ]);

  const ddlSql = join(tmp, "ws_ddl.sql");
  run(["--force", "ddl-propose", "--workspace-id", workspaceId, "--output", ddlSql]);
  run(["--force", "ddl-execute", "--sql", ddlSql]);

  const load = timed("load-ws", () =>
    run([
      "--force",
      "load-ws",
      "--workspace-id",
      workspaceId,
      "--mapping",
      mapping,
      "--input",
      fixtures,
      "--mode",
      "reset"
    ])
  );

  const apply = timed("apply-ws", () =>
    run([
      "--force",
      "apply",
      "--workspace-id",
      workspaceId,
      "--mode",
      "reset",
      "--mapping",
      mappingWs
    ])
  );

  const loadRows = load.out.rows_loaded ?? 0;
  const applyRows = (apply.out.facets_inserted ?? 0) + (apply.out.facets_updated ?? 0);
  console.log(
    JSON.stringify({
      ok: true,
      rows_target: ROWS + 2,
      load_rows_per_sec: loadRows ? Math.round((loadRows / load.ms) * 1000) : 0,
      apply_rows_per_sec: applyRows ? Math.round((applyRows / apply.ms) * 1000) : 0,
      vendor_mindbrain: spawnSync("git", ["-C", join(pkgRoot, "vendor", "mindbrain"), "rev-parse", "--short", "HEAD"], {
        encoding: "utf8"
      }).stdout.trim()
    })
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
