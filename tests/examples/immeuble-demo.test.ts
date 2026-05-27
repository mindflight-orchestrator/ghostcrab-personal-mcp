import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bundlePath = join(
  import.meta.dirname,
  "../../examples/immeuble/reference/bundle.json"
);
const corpusDir = join(
  import.meta.dirname,
  "../../examples/immeuble/mcp-lab/corpus"
);
const immeubleRoot = join(import.meta.dirname, "../../examples/immeuble");
const trainingDir = join(immeubleRoot, "training");

describe("immeuble-demo bundle", () => {
  it("matches the syndic demo reference shape", () => {
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      kind: string;
      scope: { workspace_id: string };
      collections: Array<{ collection_id: string }>;
      documents_raw: unknown[];
      chunks_raw: unknown[];
      facet_assignments_raw: unknown[];
      facet_tables: Array<{
        table_id: number;
        workspace_id: string;
        collection_id: string;
        table_name: string;
        key_column: string;
        content_column: string;
        metadata_column: string;
        language: string;
        bm25_enabled: boolean;
      }>;
      facet_definitions: Array<{
        table_id: number;
        facet_id: number;
        facet_name: string;
      }>;
      entity_aliases_raw: Array<{
        entity_id: number;
        term: string;
      }>;
      entity_documents_raw: Array<{
        entity_id: number;
        doc_id: number;
      }>;
      entity_chunks_raw: Array<{
        entity_id: number;
        doc_id: number;
      }>;
      relation_properties_raw: Array<{
        relation_id: number;
        ref_doc_id: number | null;
      }>;
      entities_raw: Array<{
        entity_id: number;
        entity_type: string;
        name: string;
        metadata_json: string;
      }>;
      relations_raw: Array<{
        relation_id: number;
        edge_type: string;
        source_entity_id: number;
        target_entity_id: number;
      }>;
      ontologies: Array<{ ontology_id: string }>;
      ontology_entity_types: Array<{ entity_type: string }>;
      ontology_edge_types: Array<{ edge_type: string }>;
    };

    expect(bundle.kind).toBe("ghostcrab_backup_bundle");
    expect(bundle.scope.workspace_id).toBe("immeuble-demo");
    expect(bundle.ontologies[0]?.ontology_id).toBe("immeuble-demo::core");
    expect(bundle.collections[0]?.collection_id).toBe("immeuble-demo::docs");

    const entitiesByType = new Map<string, number>();
    for (const entity of bundle.entities_raw) {
      entitiesByType.set(
        entity.entity_type,
        (entitiesByType.get(entity.entity_type) ?? 0) + 1
      );
    }

    expect(entitiesByType.get("building")).toBe(2);
    expect(entitiesByType.get("block")).toBe(3);
    expect(entitiesByType.get("unit")).toBe(13);
    expect(entitiesByType.get("household")).toBe(13);
    expect(entitiesByType.get("lease_contract")).toBeGreaterThanOrEqual(5);
    expect(entitiesByType.get("billing_group")).toBe(13);
    expect(entitiesByType.get("cellar")).toBe(13);
    expect(entitiesByType.get("private_garden")).toBe(6);
    expect(entitiesByType.get("shared_equipment")).toBeGreaterThanOrEqual(4);
    expect(entitiesByType.get("coda_entry")).toBe(3);

    expect(bundle.documents_raw).toHaveLength(7);
    expect(bundle.chunks_raw).toHaveLength(7);
    expect(bundle.facet_assignments_raw.length).toBeGreaterThanOrEqual(10);
    expect(bundle.facet_tables).toEqual([
      expect.objectContaining({
        table_id: 77001,
        workspace_id: "immeuble-demo",
        collection_id: "immeuble-demo::docs",
        table_name: "immeuble-demo::docs",
        key_column: "doc_id",
        content_column: "content",
        metadata_column: "metadata_json",
        language: "fr",
        bm25_enabled: true
      })
    ]);
    expect(bundle.facet_definitions.length).toBeGreaterThanOrEqual(5);
    expect(bundle.entity_documents_raw.length).toBeGreaterThan(0);
    expect(bundle.relation_properties_raw.length).toBeGreaterThan(0);

    expect(
      bundle.relations_raw.every((relation) => relation.edge_type.length > 0)
    ).toBe(true);

    const entityIds = new Set(
      bundle.entities_raw.map((entity) => entity.entity_id)
    );
    const docIds = new Set(
      (bundle.documents_raw as Array<{ doc_id: number }>).map(
        (doc) => doc.doc_id
      )
    );
    const relationIds = new Set(
      bundle.relations_raw.map((relation) => relation.relation_id)
    );
    for (const relation of bundle.relations_raw) {
      expect(entityIds.has(relation.source_entity_id)).toBe(true);
      expect(entityIds.has(relation.target_entity_id)).toBe(true);
    }
    for (const link of bundle.entity_documents_raw) {
      expect(entityIds.has(link.entity_id)).toBe(true);
      expect(docIds.has(link.doc_id)).toBe(true);
    }
    for (const link of bundle.entity_chunks_raw) {
      expect(entityIds.has(link.entity_id)).toBe(true);
      expect(docIds.has(link.doc_id)).toBe(true);
    }
    for (const prop of bundle.relation_properties_raw) {
      expect(relationIds.has(prop.relation_id)).toBe(true);
      if (prop.ref_doc_id !== null)
        expect(docIds.has(prop.ref_doc_id)).toBe(true);
    }

    const facetDefinitionNames = new Set(
      bundle.facet_definitions.map((definition) => definition.facet_name)
    );
    for (const assignment of bundle.facet_assignments_raw as Array<{
      target_kind: string;
      namespace: string;
      dimension: string;
    }>) {
      expect(assignment.target_kind).toBe("doc");
      expect(
        facetDefinitionNames.has(
          `${assignment.namespace}.${assignment.dimension}`
        )
      ).toBe(true);
    }

    const units = bundle.entities_raw
      .filter((entity) => entity.entity_type === "unit")
      .map((entity) => ({
        ...entity,
        metadata: JSON.parse(entity.metadata_json) as {
          building_id: number;
          block: string;
          floor: number;
          lot: string;
          door_label: string;
          tantiemes: number;
          quota_basis: number;
          usage_status: string;
          external_id: string;
        }
      }));
    expect(units).toHaveLength(13);
    for (const unit of units) {
      expect(unit.metadata.building_id).toEqual(expect.any(Number));
      expect(unit.metadata.block).toMatch(/^[AB]$/);
      expect(unit.metadata.floor).toEqual(expect.any(Number));
      expect(unit.metadata.lot).toMatch(/^[AB][1-5]$/);
      expect(unit.metadata.door_label).toMatch(/^[AB]-\d{2}-\d{2}$/);
      expect(unit.metadata.tantiemes).toBeGreaterThan(0);
      expect(unit.metadata.quota_basis).toBe(1000);
      expect(unit.metadata.usage_status).toEqual(expect.any(String));
      expect(unit.metadata.external_id).toMatch(/^[A-Za-z0-9_-]{21}$/);
    }

    const aliasTerms = new Set(
      bundle.entity_aliases_raw.map((alias) => alias.term)
    );
    const peopleAndUnits = bundle.entities_raw.filter((entity) =>
      ["person", "unit"].includes(entity.entity_type)
    );
    const externalIds = new Set<string>();
    for (const entity of peopleAndUnits) {
      const metadata = JSON.parse(entity.metadata_json) as {
        external_id: string;
      };
      expect(metadata.external_id).toMatch(/^[A-Za-z0-9_-]{21}$/);
      expect(aliasTerms.has(metadata.external_id)).toBe(true);
      externalIds.add(metadata.external_id);
    }
    expect(externalIds.size).toBe(peopleAndUnits.length);

    const quotaByBuilding = new Map<number, number>();
    for (const unit of units) {
      quotaByBuilding.set(
        unit.metadata.building_id,
        (quotaByBuilding.get(unit.metadata.building_id) ?? 0) +
          unit.metadata.tantiemes
      );
    }
    expect(quotaByBuilding.get(1)).toBe(1000);
    expect(quotaByBuilding.get(2)).toBe(1000);

    const relationTargetsByEdge = (edgeType: string) =>
      new Set(
        bundle.relations_raw
          .filter((relation) => relation.edge_type === edgeType)
          .map((relation) => relation.source_entity_id)
      );
    const unitIds = units.map((unit) => unit.entity_id);
    const cellarSources = relationTargetsByEdge("assigned_cellar");
    const householdSources = relationTargetsByEdge("primary_residence_of");
    for (const unitId of unitIds) {
      expect(cellarSources.has(unitId)).toBe(true);
      expect(householdSources.has(unitId)).toBe(true);
    }

    const groundFloorUnitIds = units
      .filter((unit) => unit.metadata.floor === 0)
      .map((unit) => unit.entity_id);
    const gardenSources = relationTargetsByEdge("uses_exclusive");
    for (const unitId of groundFloorUnitIds) {
      expect(gardenSources.has(unitId)).toBe(true);
    }

    const entityTypes = bundle.ontology_entity_types.map(
      (row) => row.entity_type
    );
    expect(entityTypes).toEqual(
      expect.arrayContaining([
        "building",
        "block",
        "unit",
        "household",
        "lease_contract",
        "private_garden",
        "shared_equipment",
        "billing_group",
        "coda_entry",
        "charge_call",
        "receipt",
        "reminder"
      ])
    );

    const edgeTypes = bundle.ontology_edge_types.map((row) => row.edge_type);
    expect(edgeTypes).toEqual(
      expect.arrayContaining([
        "building_contains_unit",
        "block_contains_unit",
        "building_contains_block",
        "owns",
        "occupies",
        "household_member",
        "primary_residence_of",
        "leases",
        "rented_to",
        "uses_exclusive",
        "uses_common",
        "has_member",
        "matched_to",
        "allocated_to",
        "superseded_by"
      ])
    );
  });

  it("ships a realistic source corpus for LLM reconstruction", () => {
    const manifest = JSON.parse(
      readFileSync(join(corpusDir, "manifest.json"), "utf8")
    ) as {
      workspace_id: string;
      collection_id: string;
      ontology_id: string;
      files: Array<{ filename: string; document_type: string }>;
    };
    const expectedCoverage = JSON.parse(
      readFileSync(join(corpusDir, "expected-coverage.json"), "utf8")
    ) as {
      workspace_id: string;
      golden_workspace_id: string;
      counts: Record<string, number>;
      relation_edges: string[];
      document_facets: { "source.document_type": string[] };
    };

    expect(manifest.workspace_id).toBe("immeuble-demo-llm");
    expect(manifest.collection_id).toBe("immeuble-demo-llm::docs");
    expect(manifest.ontology_id).toBe("immeuble-demo::core");
    expect(manifest.files).toHaveLength(8);
    expect(expectedCoverage.workspace_id).toBe("immeuble-demo-llm");
    expect(expectedCoverage.golden_workspace_id).toBe("immeuble-demo");
    expect(expectedCoverage.counts.units).toBe(13);
    expect(expectedCoverage.counts.cellars).toBe(13);
    expect(expectedCoverage.relation_edges).toEqual(
      expect.arrayContaining(["owns", "occupies", "leases", "assigned_cellar"])
    );
    expect(expectedCoverage.document_facets["source.document_type"]).toEqual(
      manifest.files.map((file) => file.document_type)
    );

    for (const file of manifest.files) {
      const path = join(corpusDir, file.filename);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf8");
      expect(content).toContain("# ");
      expect(content.length).toBeGreaterThan(200);
    }
  });
});

