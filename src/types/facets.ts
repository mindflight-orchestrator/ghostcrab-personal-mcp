import { z } from "zod";

export interface FacetRecord {
  content: string;
  facets: Record<string, unknown>;
  id: string;
  schemaId: string;
}

export interface FacetSchemaSummary {
  description: string;
  fieldNames: string[];
  schemaId: string;
}

const SQL_IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]{0,62}$/;

const SAFE_TRANSFORM_REGEX =
  /^(lower|upper|trim|btrim|ltrim|rtrim|md5|sha256|length|char_length|abs|round|floor|ceil|coalesce|nullif|to_char|date_trunc|extract|cast)\s*\(\s*\$value\s*(?:,\s*[^;()]{0,40})?\)$/i;

export const SyncFieldSpecSchema = z.object({
  column_name: z
    .string()
    .regex(
      SQL_IDENTIFIER_REGEX,
      "column_name must be a lowercase SQL identifier (a-z, 0-9, _)"
    ),
  facet_key: z
    .string()
    .min(1)
    .max(63)
    .regex(
      SQL_IDENTIFIER_REGEX,
      "facet_key must be a lowercase SQL identifier (a-z, 0-9, _)"
    ),
  index_in_bm25: z.boolean(),
  facet_type: z
    .enum([
      "term",
      "boolean",
      "integer",
      "float",
      "temporal",
      "temporal_range",
      "jsonpath",
      "computed",
      "array",
      "ltree",
      "geo",
      "embedding"
    ])
    .optional(),
  transform: z
    .string()
    .min(1)
    .max(200)
    .regex(
      SAFE_TRANSFORM_REGEX,
      "transform: only approved SQL functions are allowed (e.g. lower($value), upper($value))"
    )
    .optional()
});
export type SyncFieldSpec = z.infer<typeof SyncFieldSpecSchema>;
