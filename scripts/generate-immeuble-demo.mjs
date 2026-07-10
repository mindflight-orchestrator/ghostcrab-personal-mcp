import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync
} from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function parseTrainingArgs(argv) {
  const opts = { training: false, emit: ["draft", "resolved"] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--training") {
      opts.training = true;
    } else if (arg === "--emit") {
      opts.emit = (argv[++i] ?? "").split(",").filter(Boolean);
    } else if (arg.startsWith("--emit=")) {
      opts.emit = arg.slice("--emit=".length).split(",").filter(Boolean);
    } else if (arg === "-h" || arg === "--help") {
      console.error(`Usage:
  node scripts/generate-immeuble.mjs
  node scripts/generate-immeuble.mjs --training --emit draft,resolved

Flags:
  --training              Emit immeuble/training draft/golden bundles
  --emit draft,resolved   Comma-separated training outputs (default: draft,resolved)
`);
      process.exit(0);
    } else if (arg.startsWith("-")) {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return opts;
}

const trainingOpts = parseTrainingArgs(process.argv.slice(2));
if (trainingOpts.training) {
  const want = new Set(trainingOpts.emit);
  if (!want.has("draft") && !want.has("resolved")) {
    console.error("error: --emit must include draft and/or resolved");
    process.exit(1);
  }
  const result = spawnSync(
    "python3",
    [join(REPO_ROOT, "scripts/generate-immeuble-training-bundles.py")],
    { cwd: REPO_ROOT, stdio: "inherit" }
  );
  process.exit(result.status ?? 1);
}

const WS = "immeuble";
const ONT = "immeuble::core";
const COLL = "immeuble::docs";
const FACET_TABLE_ID = 77001;
const ARTIFACT_TS = 1760000000;
const REFERENCE_DIR = join(REPO_ROOT, "examples/immeuble");
const DOCS_DIR = join(REFERENCE_DIR, "sources/documents");
const SOURCES_DIR = join(REFERENCE_DIR, "sources/documents");
const BUNDLE_OUT = join(REFERENCE_DIR, "bundle/immeuble.bundle.json");

mkdirSync(DOCS_DIR, { recursive: true });
mkdirSync(SOURCES_DIR, { recursive: true });

const j = (value) => JSON.stringify(value);

function resolveMindbrainTool() {
  const candidates = [
    process.env.MINDBRAIN_STANDALONE_TOOL?.trim(),
    join(REPO_ROOT, "vendor/mindbrain/zig-out/bin/mindbrain-standalone-tool"),
    join(REPO_ROOT, "../mindbrain/zig-out/bin/mindbrain-standalone-tool")
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "mindbrain-standalone-tool not found. Build ../mindbrain (zig build standalone-tool) or vendor/mindbrain."
  );
}

function compileLinkmlOntologySlice() {
  const tool = resolveMindbrainTool();
  const inputPath = join(REPO_ROOT, "ontologies/immeuble/core.yaml");
  const tmpDir = mkdtempSync(join(tmpdir(), "immeuble-linkml-"));
  const outputPath = join(tmpDir, "ontology-slice.json");
  const result = spawnSync(
    tool,
    [
      "ontology-compile-linkml",
      "--workspace-id",
      WS,
      "--ontology-id",
      ONT,
      "--input",
      inputPath,
      "--output",
      outputPath
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `ontology-compile-linkml failed (${result.status}): ${result.stderr || result.stdout}`
    );
  }
  const slice = JSON.parse(readFileSync(outputPath, "utf8"));
  rmSync(tmpDir, { recursive: true, force: true });
  return slice;
}

function mergeOntologyDimensions(linkmlDimensions, facetDimensions) {
  const byKey = new Map();
  for (const row of [...linkmlDimensions, ...facetDimensions]) {
    byKey.set(`${row.namespace}.${row.dimension}`, row);
  }
  return [...byKey.values()].sort((a, b) =>
    `${a.namespace}.${a.dimension}`.localeCompare(
      `${b.namespace}.${b.dimension}`
    )
  );
}

/** Schema-level pattern graph for qualified-relation visualization (proposition.md). */
const ontologySeedEntities = [
  {
    ontology_id: ONT,
    entity_id: 1,
    entity_type: "property_relation",
    label: "RelationPropriété",
    metadata_json: j({
      schema_pattern: "qualified_relation",
      layer: "schema_graph"
    })
  },
  {
    ontology_id: ONT,
    entity_id: 2,
    entity_type: "person",
    label: "Personne",
    metadata_json: j({ schema_role: "titulaire", layer: "schema_graph" })
  },
  {
    ontology_id: ONT,
    entity_id: 3,
    entity_type: "unit",
    label: "Lot",
    metadata_json: j({ schema_role: "objet", layer: "schema_graph" })
  },
  {
    ontology_id: ONT,
    entity_id: 4,
    entity_type: "document",
    label: "Document",
    metadata_json: j({ schema_role: "preuve", layer: "schema_graph" })
  },
  {
    ontology_id: ONT,
    entity_id: 5,
    entity_type: "event",
    label: "Événement",
    metadata_json: j({ schema_role: "impact", layer: "schema_graph" })
  }
];

const ontologySeedRelations = [
  {
    ontology_id: ONT,
    relation_id: 1,
    edge_type: "titulaireDe",
    source_entity_id: 2,
    target_entity_id: 1,
    metadata_json: j({ schema_pattern: "qualified_relation" })
  },
  {
    ontology_id: ONT,
    relation_id: 2,
    edge_type: "porteSur",
    source_entity_id: 1,
    target_entity_id: 3,
    metadata_json: j({ schema_pattern: "qualified_relation" })
  },
  {
    ontology_id: ONT,
    relation_id: 3,
    edge_type: "confirmePar",
    source_entity_id: 1,
    target_entity_id: 4,
    metadata_json: j({ schema_pattern: "qualified_relation" })
  },
  {
    ontology_id: ONT,
    relation_id: 4,
    edge_type: "impactePar",
    source_entity_id: 1,
    target_entity_id: 5,
    metadata_json: j({ schema_pattern: "qualified_relation" })
  }
];
const rows = {
  entities: [],
  relations: [],
  relationProps: [],
  entityDocs: [],
  entityChunks: [],
  aliases: [],
  docs: [],
  chunks: [],
  facets: []
};

let relationId = 1;

function deterministicNanoId(seed) {
  const alphabet =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";
  const bytes = createHash("sha256").update(seed).digest();
  let out = "";
  for (let index = 0; out.length < 21; index++) {
    out += alphabet[bytes[index % bytes.length] & 63];
  }
  return out;
}

function entity(id, entity_type, name, metadata = {}) {
  const enrichedMetadata = { ...metadata };
  if (
    (entity_type === "person" || entity_type === "unit") &&
    !enrichedMetadata.external_id
  ) {
    enrichedMetadata.external_id = deterministicNanoId(
      `${WS}:${entity_type}:${id}`
    );
    rows.aliases.push({
      workspace_id: WS,
      entity_id: id,
      term: enrichedMetadata.external_id,
      confidence: 1
    });
  }
  rows.entities.push({
    workspace_id: WS,
    ontology_id: ONT,
    entity_id: id,
    entity_type,
    name,
    confidence: 1,
    metadata_json: j(enrichedMetadata)
  });
  return id;
}

function relation(
  source_entity_id,
  edge_type,
  target_entity_id,
  metadata = {},
  valid_from = null,
  valid_to = null
) {
  const id = relationId++;
  rows.relations.push({
    workspace_id: WS,
    ontology_id: ONT,
    relation_id: id,
    edge_type,
    source_entity_id,
    target_entity_id,
    valid_from,
    valid_to,
    confidence: 1,
    metadata_json: j(metadata)
  });
  return id;
}

function relationProp(relation_id, property_key, value, ref_doc_id = null) {
  const base = {
    workspace_id: WS,
    relation_id,
    property_key,
    ref_doc_id,
    currency: null
  };

  if (typeof value === "number") {
    rows.relationProps.push({
      ...base,
      value_type: "number",
      value_text: null,
      value_number: value,
      value_integer: null
    });
    return;
  }

  rows.relationProps.push({
    ...base,
    value_type: "text",
    value_text: String(value),
    value_number: null,
    value_integer: null
  });
}

function moneyProp(
  relation_id,
  property_key,
  amount,
  currency = "EUR",
  ref_doc_id = null
) {
  rows.relationProps.push({
    workspace_id: WS,
    relation_id,
    property_key,
    value_type: "money_minor",
    value_text: null,
    value_number: null,
    value_integer: Math.round(amount * 100),
    ref_doc_id,
    currency
  });
}

function document(doc_id, filename, title, content, facets) {
  const source_ref = `examples/immeuble/sources/documents/${filename}`;
  writeFileSync(join(DOCS_DIR, filename), `${content.trim()}\n`);
  rows.docs.push({
    workspace_id: WS,
    collection_id: COLL,
    doc_id,
    doc_nanoid: `immeuble-doc-${doc_id}`,
    content,
    language: "fr",
    source_ref,
    summary: title,
    metadata_json: j({ title, synthetic: true })
  });
  rows.chunks.push({
    workspace_id: WS,
    collection_id: COLL,
    doc_id,
    chunk_index: 0,
    content,
    language: "fr",
    offset_start: 0,
    offset_end: content.length,
    strategy: "whole_document",
    token_count: content.split(/\s+/).filter(Boolean).length,
    parent_chunk_index: null,
    metadata_json: j({ title })
  });
  for (const [namespace, dimension, value, weight = 1] of facets) {
    rows.facets.push({
      workspace_id: WS,
      collection_id: COLL,
      target_kind: "doc",
      doc_id,
      chunk_index: -1,
      ontology_id: ONT,
      namespace,
      dimension,
      value,
      value_id: null,
      weight,
      source: "synthetic-qualified-demo"
    });
  }
}

function sourceDocument(filename, title, content) {
  writeFileSync(
    join(SOURCES_DIR, filename),
    `# ${title}\n\n${content.trim()}\n`
  );
}

function evidence(entity_id, doc_id, role = "evidence") {
  rows.entityDocs.push({
    workspace_id: WS,
    entity_id,
    collection_id: COLL,
    doc_id,
    role,
    confidence: 1
  });
  rows.entityChunks.push({
    workspace_id: WS,
    entity_id,
    collection_id: COLL,
    doc_id,
    chunk_index: 0,
    role,
    confidence: 1
  });
}

const buildings = [
  {
    id: 1,
    name: "Résidence Les Tilleuls",
    address: "12 rue des Tilleuls, 5000 Namur",
    quota_total: 1000
  },
  {
    id: 2,
    name: "Résidence Les Érables",
    address: "8 avenue des Érables, 1300 Wavre",
    quota_total: 1000
  }
];

for (const building of buildings) {
  entity(building.id, "building", building.name, {
    address: building.address,
    quota_basis: building.quota_total
  });
}

entity(10, "block", "Tilleuls Bloc A", {
  building_id: 1,
  building: buildings[0].name
});
entity(20, "block", "Érables Bloc A", {
  building_id: 2,
  building: buildings[1].name
});
entity(21, "block", "Érables Bloc B", {
  building_id: 2,
  building: buildings[1].name
});
relation(1, "contains", 10);
relation(2, "contains", 20);
relation(2, "contains", 21);

const sharedSpaces = [
  [30, "shared_space", "Tilleuls Hall commun", 1, { category: "circulation" }],
  [
    31,
    "shared_space",
    "Tilleuls Buanderie commune",
    1,
    { category: "laundry" }
  ],
  [32, "shared_space", "Tilleuls Jardin commun", 1, { category: "garden" }],
  [33, "shared_space", "Érables Jardin commun", 2, { category: "garden" }],
  [34, "shared_space", "Érables Local vélos", 2, { category: "bike_room" }],
  [35, "shared_space", "Érables Chaufferie", 2, { category: "technical" }],
  [
    40,
    "shared_equipment",
    "Tilleuls Machine à laver 1",
    1,
    { equipment_type: "washing_machine" }
  ],
  [
    41,
    "shared_equipment",
    "Tilleuls Sèche-linge 1",
    1,
    { equipment_type: "dryer" }
  ],
  [
    42,
    "shared_equipment",
    "Érables Machine à laver A",
    2,
    { equipment_type: "washing_machine" }
  ],
  [
    43,
    "shared_equipment",
    "Érables Machine à laver B",
    2,
    { equipment_type: "washing_machine" }
  ]
];
for (const [id, type, name, buildingId, metadata] of sharedSpaces) {
  entity(id, type, name, { building_id: buildingId, ...metadata });
  relation(buildingId, "contains", id);
}
relation(31, "contains", 40);
relation(31, "contains", 41);
relation(33, "contains", 42);
relation(33, "contains", 43);

const units = [
  [
    100,
    1,
    10,
    "Tilleuls Appartement A1",
    "A1",
    "A",
    0,
    "A-00-01",
    2,
    190,
    "owner_occupied"
  ],
  [
    101,
    1,
    10,
    "Tilleuls Appartement A2",
    "A2",
    "A",
    0,
    "A-00-02",
    1,
    180,
    "owner_occupied"
  ],
  [
    102,
    1,
    10,
    "Tilleuls Appartement A3",
    "A3",
    "A",
    1,
    "A-01-01",
    3,
    220,
    "owner_occupied"
  ],
  [
    103,
    1,
    10,
    "Tilleuls Appartement A4",
    "A4",
    "A",
    1,
    "A-01-02",
    1,
    190,
    "tenant_occupied"
  ],
  [
    104,
    1,
    10,
    "Tilleuls Appartement A5",
    "A5",
    "A",
    2,
    "A-02-01",
    3,
    220,
    "owner_occupied"
  ],
  [
    110,
    2,
    20,
    "Érables Appartement A1",
    "A1",
    "A",
    0,
    "A-00-01",
    2,
    120,
    "owner_occupied"
  ],
  [
    111,
    2,
    20,
    "Érables Appartement A2",
    "A2",
    "A",
    0,
    "A-00-02",
    2,
    125,
    "tenant_occupied"
  ],
  [
    112,
    2,
    20,
    "Érables Appartement A3",
    "A3",
    "A",
    1,
    "A-01-01",
    1,
    125,
    "owner_occupied"
  ],
  [
    113,
    2,
    20,
    "Érables Appartement A4",
    "A4",
    "A",
    1,
    "A-01-02",
    3,
    130,
    "vacant_works"
  ],
  [
    120,
    2,
    21,
    "Érables Appartement B1",
    "B1",
    "B",
    0,
    "B-00-01",
    2,
    120,
    "owner_occupied"
  ],
  [
    121,
    2,
    21,
    "Érables Appartement B2",
    "B2",
    "B",
    0,
    "B-00-02",
    2,
    125,
    "tenant_occupied"
  ],
  [
    122,
    2,
    21,
    "Érables Appartement B3",
    "B3",
    "B",
    1,
    "B-01-01",
    2,
    125,
    "tenant_occupied"
  ],
  [
    123,
    2,
    21,
    "Érables Appartement B4",
    "B4",
    "B",
    1,
    "B-01-02",
    4,
    130,
    "owner_abroad_tenant"
  ]
];

for (const [
  id,
  building_id,
  block_id,
  name,
  lot,
  block,
  floor,
  door_label,
  bedrooms,
  tantiemes,
  usage_status
] of units) {
  const building = buildings.find((candidate) => candidate.id === building_id);
  entity(id, "unit", name, {
    building_id,
    building: building.name,
    block_id,
    block,
    floor,
    lot,
    door_label,
    bedrooms,
    tantiemes,
    quota_basis: 1000,
    usage_status
  });
  relation(block_id, "contains", id);
  relation(building_id, "contains", id);
}

const cellarBase = 500;
const parkingBase = 600;
const gardenBase = 700;
for (let index = 0; index < units.length; index++) {
  const [unitId, buildingId, , unitName, lot, block, floor] = units[index];
  const cellarId = cellarBase + index;
  entity(cellarId, "cellar", `${unitName} Cave`, {
    building_id: buildingId,
    lot,
    block
  });
  relation(buildingId, "contains", cellarId);
  relation(unitId, "assigned_cellar", cellarId);

  if ([100, 102, 104, 110, 113, 120, 123].includes(unitId)) {
    const parkingId = parkingBase + index;
    entity(parkingId, "parking_space", `${unitName} Garage`, {
      building_id: buildingId,
      lot,
      block,
      parking_kind: "garage_box"
    });
    relation(buildingId, "contains", parkingId);
    relation(unitId, "assigned_garage", parkingId);
  }

  if (floor === 0) {
    const gardenId = gardenBase + index;
    entity(gardenId, "private_garden", `${unitName} Jardin privatif`, {
      building_id: buildingId,
      lot,
      block,
      exclusive_use: true
    });
    relation(buildingId, "contains", gardenId);
    relation(unitId, "uses_exclusive", gardenId);
  }
}

const people = [
  [200, "organization", "Syndic Horizon Gestion", { role: "syndic" }],
  [
    201,
    "organization",
    "ACP Résidence Les Tilleuls",
    { role: "association_coproprietaires" }
  ],
  [
    202,
    "organization",
    "ACP Résidence Les Érables",
    { role: "association_coproprietaires" }
  ],
  [203, "organization", "Immo Invest SRL", { role: "investor_landlord" }],
  [204, "organization", "Patrimoine Nord SRL", { role: "investor_landlord" }],
  [210, "person", "Marie Lambert", { role: "comptable", age_band: "40-49" }],
  [
    211,
    "person",
    "Henri Dupont",
    { age_band: "75-84", household_role: "conjoint" }
  ],
  [
    212,
    "person",
    "Madeleine Dupont",
    { age_band: "75-84", household_role: "conjoint" }
  ],
  [
    213,
    "person",
    "Nicolas Dupont",
    { age_band: "45-54", household_role: "parent" }
  ],
  [
    214,
    "person",
    "Pauline Dupont",
    { age_band: "45-54", household_role: "parent" }
  ],
  [
    215,
    "person",
    "Lina Dupont",
    { age_band: "10-17", household_role: "enfant" }
  ],
  [216, "person", "Tom Dupont", { age_band: "6-9", household_role: "enfant" }],
  [
    217,
    "person",
    "Sofia Martin",
    { age_band: "30-39", household_role: "single" }
  ],
  [
    218,
    "person",
    "Karim Benali",
    { age_band: "30-39", household_role: "single" }
  ],
  [
    219,
    "person",
    "Lena Peeters",
    { age_band: "35-44", household_role: "parent" }
  ],
  [
    220,
    "person",
    "Noah De Smet",
    { age_band: "35-44", household_role: "parent" }
  ],
  [
    221,
    "person",
    "Mila De Smet",
    { age_band: "0-5", household_role: "enfant" }
  ],
  [
    222,
    "person",
    "Alice Bernard",
    { age_band: "55-64", household_role: "single" }
  ],
  [
    223,
    "person",
    "Marc Legrand",
    { age_band: "40-49", household_role: "parent" }
  ],
  [
    224,
    "person",
    "Eva Legrand",
    { age_band: "40-49", household_role: "parent" }
  ],
  [
    225,
    "person",
    "Nora Legrand",
    { age_band: "10-17", household_role: "enfant" }
  ],
  [
    226,
    "person",
    "Victor Moreau",
    { age_band: "30-39", household_role: "single" }
  ],
  [
    227,
    "person",
    "Claire Dubois",
    { age_band: "30-39", household_role: "single" }
  ],
  [
    228,
    "person",
    "Fatima El Idrissi",
    { age_band: "35-44", household_role: "parent" }
  ],
  [
    229,
    "person",
    "Samir El Idrissi",
    { age_band: "35-44", household_role: "parent" }
  ],
  [
    230,
    "person",
    "Yanis El Idrissi",
    { age_band: "6-9", household_role: "enfant" }
  ],
  [
    231,
    "person",
    "Amel El Idrissi",
    { age_band: "0-5", household_role: "enfant" }
  ],
  [
    232,
    "person",
    "Olivier Renard",
    { age_band: "45-54", household_role: "usufruitier" }
  ],
  [
    233,
    "person",
    "Julie Renard",
    { age_band: "18-24", household_role: "nu_proprietaire" }
  ],
  [
    234,
    "person",
    "Marta Rossi",
    { age_band: "65-74", household_role: "owner_abroad" }
  ],
  [
    235,
    "person",
    "Thomas Klein",
    { age_band: "35-44", household_role: "tenant" }
  ],
  [
    236,
    "person",
    "Sarah Klein",
    { age_band: "35-44", household_role: "tenant" }
  ],
  [
    237,
    "person",
    "Eliott Klein",
    { age_band: "6-9", household_role: "enfant" }
  ],
  [
    238,
    "person",
    "Camille Laurent",
    { age_band: "25-34", household_role: "tenant" }
  ],
  [
    239,
    "person",
    "Jonas Vermeulen",
    { age_band: "25-34", household_role: "tenant" }
  ]
];

for (const [id, type, name, metadata] of people)
  entity(id, type, name, metadata);

relation(200, "manages", 1);
relation(200, "manages", 2);
relation(201, "represents", 1);
relation(202, "represents", 2);

const households = [
  [300, "Ménage Dupont seniors", 100, [211, 212], "owner_occupant"],
  [301, "Ménage Sofia Martin", 101, [217], "owner_occupant"],
  [302, "Ménage Nicolas Dupont", 102, [213, 214, 215, 216], "owner_occupant"],
  [303, "Ménage Karim Benali", 103, [218], "tenant"],
  [304, "Ménage Peeters-De Smet", 104, [219, 220, 221], "owner_occupant"],
  [305, "Ménage Alice Bernard", 110, [222], "owner_occupant"],
  [306, "Ménage Legrand", 111, [223, 224, 225], "tenant"],
  [307, "Ménage Victor Moreau", 112, [226], "owner_occupant"],
  [308, "Lot Érables A4 vacant travaux", 113, [], "vacant_works"],
  [309, "Ménage succession Renard", 120, [232, 233], "owner_occupant"],
  [310, "Ménage El Idrissi", 121, [228, 229, 230, 231], "tenant"],
  [311, "Ménage Klein", 122, [235, 236, 237], "tenant"],
  [312, "Ménage colocation Laurent-Vermeulen", 123, [238, 239], "tenant"]
];

for (const [id, name, unitId, members, status] of households) {
  entity(id, "household", name, { unit_id: unitId, household_status: status });
  relation(unitId, "primary_residence_of", id);
  for (const personId of members) {
    relation(id, "household_member", personId);
    relation(personId, "occupies", unitId, { via_household_id: id });
  }
  relation(id, "uses_common", 31);
  relation(id, "uses_common", unitId < 110 ? 32 : 33);
}

const ownerShares = [
  [211, 100, 0.5, "pleine_propriete"],
  [212, 100, 0.5, "pleine_propriete"],
  [217, 101, 1, "pleine_propriete"],
  [213, 102, 0.5, "pleine_propriete"],
  [214, 102, 0.5, "pleine_propriete"],
  [203, 103, 1, "pleine_propriete"],
  [219, 104, 0.5, "pleine_propriete"],
  [220, 104, 0.5, "pleine_propriete"],
  [222, 110, 1, "pleine_propriete"],
  [204, 111, 1, "pleine_propriete"],
  [226, 112, 1, "pleine_propriete"],
  [227, 113, 1, "pleine_propriete"],
  [232, 120, 1, "usufruit"],
  [233, 120, 1, "nue_propriete"],
  [203, 121, 1, "pleine_propriete"],
  [204, 122, 1, "pleine_propriete"],
  [234, 123, 1, "pleine_propriete"]
];

for (const [ownerId, unitId, share, rightType] of ownerShares) {
  const relId = relation(
    ownerId,
    "owns",
    unitId,
    { status: "confirmed", share, right_type: rightType },
    "2020-01-01"
  );
  relationProp(relId, "quote_part", share, 2);
  relationProp(relId, "right_type", rightType, 2);
  relationProp(relId, "status", "confirmed", 2);
}

const billingGroups = [
  [400, "Groupe facturation Tilleuls A1", 100, [211, 212], "50/50"],
  [401, "Groupe facturation Tilleuls A2", 101, [217], "single"],
  [402, "Groupe facturation Tilleuls A3", 102, [213, 214], "50/50"],
  [403, "Groupe facturation Tilleuls A4 bailleur", 103, [203], "landlord"],
  [404, "Groupe facturation Tilleuls A5", 104, [219, 220], "50/50"],
  [405, "Groupe facturation Érables A1", 110, [222], "single"],
  [406, "Groupe facturation Érables A2 bailleur", 111, [204], "landlord"],
  [407, "Groupe facturation Érables A3", 112, [226], "single"],
  [408, "Groupe facturation Érables A4 travaux", 113, [227], "works"],
  [
    409,
    "Groupe facturation Érables B1 succession",
    120,
    [232, 233],
    "usufruit_nue_propriete"
  ],
  [410, "Groupe facturation Érables B2 bailleur", 121, [203], "landlord"],
  [411, "Groupe facturation Érables B3 bailleur", 122, [204], "landlord"],
  [412, "Groupe facturation Érables B4 mandataire", 123, [234], "owner_abroad"]
];

for (const [id, name, unitId, members, split] of billingGroups) {
  entity(id, "billing_group", name, {
    unit_id: unitId,
    status: "active",
    split
  });
  relation(id, "bills_to", unitId);
  for (const member of members)
    relation(id, "has_member", member, { role: "facture" }, "2026-01-01");
}

const leases = [
  [800, "Bail Tilleuls A4 - Karim Benali", 103, 303, 203, "2025-09-01", 835],
  [801, "Bail Érables A2 - Famille Legrand", 111, 306, 204, "2024-07-01", 1120],
  [
    802,
    "Bail Érables B2 - Famille El Idrissi",
    121,
    310,
    203,
    "2025-02-01",
    1040
  ],
  [803, "Bail Érables B3 - Famille Klein", 122, 311, 204, "2023-11-01", 990],
  [804, "Bail Érables B4 - Colocation", 123, 312, 234, "2026-01-01", 1250]
];

for (const [
  id,
  name,
  unitId,
  householdId,
  landlordId,
  startDate,
  rent
] of leases) {
  entity(id, "lease_contract", name, {
    unit_id: unitId,
    landlord_id: landlordId,
    household_id: householdId,
    validFrom: startDate,
    monthly_rent: rent,
    currency: "EUR"
  });
  relation(id, "leases", unitId, {}, startDate);
  relation(id, "rented_to", householdId, {}, startDate);
  const rentRel = relation(
    landlordId,
    "rented_to",
    householdId,
    { unit_id: unitId },
    startDate
  );
  moneyProp(rentRel, "monthly_rent", rent, "EUR", 7);
}

entity(900, "bank_account", "Compte CODA ACP Tilleuls", {
  iban: "BE12000000000001"
});
entity(901, "bank_account", "Compte CODA ACP Érables", {
  iban: "BE12000000000002"
});
entity(910, "charge_call", "Appel charges Tilleuls janvier 2026", {
  period: "2026-01",
  amount: 1847.23,
  currency: "EUR"
});
entity(911, "charge_call", "Appel charges Érables janvier 2026", {
  period: "2026-01",
  amount: 920,
  currency: "EUR"
});
entity(912, "charge_call", "Appel charges Tilleuls février 2026", {
  period: "2026-02",
  amount: 650,
  currency: "EUR"
});
entity(920, "coda_entry", "CODA 2026-01-05 CP LOT A3 CHGE JANV", {
  amount: 1847.23,
  currency: "EUR",
  communication: "CP LOT A3 CHGE JANV",
  status: "matched"
});
entity(921, "coda_entry", "CODA 2026-01-07 LOT B2 PARTIEL", {
  amount: 500,
  currency: "EUR",
  communication: "LOT B2 PARTIEL",
  status: "partial"
});
entity(922, "coda_entry", "CODA 2026-01-08 VIR INCONNU", {
  amount: 650,
  currency: "EUR",
  communication: "VIR INCONNU",
  status: "manual_review"
});
entity(930, "receipt", "Quittance Tilleuls A3 janvier 2026", {
  amount: 1847.23,
  currency: "EUR"
});
entity(931, "reminder", "Relance Érables B2 janvier 2026", {
  level: 1,
  amount_due: 420,
  currency: "EUR"
});
entity(940, "decision", "Décision AG budget 2026 Tilleuls", {
  date: "2025-12-12"
});

relation(900, "records", 920);
relation(901, "records", 921);
relation(900, "records", 922);
let relId = relation(
  920,
  "matched_to",
  910,
  { status: "complete" },
  "2026-01-05"
);
moneyProp(relId, "amount", 1847.23, "EUR", 4);
relationProp(relId, "payment_status", "complete", 4);
relId = relation(920, "allocated_to", 402, { period: "2026-01" }, "2026-01-05");
moneyProp(relId, "amount", 1847.23, "EUR", 4);
relation(
  920,
  "triggered",
  930,
  { rule: "matched_amount_equals_charge_call" },
  "2026-01-05"
);
relId = relation(921, "matched_to", 911, { status: "partial" }, "2026-01-07");
moneyProp(relId, "amount", 500, "EUR", 4);
relationProp(relId, "payment_status", "partial", 4);
relation(
  921,
  "triggered",
  931,
  { rule: "matched_amount_below_charge_call" },
  "2026-01-07"
);
relId = relation(
  922,
  "requires_review",
  912,
  { status: "manual_identification" },
  "2026-01-08"
);
relationProp(relId, "payment_status", "manual_review", 4);
relation(940, "decided_by", 201, { topic: "budget_2026" }, "2025-12-12");
relation(910, "decided_by", 940, { budget_basis: "ag_2025" }, "2026-01-01");

const docs = [
  [
    1,
    "reglement-copropriete-tilleuls.md",
    "Règlement de copropriété Tilleuls",
    "La résidence Les Tilleuls comprend un bloc A, cinq appartements, une buanderie, un jardin commun et des jardins privatifs au rez-de-chaussée. Chaque lot possède une cave; certains lots disposent d'un garage.",
    [
      ["source", "document_type", "reglement_copropriete"],
      ["domain", "building", "Résidence Les Tilleuls"],
      ["domain", "scenario", "structure_copropriete"]
    ]
  ],
  [
    2,
    "titre-propriete-tilleuls-a3.md",
    "Titre de propriété Tilleuls A3",
    "Le lot Tilleuls Appartement A3 est détenu par Nicolas Dupont et Pauline Dupont à parts égales. Le ménage comprend deux enfants occupants, Lina et Tom Dupont.",
    [
      ["source", "document_type", "titre_propriete"],
      ["domain", "unit", "Tilleuls Appartement A3"],
      ["domain", "role", "titulaire"]
    ]
  ],
  [
    3,
    "composition-menages.md",
    "Composition des ménages",
    "Les Tilleuls A1 sont occupés par Henri et Madeleine Dupont. Les Tilleuls A3 sont occupés par Nicolas, Pauline, Lina et Tom Dupont. Les Érables B2 sont loués à la famille El Idrissi.",
    [
      ["source", "document_type", "composition_menage"],
      ["domain", "scenario", "occupants"],
      ["domain", "role", "occupant"]
    ]
  ],
  [
    4,
    "extrait-coda-janvier-2026.md",
    "Extrait CODA janvier 2026",
    "05/01/2026: virement 1847,23 EUR avec communication CP LOT A3 CHGE JANV. 07/01/2026: virement 500,00 EUR LOT B2 PARTIEL. 08/01/2026: virement 650,00 EUR VIR INCONNU.",
    [
      ["source", "document_type", "extrait_coda"],
      ["finance", "payment_status", "complete"],
      ["finance", "payment_status", "partial"],
      ["finance", "payment_status", "manual_review"]
    ]
  ],
  [
    5,
    "pv-ag-budget-2026.md",
    "PV AG budget 2026",
    "L'assemblée générale de l'ACP Résidence Les Tilleuls du 12 décembre 2025 approuve le budget 2026 et les appels de charges mensuels.",
    [
      ["source", "document_type", "pv_ag"],
      ["domain", "decision", "budget_2026"],
      ["domain", "building", "Résidence Les Tilleuls"]
    ]
  ],
  [
    6,
    "annexes-jardins-garages.md",
    "Annexes jardins caves garages",
    "Les appartements du rez-de-chaussée disposent d'un jardin privatif à usage exclusif. Chaque appartement dispose d'une cave. Les garages sont attachés à certains lots selon l'acte de base.",
    [
      ["source", "document_type", "annexe_lot"],
      ["domain", "scenario", "annexes"],
      ["domain", "role", "usage_exclusif"]
    ]
  ],
  [
    7,
    "baux-erables.md",
    "Baux Érables",
    "Les lots Érables A2, B2, B3 et B4 sont occupés par des locataires sous bail écrit. Les baux relient le bailleur, le ménage locataire, le lot, la date de début et le loyer mensuel.",
    [
      ["source", "document_type", "bail"],
      ["domain", "building", "Résidence Les Érables"],
      ["domain", "role", "locataire"]
    ]
  ]
];

for (const doc of docs) document(...doc);

const sourceFiles = [
  {
    filename: "statuts-tilleuls.md",
    title: "Statuts fictifs - ACP Residence Les Tilleuls",
    document_type: "statuts_copropriete",
    content: `
Document fictif inspire des categories belges d'acte de base, reglement de copropriete et reglement d'ordre interieur.

ACP: Residence Les Tilleuls, 12 rue des Tilleuls, 5000 Namur.
Syndic: Syndic Horizon Gestion. Gestionnaire comptable: Marie Lambert.
Structure: un immeuble, bloc A, cinq appartements. Parties communes: hall, local technique, buanderie commune, deux machines a laver, jardin commun.

Lots privatifs principaux:
| Lot | Porte | Etage | Chambres | Quotites |
| --- | --- | --- | --- | --- |
| A1 | A-00-01 | 0 | 2 | 190/1000 |
| A2 | A-00-02 | 0 | 1 | 180/1000 |
| A3 | A-01-01 | 1 | 3 | 220/1000 |
| A4 | A-01-02 | 1 | 1 | 190/1000 |
| A5 | A-02-01 | 2 | 3 | 220/1000 |

Chaque appartement dispose d'une cave. Les lots du rez-de-chaussee A1 et A2 disposent d'un jardin privatif a usage exclusif. Les garages sont attribues aux lots A1, A3 et A5.
La somme des quotites de l'immeuble est de 1000/1000.
`
  },
  {
    filename: "statuts-erables.md",
    title: "Statuts fictifs - ACP Residence Les Erables",
    document_type: "statuts_copropriete",
    content: `
Document fictif inspire des documents constitutifs d'une copropriete belge.

ACP: Residence Les Erables, 8 avenue des Erables, 1300 Wavre.
Syndic: Syndic Horizon Gestion. L'immeuble est organise en deux blocs, bloc A et bloc B.
Parties communes: jardin commun central, local technique, buanderie commune, local velos.

Lots privatifs principaux:
| Bloc | Lot | Porte | Etage | Chambres | Quotites |
| --- | --- | --- | --- | --- | --- |
| A | A1 | A-00-01 | 0 | 2 | 120/1000 |
| A | A2 | A-00-02 | 0 | 2 | 125/1000 |
| A | A3 | A-01-01 | 1 | 1 | 125/1000 |
| A | A4 | A-01-02 | 1 | 3 | 130/1000 |
| B | B1 | B-00-01 | 0 | 2 | 120/1000 |
| B | B2 | B-00-02 | 0 | 2 | 125/1000 |
| B | B3 | B-01-01 | 1 | 2 | 125/1000 |
| B | B4 | B-01-02 | 1 | 4 | 130/1000 |

Chaque lot dispose d'une cave. Les lots A1, A4, B1 et B4 disposent d'un garage. Les lots du rez-de-chaussee A1, A2, B1 et B2 disposent d'un jardin privatif a usage exclusif.
La somme des quotites de l'immeuble est de 1000/1000.
`
  },
  {
    filename: "registre-coproprietaires.md",
    title: "Registre fictif des coproprietaires",
    document_type: "registre_coproprietaires",
    content: `
Registre fictif tenu par le syndic pour les ACP Les Tilleuls et Les Erables.

Residence Les Tilleuls:
| Lot | Titulaire(s) | Droit | Quote-part |
| --- | --- | --- | --- |
| Tilleuls Appartement A1 | Henri Dupont; Madeleine Dupont | pleine_propriete | 50%; 50% |
| Tilleuls Appartement A2 | Sofia Martin | pleine_propriete | 100% |
| Tilleuls Appartement A3 | Nicolas Dupont; Pauline Dupont | pleine_propriete | 50%; 50% |
| Tilleuls Appartement A4 | Immo Invest SRL | pleine_propriete | 100% |
| Tilleuls Appartement A5 | Lena Peeters; Noah De Smet | pleine_propriete | 50%; 50% |

Residence Les Erables:
| Lot | Titulaire(s) | Droit | Quote-part |
| --- | --- | --- | --- |
| Erables Appartement A1 | Alice Bernard | pleine_propriete | 100% |
| Erables Appartement A2 | Patrimoine Nord SRL | pleine_propriete | 100% |
| Erables Appartement A3 | Victor Moreau | pleine_propriete | 100% |
| Erables Appartement A4 | Claire Dubois | pleine_propriete | 100% |
| Erables Appartement B1 | Olivier Renard; Julie Renard | usufruit; nue_propriete | 100%; 100% |
| Erables Appartement B2 | Immo Invest SRL | pleine_propriete | 100% |
| Erables Appartement B3 | Patrimoine Nord SRL | pleine_propriete | 100% |
| Erables Appartement B4 | Marta Rossi | pleine_propriete | 100% |
`
  },
  {
    filename: "composition-occupants.md",
    title: "Composition fictive des occupants",
    document_type: "composition_menage",
    content: `
Etat fictif des occupants communique au syndic pour la repartition operationnelle des avis.

Tilleuls Appartement A1: Henri Dupont et Madeleine Dupont, couple senior, occupants proprietaires au rez-de-chaussee.
Tilleuls Appartement A2: Sofia Martin, personne seule, occupante proprietaire.
Tilleuls Appartement A3: Nicolas Dupont, Pauline Dupont, Lina Dupont et Tom Dupont; Nicolas est le fils du couple Dupont du lot A1.
Tilleuls Appartement A4: Karim Benali, locataire personne seule.
Tilleuls Appartement A5: Lena Peeters, Noah De Smet et Mila De Smet, menage avec enfant.

Erables Appartement A1: Alice Bernard, occupante proprietaire.
Erables Appartement A2: Marc Legrand, Eva Legrand et Nora Legrand, menage locataire.
Erables Appartement A3: Victor Moreau, occupant proprietaire.
Erables Appartement A4: lot vacant pour travaux, proprietaire Claire Dubois.
Erables Appartement B1: Olivier Renard et Julie Renard, situation succession avec usufruit et nue-propriete.
Erables Appartement B2: Fatima El Idrissi, Samir El Idrissi, Yanis El Idrissi et Amel El Idrissi, menage locataire.
Erables Appartement B3: Thomas Klein, Sarah Klein et Eliott Klein, menage locataire.
Erables Appartement B4: Camille Laurent et Jonas Vermeulen, colocation sous bail; proprietaire Marta Rossi a l'etranger.
`
  },
  {
    filename: "baux-locatifs.md",
    title: "Synthese fictive des baux locatifs",
    document_type: "bail",
    content: `
Synthese fictive fournie au syndic pour identifier les lots occupes par locataires.

| Bail | Lot | Bailleur | Menage locataire | Date debut | Loyer mensuel |
| --- | --- | --- | --- | --- | --- |
| Bail Tilleuls A4 - Karim Benali | Tilleuls Appartement A4 | Immo Invest SRL | Menage Karim Benali | 2025-09-01 | 835 EUR |
| Bail Erables A2 - Famille Legrand | Erables Appartement A2 | Patrimoine Nord SRL | Menage Legrand | 2024-07-01 | 1120 EUR |
| Bail Erables B2 - Famille El Idrissi | Erables Appartement B2 | Immo Invest SRL | Menage El Idrissi | 2025-02-01 | 1040 EUR |
| Bail Erables B3 - Famille Klein | Erables Appartement B3 | Patrimoine Nord SRL | Menage Klein | 2023-11-01 | 990 EUR |
| Bail Erables B4 - Colocation | Erables Appartement B4 | Marta Rossi | Menage colocation Laurent-Vermeulen | 2026-01-01 | 1250 EUR |
`
  },
  {
    filename: "pv-ag-budget-2026.md",
    title: "Proces-verbal fictif AG budget 2026",
    document_type: "pv_ag",
    content: `
Proces-verbal fictif de l'assemblee generale de l'ACP Residence Les Tilleuls du 12 decembre 2025.

Decision: approbation du budget 2026. Les appels de charges mensuels sont confirmes.
Pour janvier 2026, l'appel de charges Tilleuls est emis pour 1847,23 EUR et concerne notamment le groupe de facturation Tilleuls A3.
Une decision comptable autorise l'emission automatique d'une quittance lorsque le montant CODA correspond exactement a l'appel de charges.
`
  },
  {
    filename: "coda-janvier-2026.md",
    title: "Extrait CODA fictif janvier 2026",
    document_type: "extrait_coda",
    content: `
Extrait CODA fictif pour les comptes ACP.

Compte CODA ACP Tilleuls: IBAN BE12000000000001.
05/01/2026: virement 1847,23 EUR. Communication: CP LOT A3 CHGE JANV. Statut attendu: paiement complet, a matcher avec Appel charges Tilleuls janvier 2026 et Groupe facturation Tilleuls A3.
08/01/2026: virement 650,00 EUR. Communication: VIR INCONNU. Statut attendu: revue manuelle, rapprochement possible avec Appel charges Tilleuls fevrier 2026.

Compte CODA ACP Erables: IBAN BE12000000000002.
07/01/2026: virement 500,00 EUR. Communication: LOT B2 PARTIEL. Statut attendu: paiement partiel, a rapprocher de l'appel Erables janvier 2026 et du groupe de facturation Erables B2 bailleur.
`
  },
  {
    filename: "annexes-caves-garages-jardins.md",
    title: "Inventaire fictif des annexes et parties communes",
    document_type: "annexe_lot",
    content: `
Inventaire fictif des caves, garages, jardins privatifs et parties communes.

Tous les appartements des residences Les Tilleuls et Les Erables disposent d'une cave identifiee au meme lot.
Garages attribues: Tilleuls A1, Tilleuls A3, Tilleuls A5, Erables A1, Erables A4, Erables B1, Erables B4.
Jardins privatifs a usage exclusif: tous les lots du rez-de-chaussee, soit Tilleuls A1, Tilleuls A2, Erables A1, Erables A2, Erables B1 et Erables B2.
Parties communes: buanderie, machines a laver, jardins communs, locaux techniques. Les menages utilisent les parties communes de leur immeuble.
`
  }
];

for (const source of sourceFiles) {
  sourceDocument(source.filename, source.title, source.content);
}

writeFileSync(
  join(SOURCES_DIR, "manifest.json"),
  `${JSON.stringify(
    {
      workspace_id: "immeuble",
      collection_id: "immeuble::docs",
      ontology_id: ONT,
      language: "fr",
      source_kind: "fictional_realistic_belgian_syndic",
      generated_from: "scripts/generate-immeuble.mjs",
      files: sourceFiles.map((source, index) => ({
        doc_id: index + 1,
        filename: source.filename,
        title: source.title,
        document_type: source.document_type
      }))
    },
    null,
    2
  )}\n`
);

writeFileSync(
  join(SOURCES_DIR, "expected-coverage.json"),
  `${JSON.stringify(
    {
      workspace_id: "immeuble",
      golden_workspace_id: WS,
      buildings: [
        {
          name: "Résidence Les Tilleuls",
          blocks: 1,
          units: 5,
          quota_total: 1000
        },
        {
          name: "Résidence Les Érables",
          blocks: 2,
          units: 8,
          quota_total: 1000
        }
      ],
      counts: {
        buildings: 2,
        blocks: 3,
        units: 13,
        households: 13,
        cellars: 13,
        private_gardens: 6,
        lease_contracts: 5,
        coda_entries: 3
      },
      unit_checks: {
        all_units_have_cellar: true,
        ground_floor_units_have_private_garden: true,
        garage_units: [
          "Tilleuls Appartement A1",
          "Tilleuls Appartement A3",
          "Tilleuls Appartement A5",
          "Érables Appartement A1",
          "Érables Appartement A4",
          "Érables Appartement B1",
          "Érables Appartement B4"
        ]
      },
      relation_edges: [
        "contains",
        "owns",
        "occupies",
        "household_member",
        "primary_residence_of",
        "leases",
        "rented_to",
        "assigned_cellar",
        "assigned_garage",
        "uses_exclusive",
        "uses_common",
        "matched_to",
        "allocated_to",
        "requires_review"
      ],
      search_terms: ["appartement", "Dupont", "bail", "CODA", "jardin"],
      document_facets: {
        "source.document_type": sourceFiles.map(
          (source) => source.document_type
        )
      }
    },
    null,
    2
  )}\n`
);

writeFileSync(
  join(SOURCES_DIR, "README.md"),
  `# Immeuble Demo LLM Sources

This directory is the raw-ish source corpus for reconstructing the syndic demo
through the document import and LLM qualification path. It is intentionally
separate from ../../reference/documents, which is the already-qualified golden
corpus embedded in ../../reference/bundle.json.

Agent workflow: start at ../README.md and follow ../prompts/00-prerequisites.md.

## Import target

\`\`\`bash
export GHOSTCRAB_SQLITE_PATH="$PWD/data/immeuble.sqlite"
export MB_DOCUMENTS_LLM_MODE=live
export MB_DOCUMENTS_LLM_BASE_URL="\${MB_DOCUMENTS_LLM_BASE_URL:-https://api.openai.com/v1}"
export MB_DOCUMENTS_LLM_MODEL="\${MB_DOCUMENTS_LLM_MODEL:-gpt-4.1-mini}"
# MB_DOCUMENTS_LLM_API_KEY must be set in .env or the shell; do not commit it.
\`\`\`

## Suggested flow

The preferred operator flow is the repository script, which builds the golden
workspace and the source-import workspace in the same SQLite database, records
LLM prompts/responses, and writes a comparison report:

\`\`\`bash
node scripts/import-immeuble.mjs --reset
\`\`\`

Use a bounded live smoke first when iterating on prompts:

\`\`\`bash
node scripts/import-immeuble.mjs --reset --limit-docs 1 --debug-prompts
\`\`\`

Use mock or dry-run mode when validating the pipeline without network/API calls:

\`\`\`bash
node scripts/import-immeuble.mjs --mode mock --reset
node scripts/import-immeuble.mjs --mode dry-run --reset --debug-prompts
\`\`\`

Manual equivalent:

\`\`\`bash
node bin/gcp.mjs brain ontology compile \\
  --workspace-id immeuble \\
  --ontology-id immeuble::core \\
  --input ontologies/immeuble/core.yaml \\
  --import-db \\
  --db "$GHOSTCRAB_SQLITE_PATH"

while read -r doc_id filename; do
  node bin/gcp.mjs brain document --force document-profile-enqueue \\
    --content-file "examples/immeuble/sources/documents/$filename" \\
    --workspace-id immeuble \\
    --collection-id immeuble::docs \\
    --doc-id "$doc_id" \\
    --language fr
done < <(node -e 'const m=require("./examples/immeuble/sources/documents/manifest.json"); for (const f of m.files) console.log(f.doc_id, f.filename)')

node bin/gcp.mjs brain document --force document-profile-worker --limit 20

node bin/gcp.mjs brain document --force qualification-vocab-list \\
  --workspace-id immeuble \\
  --collection-id immeuble::docs

node bin/gcp.mjs brain document --force document-qualify \\
  --workspace-id immeuble \\
  --collection-id immeuble::docs \\
  --taxonomies immeuble::core \\
  --facets source.document_type,domain.building,domain.unit,domain.role,domain.scenario,finance.payment_status
\`\`\`

The expected business coverage is recorded in expected-coverage.json. The check
is controlled parity with the golden demo, not equality of internal IDs.
`
);

for (const unit of units) {
  evidence(unit[0], unit[1] === 1 ? 1 : 7, "described_by");
  evidence(unit[0], 6, "annex");
}
for (const personId of people
  .filter((row) => row[1] === "person")
  .map((row) => row[0])) {
  evidence(personId, 3, "household_source");
}
for (const lease of leases) evidence(lease[0], 7, "lease_source");
for (const entityId of [900, 901, 910, 911, 912, 920, 921, 922, 930, 931])
  evidence(entityId, 4, "finance_source");
evidence(940, 5, "decision_source");

const linkmlSlice = compileLinkmlOntologySlice();

const facetDimensions = [
  ["source", "document_type", "string", false],
  ["domain", "building", "string", true],
  ["domain", "unit", "string", true],
  ["domain", "role", "string", true],
  ["domain", "scenario", "string", true],
  ["domain", "status", "string", true],
  ["domain", "decision", "string", true],
  ["finance", "charge_status", "string", true],
  ["finance", "payment_status", "string", true]
].map(([namespace, dimension, value_type, is_multi]) => ({
  ontology_id: ONT,
  namespace,
  dimension,
  value_type,
  is_multi,
  hierarchy_kind: "flat",
  metadata_json: "{}"
}));

const dimensions = mergeOntologyDimensions(
  linkmlSlice.ontology_dimensions ?? [],
  facetDimensions
);

const facetDefinitions = Array.from(
  new Set(rows.facets.map((facet) => `${facet.namespace}.${facet.dimension}`))
)
  .sort()
  .map((facet_name, index) => ({
    table_id: FACET_TABLE_ID,
    facet_id: index + 1,
    facet_name
  }));

const scenarios = [
  [
    "scenario:tilleuls-family-stack",
    "Famille multi-génération Tilleuls",
    "Quels liens existent entre le vieux couple du rez-de-chaussée et le ménage du fils au premier étage ?"
  ],
  [
    "scenario:tenant-lease",
    "Baux et locataires",
    "Quels appartements sont loués, à qui, depuis quelle date et par quel bailleur ?"
  ],
  [
    "scenario:quota-check",
    "Quotités par immeuble",
    "Les quotités de chaque immeuble totalisent-elles 1000 ?"
  ],
  [
    "scenario:annexes",
    "Annexes privatives et communes",
    "Quelle cave, garage, jardin privatif et partie commune est accessible depuis chaque lot ?"
  ],
  [
    "scenario:coda-complete-payment",
    "Paiement CODA complet",
    "Quel paiement CODA a soldé l'appel de charges Tilleuls janvier 2026 ?"
  ],
  [
    "scenario:coda-partial-reminder",
    "Paiement partiel et relance",
    "Quel paiement partiel déclenche une relance ?"
  ]
];

const answerArtifacts = [
  {
    artifact_id: "analysis_plan__immeuble_competency_questions",
    slug: "immeuble_competency_questions",
    workspace_id: null,
    agent_id: "agent:immeuble",
    scope: WS,
    artifact_kind: "analysis_plan",
    public_label_key: "analysis_plan.immeuble.competency_questions",
    public_label: "Plan d'analyse immeuble demo",
    lifecycle: "active",
    state: "open",
    current_version: 1,
    payload_json: j({
      competency_questions: scenarios.map(([id, title, competency]) => ({
        id,
        title,
        competency_question: competency
      })),
      expected_focus: [
        "occupation familiale Tilleuls",
        "baux locatifs actifs",
        "quotites par immeuble",
        "annexes privatives",
        "paiements CODA"
      ]
    }),
    legacy_ref: null,
    created_at_unix: ARTIFACT_TS,
    updated_at_unix: ARTIFACT_TS
  },
  {
    artifact_id: "live_answer_view__immeuble_pilotage",
    slug: "immeuble_pilotage",
    workspace_id: WS,
    agent_id: null,
    scope: null,
    artifact_kind: "live_answer_view",
    public_label_key: "live_answer_view.immeuble.pilotage",
    public_label: "Vue live immeuble demo",
    lifecycle: "stale",
    state: "dirty",
    current_version: 1,
    payload_json: j({
      source_plan_id: "analysis_plan__immeuble_competency_questions",
      summary:
        "Vue courante a rafraichir apres import/reindex du bundle immeuble.",
      refresh_checks: [
        "entity counts vs success-criteria.yaml",
        "graph diagnostics L2 syndic",
        "CODA payment matching"
      ]
    }),
    legacy_ref: null,
    created_at_unix: ARTIFACT_TS,
    updated_at_unix: ARTIFACT_TS
  }
];

const bundle = {
  kind: "ghostcrab_backup_bundle",
  schema_version: "2",
  scope: { kind: "workspace", workspace_id: WS, collection_id: null },
  workspaces: [
    {
      workspace_id: WS,
      label: "Immeuble demo",
      description:
        "Démonstrateur syndic riche: lots, personnes, ménages, baux, annexes, CODA et documents qualifiés.",
      domain_profile: "syndic"
    }
  ],
  collections: [
    {
      collection_id: COLL,
      workspace_id: WS,
      name: "Documents syndic demo",
      key_kind: "doc_id",
      chunk_bits: 8,
      default_language: "fr",
      metadata_json: j({ synthetic: true })
    }
  ],
  ontologies: [
    {
      ontology_id: ONT,
      workspace_id: WS,
      name: "core",
      version: "2.1.0",
      frozen: false,
      source_kind: "linkml",
      metadata_json: j({
        profile: "syndic",
        source: "ontologies/immeuble/core.yaml"
      })
    }
  ],
  ontology_namespaces: [
    {
      ontology_id: ONT,
      namespace: "source",
      label: "Source documentaire",
      parent_namespace: null,
      metadata_json: "{}"
    },
    {
      ontology_id: ONT,
      namespace: "domain",
      label: "Domaine syndic",
      parent_namespace: null,
      metadata_json: "{}"
    },
    {
      ontology_id: ONT,
      namespace: "finance",
      label: "Finance syndic",
      parent_namespace: null,
      metadata_json: "{}"
    }
  ],
  ontology_dimensions: dimensions,
  ontology_values: linkmlSlice.ontology_values ?? [],
  ontology_entity_types: linkmlSlice.ontology_entity_types ?? [],
  ontology_edge_types: linkmlSlice.ontology_edge_types ?? [],
  ontology_entities: ontologySeedEntities,
  ontology_relations: ontologySeedRelations,
  ontology_triples: linkmlSlice.ontology_triples ?? [],
  collection_ontologies: [
    { workspace_id: WS, collection_id: COLL, ontology_id: ONT, role: "primary" }
  ],
  workspace_settings: [
    { workspace_id: WS, default_ontology_id: ONT, metadata_json: "{}" }
  ],
  facet_tables: [
    {
      table_id: FACET_TABLE_ID,
      workspace_id: WS,
      collection_id: COLL,
      schema_name: "public",
      table_name: COLL,
      chunk_bits: 8,
      key_column: "doc_id",
      content_column: "content",
      metadata_column: "metadata_json",
      language: "fr",
      bm25_enabled: true
    }
  ],
  facet_definitions: facetDefinitions,
  documents_raw: rows.docs,
  chunks_raw: rows.chunks,
  documents_raw_vector: [],
  chunks_raw_vector: [],
  facet_assignments_raw: rows.facets,
  entities_raw: rows.entities,
  entity_aliases_raw: rows.aliases,
  relations_raw: rows.relations,
  relation_properties_raw: rows.relationProps,
  entity_documents_raw: rows.entityDocs,
  entity_chunks_raw: rows.entityChunks,
  document_links_raw: [],
  external_links_raw: [],
  mindbrain_answer_artifacts: answerArtifacts,
  mindbrain_answer_events: []
};

writeFileSync(join(BUNDLE_OUT), `${JSON.stringify(bundle, null, 2)}\n`);

writeFileSync(
  join(REFERENCE_DIR, "scenarios.yaml"),
  [
    `workspace_id: ${WS}`,
    `ontology_id: ${ONT}`,
    "scenarios:",
    ...scenarios.flatMap(([id, title, competency]) => [
      `  - id: ${id}`,
      `    title: ${j(title)}`,
      `    competency_question: ${j(competency)}`
    ])
  ].join("\n") + "\n"
);

writeFileSync(
  join(REFERENCE_DIR, "answer-artifacts.seed.jsonl"),
  `${answerArtifacts
    .map((artifact) =>
      JSON.stringify({
        kind: "answer_artifact",
        profile_id: WS,
        artifact: {
          artifact_id: artifact.artifact_id,
          slug: artifact.slug,
          workspace_id: artifact.workspace_id,
          agent_id: artifact.agent_id,
          scope: artifact.scope,
          artifact_kind: artifact.artifact_kind,
          public_label_key: artifact.public_label_key,
          public_label: artifact.public_label,
          lifecycle: artifact.lifecycle,
          state: artifact.state,
          current_version: artifact.current_version,
          payload_json: artifact.payload_json,
          legacy_ref: artifact.legacy_ref
        }
      })
    )
    .join("\n")}\n`
);
