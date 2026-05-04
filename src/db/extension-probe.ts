import type { NativeExtensionsMode } from "../config/env.js";

import type { DatabaseClient } from "./client.js";

export interface ExtensionCapabilities {
  pgFacets: boolean;
  pgDgraph: boolean;
  pgPragma: boolean;
  pgMindbrain?: boolean;
}

/**
 * "conditional" means the native path is available but only activates for specific call shapes
 * (e.g. pragma pack uses native only when scope is undefined). Neither "native" nor "sql" alone
 * would be truthful.
 */
export type SubsystemBackend = "sql" | "native" | "conditional";

const EXTENSION_NAMES = [
  "pg_facets",
  "pg_dgraph",
  "pg_pragma",
  "pg_mindbrain"
] as const;

/**
 * Effective routing for status reporting. Reflects current handler behavior:
 * - facets/graph remain SQL until native paths land (PR-4/PR-5).
 * - pragma is "conditional": native pack activates only when scope === undefined.
 */
export function computeSubsystemBackends(
  extensions: ExtensionCapabilities,
  mode: NativeExtensionsMode
): {
  facets: SubsystemBackend;
  graph: SubsystemBackend;
  pragma: SubsystemBackend;
} {
  if (mode === "sql-only") {
    return { facets: "sql", graph: "sql", pragma: "sql" };
  }

  return {
    facets: "sql",
    graph: "sql",
    pragma: extensions.pgPragma ? "conditional" : "sql"
  };
}

export async function probePgExtensions(
  database: DatabaseClient
): Promise<ExtensionCapabilities> {
  const rows = await database.query<{ extname: string }>(
    `
      SELECT extname::text
      FROM pg_extension
      WHERE extname = ANY($1::text[])
    `,
    [EXTENSION_NAMES]
  );

  const loaded = new Set(rows.map((row) => row.extname));
  const hasUnified = loaded.has("pg_mindbrain");

  return {
    pgFacets: hasUnified || loaded.has("pg_facets"),
    pgDgraph: hasUnified || loaded.has("pg_dgraph"),
    pgPragma: hasUnified || loaded.has("pg_pragma"),
    pgMindbrain: hasUnified
  };
}

/**
 * Resolves extension flags according to `MINDBRAIN_NATIVE_EXTENSIONS`.
 * - `sql-only`: skip pg_extension probe; all capabilities false (portable SQL only).
 * - `auto` / `native`: probe pg_extension.
 * - `native`: fail fast if the required subsystem capabilities are unavailable.
 *   A unified `pg_mindbrain` install satisfies all three capabilities.
 */
export async function resolveExtensionCapabilities(
  database: DatabaseClient,
  mode: NativeExtensionsMode
): Promise<ExtensionCapabilities> {
  if (mode === "sql-only") {
    return { pgFacets: false, pgDgraph: false, pgPragma: false, pgMindbrain: false };
  }

  const caps = await probePgExtensions(database);

  if (mode === "native") {
    if (!caps.pgFacets || !caps.pgDgraph || !caps.pgPragma) {
      throw new Error(
        `MINDBRAIN_NATIVE_EXTENSIONS=native requires pg_facets, pg_dgraph, and pg_pragma. Found: pg_facets=${caps.pgFacets}, pg_dgraph=${caps.pgDgraph}, pg_pragma=${caps.pgPragma}`
      );
    }
  }

  return caps;
}
