import { z } from "zod";

export const TemporalFilterSchema = z
  .object({
    facet_key: z.string().min(1).max(63),
    from: z.string().max(32).optional(),
    to: z.string().max(32).optional(),
    relative: z.enum(["last_7_days", "this_month", "this_quarter"]).optional()
  })
  .superRefine((val, ctx) => {
    const hasRelative = val.relative !== undefined;
    const hasAbsolute = val.from !== undefined || val.to !== undefined;
    if (!hasRelative && !hasAbsolute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "temporal filter requires relative or at least one of from, to"
      });
    }
    if (hasRelative && hasAbsolute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "temporal filter cannot combine relative with from/to"
      });
    }
  });

export type TemporalFilter = z.infer<typeof TemporalFilterSchema>;

export const RangeFilterSchema = z
  .object({
    facet_key: z.string().min(1).max(63),
    min: z.number().optional(),
    max: z.number().optional()
  })
  .superRefine((val, ctx) => {
    if (val.min === undefined && val.max === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "range filter requires min and/or max"
      });
    }
  });

export type RangeFilter = z.infer<typeof RangeFilterSchema>;
