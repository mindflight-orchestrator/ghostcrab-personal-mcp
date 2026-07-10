import { mkdtempSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { runNativeEngineSync } from "../../bin/lib/brain-engine-runner.mjs";

const repoRoot = resolve(import.meta.dirname, "../..");
const pkgRoot = repoRoot;
const demoBundlePath = resolve(
  repoRoot,
  "examples/immeuble/bundle/immeuble.bundle.json"
);
const demoLinkmlPath = resolve(repoRoot, "ontologies/immeuble/core.yaml");

function sortedEntityTypes(rows: Array<{ entity_type: string }>) {
  return rows.map((row) => row.entity_type).sort();
}

function sortedEdgeTypes(rows: Array<{ edge_type: string }>) {
  return rows.map((row) => row.edge_type).sort();
}

function runNative(args: string[]) {
  const result = runNativeEngineSync(pkgRoot, args, { preferDev: true });
  expect(result.ok, result.stderr || result.stdout).toBe(true);
  return result;
}

describe("ontology interchange", () => {
  it("compiles immeuble LinkML to native entity and edge types", () => {
    const outputPath = join(
      mkdtempSync(join(tmpdir(), "ontology-compile-")),
      "slice.json"
    );

    runNative([
      "ontology-compile-linkml",
      "--workspace-id",
      "immeuble",
      "--ontology-id",
      "immeuble::core",
      "--input",
      demoLinkmlPath,
      "--output",
      outputPath
    ]);

    const slice = JSON.parse(readFileSync(outputPath, "utf8")) as {
      ontology_entity_types: Array<{ entity_type: string }>;
      ontology_edge_types: Array<{ edge_type: string }>;
      ontology_triples: unknown[];
      ontologies: Array<{ source_kind: string }>;
    };

    expect(sortedEntityTypes(slice.ontology_entity_types)).toEqual([
      "bank_account",
      "billing_group",
      "block",
      "building",
      "cellar",
      "charge_call",
      "coda_entry",
      "decision",
      "document",
      "event",
      "household",
      "lease_contract",
      "organization",
      "ownership_group",
      "parking_space",
      "payment_allocation",
      "person",
      "private_garden",
      "receipt",
      "reminder",
      "role",
      "shared_equipment",
      "shared_space",
      "unit"
    ]);

    expect(sortedEdgeTypes(slice.ontology_edge_types)).toEqual([
      "allocated_to",
      "assigned_cellar",
      "assigned_garage",
      "bills_to",
      "block_contains_unit",
      "building_contains_block",
      "building_contains_cellar",
      "building_contains_parking_space",
      "building_contains_private_garden",
      "building_contains_shared_equipment",
      "building_contains_shared_space",
      "building_contains_unit",
      "closed",
      "created",
      "decided_by",
      "has_member",
      "household_member",
      "leases",
      "manages",
      "matched_to",
      "occupies",
      "owns",
      "part_of",
      "primary_residence_of",
      "records",
      "rented_to",
      "represents",
      "requires_review",
      "shared_space_contains_equipment",
      "superseded_by",
      "triggered",
      "uses_common",
      "uses_exclusive"
    ]);

    expect(slice.ontology_triples.length).toBeGreaterThan(0);
    expect(slice.ontologies[0]?.source_kind).toBe("linkml");
  });

  it("exports immeuble bundle to LinkML with native type annotations", () => {
    const outputPath = join(
      mkdtempSync(join(tmpdir(), "ontology-export-")),
      "exported.yaml"
    );

    runNative([
      "ontology-export-linkml",
      "--ontology-id",
      "immeuble::core",
      "--input-bundle",
      demoBundlePath,
      "--output",
      outputPath
    ]);

    const yaml = readFileSync(outputPath, "utf8");
    expect(yaml).toContain("native_entity_type: building");
    expect(yaml).toContain("native_edge_type: owns");
    expect(yaml).toContain("classes:");
    expect(yaml).toContain("slots:");
  });

  it("round-trips bundle entity and edge types through LinkML compile", () => {
    const bundle = JSON.parse(readFileSync(demoBundlePath, "utf8")) as {
      ontology_entity_types: Array<{
        entity_type: string;
        ontology_id: string;
      }>;
      ontology_edge_types: Array<{ edge_type: string; ontology_id: string }>;
    };

    const expectedEntities = sortedEntityTypes(
      bundle.ontology_entity_types.filter(
        (row) => row.ontology_id === "immeuble::core"
      )
    );
    const expectedEdges = sortedEdgeTypes(
      bundle.ontology_edge_types.filter(
        (row) => row.ontology_id === "immeuble::core"
      )
    );

    const tmpDir = mkdtempSync(join(tmpdir(), "ontology-roundtrip-"));
    const exportedPath = join(tmpDir, "roundtrip.yaml");
    const compiledPath = join(tmpDir, "roundtrip.json");

    runNative([
      "ontology-export-linkml",
      "--ontology-id",
      "immeuble::core",
      "--input-bundle",
      demoBundlePath,
      "--output",
      exportedPath
    ]);

    runNative([
      "ontology-compile-linkml",
      "--workspace-id",
      "immeuble",
      "--ontology-id",
      "immeuble::core",
      "--input",
      exportedPath,
      "--output",
      compiledPath
    ]);

    const compiled = JSON.parse(readFileSync(compiledPath, "utf8")) as {
      ontology_entity_types: Array<{ entity_type: string }>;
      ontology_edge_types: Array<{ edge_type: string }>;
    };

    expect(sortedEntityTypes(compiled.ontology_entity_types)).toEqual(
      expectedEntities
    );
    expect(sortedEdgeTypes(compiled.ontology_edge_types)).toEqual(
      expectedEdges
    );

    unlinkSync(exportedPath);
    unlinkSync(compiledPath);
  });
});