describe("immeuble training fixtures", () => {
  it("ships draft and golden bundles with catalogued errors", () => {
    const manifest = JSON.parse(
      readFileSync(join(trainingDir, "training-manifest.json"), "utf8")
    ) as {
      source_bundle: string;
      workspaces: { draft: string; golden: string };
      errors: Array<{ id: string }>;
      modules: Record<string, unknown>;
    };

    expect(manifest.source_bundle).toBe("examples/immeuble/reference/bundle.json");
    expect(manifest.workspaces.draft).toBe("immeuble-training-draft");
    expect(manifest.workspaces.golden).toBe("immeuble-training-golden");
    expect(manifest.errors.map((e) => e.id)).toEqual(["E01", "E02", "E03"]);
    expect(manifest.modules.A2).toBeTruthy();
    expect(manifest.modules.A3).toBeTruthy();

    for (const name of ["draft.json", "resolved.json"]) {
      const path = join(trainingDir, "bundles", name);
      expect(existsSync(path)).toBe(true);
      const bundle = JSON.parse(readFileSync(path, "utf8")) as {
        scope: { workspace_id: string };
      };
      expect(bundle.scope.workspace_id).toMatch(/immeuble-training-/);
    }

    for (const rule of [
      "L0-patrimoine.json",
      "L1-syndic-naive.json",
      "L2-syndic-filtered.json",
      "L3-full.json",
      "motifs.json"
    ]) {
      expect(existsSync(join(trainingDir, "gap-rules", rule))).toBe(true);
    }
  });
});

