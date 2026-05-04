import type { RangeFilter, TemporalFilter } from "./filter-schemas.js";
import { resolveTemporalBounds } from "./temporal-resolve.js";

/**
 * Appends JSONB path-based facet filters (temporal, array ?|, numeric range) to SQL WHERE.
 * Uses jsonb_extract_path_text / jsonb_extract_path with a parameterized top-level key.
 */
export function appendStructuredFacetFilters(
  whereClauses: string[],
  params: unknown[],
  paramIndex: number,
  input: {
    temporal_filters: TemporalFilter[];
    array_filters: Record<string, string[]>;
    range_filters: RangeFilter[];
  },
  now: Date = new Date()
): number {
  let p = paramIndex;

  for (const tf of input.temporal_filters) {
    const { from, to } = resolveTemporalBounds(tf, now);
    const keyParam = p;
    params.push(tf.facet_key);
    p += 1;

    const pathExpr = `(jsonb_extract_path_text(facets, $${keyParam}::text))::timestamptz`;

    if (from !== null && to !== null) {
      const lo = p;
      params.push(from.toISOString());
      params.push(to.toISOString());
      whereClauses.push(
        `${pathExpr} BETWEEN $${lo}::timestamptz AND $${lo + 1}::timestamptz`
      );
      p += 2;
    } else if (from !== null) {
      const lo = p;
      params.push(from.toISOString());
      whereClauses.push(`${pathExpr} >= $${lo}::timestamptz`);
      p += 1;
    } else if (to !== null) {
      const lo = p;
      params.push(to.toISOString());
      whereClauses.push(`${pathExpr} <= $${lo}::timestamptz`);
      p += 1;
    }
  }

  for (const [facetKey, values] of Object.entries(input.array_filters)) {
    if (values.length === 0) {
      whereClauses.push("FALSE");
      continue;
    }

    const keyParam = p;
    params.push(facetKey);
    p += 1;

    const pathExpr = `jsonb_extract_path(facets, $${keyParam}::text)`;
    const valueParams: string[] = [];
    for (const v of values) {
      const vp = p;
      params.push(v);
      valueParams.push(`$${vp}`);
      p += 1;
    }

    whereClauses.push(
      `${pathExpr} ?| ARRAY[${valueParams.join(", ")}]::text[]`
    );
  }

  for (const rf of input.range_filters) {
    const keyParam = p;
    params.push(rf.facet_key);
    p += 1;
    const pathExpr = `(jsonb_extract_path_text(facets, $${keyParam}::text))::numeric`;

    if (rf.min !== undefined && rf.max !== undefined) {
      const lo = p;
      params.push(rf.min);
      params.push(rf.max);
      whereClauses.push(
        `${pathExpr} BETWEEN $${lo}::numeric AND $${lo + 1}::numeric`
      );
      p += 2;
    } else if (rf.min !== undefined) {
      const lo = p;
      params.push(rf.min);
      whereClauses.push(`${pathExpr} >= $${lo}::numeric`);
      p += 1;
    } else if (rf.max !== undefined) {
      const lo = p;
      params.push(rf.max);
      whereClauses.push(`${pathExpr} <= $${lo}::numeric`);
      p += 1;
    }
  }

  return p;
}
