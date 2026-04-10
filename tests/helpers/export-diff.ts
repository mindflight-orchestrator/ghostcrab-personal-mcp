/**
 * Structural diff utility for workspace export payloads.
 * Compares two exports ignoring volatile fields (exported_at).
 * Returns an array of diff strings; empty array means equivalent.
 */

export interface ExportPayload {
  schema_version?: string;
  workspace?: Record<string, unknown>;
  tables?: Array<Record<string, unknown>>;
  columns?: Array<Record<string, unknown>>;
  relations?: Array<Record<string, unknown>>;
  generation_hints?: Record<string, unknown>;
  validation_warnings?: string[];
  [key: string]: unknown;
}

const IGNORED_FIELDS = new Set(["exported_at"]);

export function diffExports(
  actual: ExportPayload,
  expected: ExportPayload,
  path = ""
): string[] {
  const diffs: string[] = [];

  for (const key of Object.keys(expected)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const fieldPath = path ? `${path}.${key}` : key;
    const expectedVal = expected[key];
    const actualVal = actual[key];

    if (Array.isArray(expectedVal)) {
      if (!Array.isArray(actualVal)) {
        diffs.push(`${fieldPath}: expected array, got ${typeof actualVal}`);
        continue;
      }
      diffs.push(...diffArrays(actualVal, expectedVal, fieldPath));
    } else if (expectedVal !== null && typeof expectedVal === "object") {
      if (actualVal === null || typeof actualVal !== "object") {
        diffs.push(`${fieldPath}: expected object, got ${String(actualVal)}`);
        continue;
      }
      diffs.push(...diffExports(
        actualVal as ExportPayload,
        expectedVal as ExportPayload,
        fieldPath
      ));
    } else {
      if (actualVal !== expectedVal) {
        diffs.push(`${fieldPath}: expected ${JSON.stringify(expectedVal)}, got ${JSON.stringify(actualVal)}`);
      }
    }
  }

  return diffs;
}

function diffArrays(
  actual: unknown[],
  expected: unknown[],
  path: string
): string[] {
  const diffs: string[] = [];

  // For tables/columns/relations: match by natural key, not by index
  const naturalKey = getNaturalKeyFn(path);

  if (naturalKey) {
    const actualMap = new Map(
      actual.map((item) => [naturalKey(item as Record<string, unknown>), item as Record<string, unknown>])
    );
    for (const expectedItem of expected) {
      const key = naturalKey(expectedItem as Record<string, unknown>);
      const actualItem = actualMap.get(key);
      if (!actualItem) {
        diffs.push(`${path}[${key}]: missing in actual`);
        continue;
      }
      diffs.push(...diffExports(actualItem, expectedItem as ExportPayload, `${path}[${key}]`));
    }
  } else {
    // Ordered comparison
    if (actual.length !== expected.length) {
      diffs.push(`${path}: length mismatch (actual=${actual.length}, expected=${expected.length})`);
    }
    for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
      const a = actual[i] as ExportPayload;
      const e = expected[i] as ExportPayload;
      if (typeof e === "object" && e !== null) {
        diffs.push(...diffExports(a, e, `${path}[${i}]`));
      } else if (a !== e) {
        diffs.push(`${path}[${i}]: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
      }
    }
  }

  return diffs;
}

function getNaturalKeyFn(
  path: string
): ((item: Record<string, unknown>) => string) | null {
  const leaf = path.split(".").pop() ?? path;
  if (leaf === "tables") {
    return (item) => `${item.schema_name}.${item.table_name}`;
  }
  if (leaf === "columns") {
    return (item) => `${item.schema_name}.${item.table_name}.${item.column_name}`;
  }
  if (leaf === "relations") {
    return (item) =>
      `${item.source_schema}.${item.source_table}.${item.source_column}→${item.target_schema}.${item.target_table}`;
  }
  if (leaf === "table_order") {
    return null;
  }
  return null;
}

/**
 * Assert that actual matches expected structurally.
 * Throws with a formatted diff message if there are mismatches.
 */
export function assertExportMatch(
  actual: ExportPayload,
  expected: ExportPayload
): void {
  const diffs = diffExports(actual, expected);
  if (diffs.length > 0) {
    throw new Error(
      `Export mismatch (${diffs.length} diff(s)):\n  ${diffs.join("\n  ")}`
    );
  }
}
