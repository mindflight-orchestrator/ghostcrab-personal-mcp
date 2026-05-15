/**
 * Registry client — pulls ontologies and skills from a remote GhostCrab registry.
 *
 * Contract: see `cmd/backend/registry_openapi.yml` (same shape as the hosted service).
 *
 * Privacy: public resources need no token; private resources need `Authorization: Bearer`.
 * Successful private fetches may include `licensee`; the CLI watermarks pulled files for traceability.
 *
 * Summary of endpoints the CLI uses:
 *   GET /ontologies/{owner}/{name}  → ResourceBody (JSON: owner, name, version, access, content, …)
 *   GET /skills/{owner}/{name}      → same
 *   GET /ontologies                 → ListItem[] (owner, name, version, access, description?, …)
 *   GET /skills                     → same
 *
 * Error bodies are typically `{ "error": "<message>" }` (application/json).
 */

export const DEFAULT_REGISTRY_URL = "https://registry.ghostcrab.io";

/** Prefer OpenAPI `Error` JSON `{ "error": "..." }` when the body parses as such. */
async function readRegistryErrorText(res) {
  const text = await res.text().catch(() => "");
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const j = JSON.parse(trimmed);
    if (j && typeof j.error === "string" && j.error) return j.error;
  } catch {
    // not JSON
  }
  return trimmed;
}

/**
 * Fetch a single resource (ontology or skill) from the registry.
 * Returns { content: string, version: string, access: "public"|"private", licensee?: string }
 */
export async function fetchResource({ registryUrl, token, type, owner, name }) {
  const base = registryUrl ?? DEFAULT_REGISTRY_URL;
  const endpoint = `${base}/${type}/${owner}/${name}`;

  const headers = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(endpoint, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(
      `Registry unreachable (${base}): ${err.message}\n` +
        `  Check your internet connection or registry.url config.`,
      { cause: err }
    );
  }

  if (res.status === 401) {
    throw new Error(
      `Authentication required for "${owner}/${name}".\n` +
        `  Run: gcp env set registry.token <your-token>  (legacy: gcp config set …)`
    );
  }
  if (res.status === 403) {
    throw new Error(
      `Access denied for "${owner}/${name}".\n` +
        `  Your token may not have permission to access this resource.`
    );
  }
  if (res.status === 404) {
    throw new Error(`"${owner}/${name}" not found in registry (${base}).`);
  }
  if (!res.ok) {
    const body = await readRegistryErrorText(res);
    throw new Error(`Registry returned ${res.status}: ${body}`);
  }

  return await res.json();
}

/**
 * List available resources of a given type from the registry.
 * Returns an array of resource descriptors.
 */
export async function listRegistryResources({ registryUrl, token, type }) {
  const base = registryUrl ?? DEFAULT_REGISTRY_URL;
  const endpoint = `${base}/${type}`;

  const headers = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(endpoint, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`Registry unreachable (${base}): ${err.message}`, { cause: err });
  }

  if (!res.ok) {
    const body = await readRegistryErrorText(res);
    throw new Error(`Registry returned ${res.status}: ${body}`);
  }

  return await res.json();
}

// ── CLI arg helpers ───────────────────────────────────────────────────────────

/**
 * @param {string[]} args
 * @param {object} config
 * @returns {string | null}
 */
export function resolveRegistryToken(args, config) {
  const idx = args.findIndex((a) => a === "--token" || a === "-t");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return config.registry?.token ?? null;
}

/**
 * @param {string[]} args
 * @param {object} config
 * @returns {string}
 */
export function resolveRegistryUrl(args, config) {
  const idx = args.findIndex((a) => a === "--registry" || a === "-r");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return config.registry?.url ?? DEFAULT_REGISTRY_URL;
}

// ── Watermarking ──────────────────────────────────────────────────────────────

/**
 * Prepend a watermark header to a downloaded file's content.
 * The header identifies the licensee so redistribution is traceable.
 *
 * Uses YAML-style comments so it's valid in both .yaml and .md files.
 */
export function applyWatermark(content, { resourceId, licensee, pulledAt }) {
  const lines = [
    `# ghostcrab-license: ${licensee}`,
    `# resource: ${resourceId}`,
    `# pulled: ${pulledAt}`,
    `# This file is licensed to the above entity only. Do not redistribute.`,
    ``,
  ];
  return lines.join("\n") + content;
}

/** Parse the watermark header from a downloaded file, or return null. */
export function readWatermark(content) {
  const lines = content.split("\n");
  if (!lines[0]?.startsWith("# ghostcrab-license:")) return null;
  return {
    licensee: lines[0].replace("# ghostcrab-license:", "").trim(),
    resource: lines[1]?.replace("# resource:", "").trim() ?? "",
    pulledAt: lines[2]?.replace("# pulled:", "").trim() ?? "",
  };
}
