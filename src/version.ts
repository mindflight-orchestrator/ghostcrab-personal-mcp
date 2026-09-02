import { readFile } from "node:fs/promises";

const FALLBACK_VERSION = "0.1.0";

/**
 * MCP tool JSON envelope version — bump on each GhostCrab npm tag (use the
 * release date, e.g. v0.5.2 → 2026-06-10). Also bump `mindbrain_version` in
 * mindbrain-perso `src/standalone/schema_column_migrations.zig` when tagging MindBrain.
 */
export const GHOSTCRAB_MCP_SURFACE_VERSION = "2026-09-02";

export async function getPackageVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const packageJsonContents = await readFile(packageJsonPath, "utf8");
    const parsedPackageJson = JSON.parse(packageJsonContents) as {
      version?: unknown;
    };

    return typeof parsedPackageJson.version === "string"
      ? parsedPackageJson.version
      : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}
