/**
 * Converts an arbitrary workspace name to a safe slug for use as a config key
 * and SQLite filename.
 *
 * Rules:
 *   - Lowercase the input
 *   - Collapse any run of non-alphanumeric characters into a single hyphen
 *   - Strip leading and trailing hyphens
 *
 * Examples:
 *   "My Project"        → "my-project"
 *   "acme/v2"           → "acme-v2"
 *   "  Hello World!  "  → "hello-world"
 *   "already-fine"      → "already-fine"
 *   "default"           → "default"
 */
export function slugifyWorkspace(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
