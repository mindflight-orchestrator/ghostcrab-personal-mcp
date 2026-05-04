import type { TemporalFilter } from "./filter-schemas.js";

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonth(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  const month = q * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), month, 1, 0, 0, 0, 0));
}

function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  const month = q * 3 + 2;
  return new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0, 23, 59, 59, 999));
}

/**
 * Resolves relative presets and optional ISO bounds to an inclusive [from, to] in UTC.
 */
export function resolveTemporalBounds(
  filter: TemporalFilter,
  now: Date = new Date()
): { from: Date | null; to: Date | null } {
  if (filter.relative) {
    switch (filter.relative) {
      case "last_7_days": {
        const to = new Date(now.getTime());
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { from, to };
      }
      case "this_month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "this_quarter":
        return { from: startOfQuarter(now), to: endOfQuarter(now) };
      default:
        return { from: null, to: null };
    }
  }

  const from = filter.from ? new Date(filter.from) : null;
  const to = filter.to ? new Date(filter.to) : null;
  return { from, to };
}
