/**
 * Parse npm package specs like @scope/pkg@1.2.3 for MCP launch commands.
 */

/**
 * @param {string} spec
 * @returns {{ name: string, version: string }}
 */
export function parseNpmPackageSpec(spec) {
  if (!spec || typeof spec !== "string") {
    return { name: spec ?? "", version: "latest" };
  }
  const trimmed = spec.trim();
  const scoped = trimmed.match(/^(@[^/]+\/[^@]+)@(.+)$/);
  if (scoped) {
    return { name: scoped[1], version: scoped[2] };
  }
  const at = trimmed.lastIndexOf("@");
  if (at > 0) {
    return { name: trimmed.slice(0, at), version: trimmed.slice(at + 1) };
  }
  return { name: trimmed, version: "latest" };
}

/**
 * @param {string} spec
 * @returns {string} e.g. --package=@scope/pkg@1.2.3
 */
export function formatNpxPackageArg(spec) {
  const { name, version } = parseNpmPackageSpec(spec);
  return `--package=${name}@${version}`;
}

/**
 * @param {string} spec
 * @returns {string} e.g. @scope/pkg@1.2.3
 */
export function formatDlxPackageSpec(spec) {
  const { name, version } = parseNpmPackageSpec(spec);
  return `${name}@${version}`;
}
