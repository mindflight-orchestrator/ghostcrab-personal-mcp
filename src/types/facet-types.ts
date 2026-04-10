import { z } from "zod";

/**
 * Declared facet storage/query semantics for sync_spec and query proxy (v3).
 */
export const FACET_TYPES = [
  "term",
  "boolean",
  "integer",
  "float",
  "array",
  "ltree",
  "temporal",
  "temporal_range",
  "geo",
  "jsonpath",
  "computed",
  "embedding"
] as const;

export type FacetType = (typeof FACET_TYPES)[number];

export const FacetTypeSchema = z.enum(FACET_TYPES);