describe("immeuble mcp-lab fixtures", () => {
  it("ships workspace config, success criteria, and prompt pack", () => {
    const mcpLabDir = join(immeubleRoot, "mcp-lab");
    const workspace = JSON.parse(
      readFileSync(join(mcpLabDir, "workspace.json"), "utf8")
    ) as { workspace_id: string; golden_workspace_id: string };

    expect(workspace.workspace_id).toBe("immeuble-demo-llm");
    expect(workspace.golden_workspace_id).toBe("immeuble-demo");
    expect(existsSync(join(mcpLabDir, "success-criteria.yaml"))).toBe(true);

    for (const prompt of [
      "00-prerequisites.md",
      "01-discovery-and-model-proposal.md",
      "02-ontology-register.md",
      "03-gap-rules-design.md",
      "04-document-ingest.md",
      "05-graph-extraction.md",
      "06-validate-and-compare.md"
    ]) {
      expect(existsSync(join(mcpLabDir, "prompts", prompt))).toBe(true);
    }
  });

  it("keeps legacy shim paths reachable", () => {
    const legacyBundle = join(import.meta.dirname, "../../examples/immeuble-demo/bundle.json");
    const legacySources = join(import.meta.dirname, "../../examples/immeuble-demo/sources/manifest.json");
    expect(existsSync(legacyBundle)).toBe(true);
    expect(existsSync(legacySources)).toBe(true);
  });
});
