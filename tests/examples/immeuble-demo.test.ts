import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const immeubleRoot = join(import.meta.dirname, "../../examples/immeuble");
const bundlePath = join(immeubleRoot, "bundle/immeuble.bundle.json");
const documentsDir = join(immeubleRoot, "sources/documents");
const gapRulesDir = join(immeubleRoot, "gap-rules");

describe("immeuble bundle", () => {
  it("matches the syndic reference shape on workspace immeuble", () => {
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      kind: string;
      scope: { workspace_id: string };
      collections: Array<{ collection_id: string }>;
      documents_raw: unknown[];
      entities_raw: Array<{ entity_type: string; entity_id: number }>;
      relations_raw: Array<{ edge_type: string }>;
      ontologies: Array<{ ontology_id: string }>;
    };

    expect(bundle.kind).toBe("ghostcrab_backup_bundle");
    expect(bundle.scope.workspace_id).toBe("immeuble");
    expect(bundle.ontologies[0]?.ontology_id).toBe("immeuble::core");
    expect(bundle.collections[0]?.collection_id).toBe("immeuble::docs");

    const entitiesByType = new Map<string, number>();
    for (const entity of bundle.entities_raw) {
      entitiesByType.set(
        entity.entity_type,
        (entitiesByType.get(entity.entity_type) ?? 0) + 1
      );
    }

    expect(entitiesByType.get("building")).toBe(2);
    expect(entitiesByType.get("unit")).toBe(13);
    expect(entitiesByType.get("lease_contract")).toBeGreaterThanOrEqual(5);
    expect(entitiesByType.get("coda_entry")).toBe(3);
    expect(bundle.documents_raw).toHaveLength(7);
    expect(bundle.relations_raw.length).toBeGreaterThan(100);
  });
});

describe("immeuble example layout", () => {
  it("ships MVP_Serenity_2-style folders and generator outputs", () => {
    for (const dir of [
      "model",
      "contracts",
      "fake_data",
      "import_ready",
      "reports",
      "scripts",
      "bundle"
    ]) {
      expect(existsSync(join(immeubleRoot, dir))).toBe(true);
    }

    expect(existsSync(join(immeubleRoot, "model/immeuble_model.json"))).toBe(
      true
    );
    expect(
      existsSync(join(immeubleRoot, "contracts/projection_catalog.yaml"))
    ).toBe(true);
    expect(
      existsSync(join(immeubleRoot, "contracts/consumer_contract.yaml"))
    ).toBe(true);
    expect(existsSync(join(immeubleRoot, "import_manifest.yaml"))).toBe(true);
    expect(
      existsSync(join(immeubleRoot, "scripts/build-immeuble-model.mjs"))
    ).toBe(true);
    expect(
      existsSync(join(immeubleRoot, "scripts/run-immeuble-import.mjs"))
    ).toBe(true);

    const csvCount = readdirSync(join(immeubleRoot, "fake_data")).filter((f) =>
      f.endsWith(".csv")
    ).length;
    expect(csvCount).toBeGreaterThanOrEqual(10);

    const model = JSON.parse(
      readFileSync(join(immeubleRoot, "model/immeuble_model.json"), "utf8")
    ) as { workspace_id: string; entity_types: unknown[] };
    expect(model.workspace_id).toBe("immeuble");
    expect(model.entity_types.length).toBeGreaterThanOrEqual(10);
  });

  it("ships source documents and gap-rules curriculum", () => {
    const manifest = JSON.parse(
      readFileSync(join(documentsDir, "manifest.json"), "utf8")
    ) as { files: Array<{ filename: string }> };

    expect(manifest.files.length).toBeGreaterThanOrEqual(8);
    for (const file of manifest.files) {
      expect(existsSync(join(documentsDir, file.filename))).toBe(true);
    }

    for (const rule of [
      "L0-patrimoine.json",
      "L2-syndic-filtered.json",
      "demo.json",
      "syndic.json"
    ]) {
      expect(existsSync(join(gapRulesDir, rule))).toBe(true);
    }
  });

  it("schema_id prefix validation report is green after build", () => {
    const report = JSON.parse(
      readFileSync(
        join(immeubleRoot, "reports/01-model.validation.json"),
        "utf8"
      )
    ) as { ok: boolean; schema_id_prefix: string };
    expect(report.ok).toBe(true);
    expect(report.schema_id_prefix).toBe("immeuble:");
  });
});
