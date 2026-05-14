/**
 * Validation helpers for user-proposed SQLite DDL.
 */

const USER_DDL_BLOCKED_PATTERNS = [
  /\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\b\s+FROM\b/i,
  /\bALTER\s+TABLE\b.*\bDROP\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bVACUUM\s+INTO\b/i,
  /\bLOAD_EXTENSION\s*\(/i,
  /\bPRAGMA\s+writable_schema\b/i
];

export function validateProposedSql(sql: string): string | null {
  for (const pattern of USER_DDL_BLOCKED_PATTERNS) {
    if (pattern.test(sql)) {
      const matched = pattern.exec(sql);
      return `Blocked DDL pattern detected: '${matched?.[0] ?? pattern.source}'`;
    }
  }

  return null;
}
