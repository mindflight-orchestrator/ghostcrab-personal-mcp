/**
 * Facet prefix normalization for entity.facet nomenclature.
 *
 * Stored facets use bare keys in the JSON column; schema context lives in schema_id.
 * Declared required_facets use entity.facet (e.g. unit.quota_basis).
 * This module bridges bare storage and prefixed declarations.
 */

/**
 * Derive entity name from schema_id (immeuble:core:unit -> unit) or facets.entity_type.
 * @param {string|null|undefined} schemaId
 * @param {Record<string, unknown>|null} facets
 * @returns {string}
 */
export function entityFromSchema(schemaId, facets = null) {
  if (schemaId && typeof schemaId === "string") {
    const parts = schemaId.split(":");
    if (parts.length >= 1) {
      return parts.at(-1) ?? "";
    }
  }
  const entityType = facets?.entity_type;
  return typeof entityType === "string" ? entityType : "";
}

/**
 * Build observed facet index from facet rows.
 * Indexes both bare keys and entity.facet prefixed keys.
 *
 * @param {Array<{ schema_id?: string, facets?: string|Record<string, unknown> }>} rows
 * @returns {{ bare: Set<string>, prefixed: Set<string>, all: Set<string> }}
 */
export function buildObservedFacetIndex(rows) {
  const bare = new Set();
  const prefixed = new Set();
  const all = new Set();

  for (const row of rows) {
    const facets = parseFacetsJson(row.facets);
    if (!facets || typeof facets !== "object") continue;

    const entity = entityFromSchema(row.schema_id, facets);
    for (const key of Object.keys(facets)) {
      if (!key || key.startsWith("_")) continue;
      bare.add(key);
      all.add(key);
      if (entity) {
        const prefixedKey = `${entity}.${key}`;
        prefixed.add(prefixedKey);
        all.add(prefixedKey);
      }
    }
  }

  return { bare, prefixed, all };
}

/**
 * Check whether a required facet is observed (prefix-aware).
 * - entity.facet -> match prefixed index (or bare if entity matches and bare exists)
 * - bare facet -> match bare index only
 *
 * @param {string} requiredFacet
 * @param {{ bare: Set<string>, prefixed: Set<string>, all: Set<string> }} index
 * @returns {boolean}
 */
export function facetIsObserved(requiredFacet, index) {
  if (!requiredFacet) return false;
  if (requiredFacet.includes(".")) {
    if (index.prefixed.has(requiredFacet) || index.all.has(requiredFacet)) {
      return true;
    }
    const dot = requiredFacet.indexOf(".");
    const entity = requiredFacet.slice(0, dot);
    const bareKey = requiredFacet.slice(dot + 1);
    return index.bare.has(bareKey) && Boolean(entity);
  }
  return index.bare.has(requiredFacet) || index.all.has(requiredFacet);
}

/**
 * Return required facets not observed in the index.
 * @param {string[]} requiredFacets
 * @param {{ bare: Set<string>, prefixed: Set<string>, all: Set<string> }} index
 * @returns {string[]}
 */
export function missingRequiredFacets(requiredFacets, index) {
  return [...new Set(requiredFacets)].filter((f) => !facetIsObserved(f, index)).sort();
}

/**
 * Extract known facet terms from a StarterKit model_contract.json shape.
 * @param {Record<string, unknown>} contract
 * @returns {{ schemas: Set<string>, facets: Set<string>, edges: Set<string> }}
 */
export function knownTermsFromContract(contract) {
  const schemas = new Set(Object.keys(contract.schemas ?? {}));
  const facets = new Set(["record_id", "workspace_id", "label"]);
  for (const schema of Object.values(contract.schemas ?? {})) {
    if (schema && typeof schema === "object" && schema.facets) {
      for (const key of Object.keys(schema.facets)) {
        facets.add(key);
      }
    }
  }
  const edges = new Set();
  for (const edge of contract.edge_types ?? []) {
    const type = typeof edge === "string" ? edge : edge?.type;
    if (type) edges.add(type);
  }
  return { schemas, facets, edges };
}

/**
 * Normalize edge type for comparison (case-insensitive).
 * @param {string} edge
 * @returns {string}
 */
export function normalizeEdgeType(edge) {
  return String(edge ?? "").trim().toUpperCase();
}

/**
 * Check if required edge exists in relation counts (case-insensitive).
 * @param {string} requiredEdge
 * @param {Record<string, number>} relationCounts
 * @returns {boolean}
 */
export function edgeIsObserved(requiredEdge, relationCounts) {
  const norm = normalizeEdgeType(requiredEdge);
  for (const [key, count] of Object.entries(relationCounts)) {
    if (normalizeEdgeType(key) === norm && count > 0) {
      return true;
    }
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>|null}
 */
export function parseFacetsJson(value) {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return /** @type {Record<string, unknown>} */ (value);
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? /** @type {Record<string, unknown>} */ (parsed)
      : null;
  } catch {
    return null;
  }
}

/**
 * Format facet list for markdown output.
 * @param {string[]} values
 * @returns {string}
 */
export function fmtFacetValues(values) {
  return values.length ? values.map((v) => `\`${v}\``).join(", ") : "n/a";
}
