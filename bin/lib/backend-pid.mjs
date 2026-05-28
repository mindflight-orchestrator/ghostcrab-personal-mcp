/**
 * PID file parsing, backend upgrade detection, and MindBrain capability probes.
 * Shared by serve.mjs and unit tests — keep in sync.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * @param {string} content
 * @returns {{ pid: number, port: number, version: string, fingerprint: string | null } | null}
 */
export function parsePidFile(content) {
  const parts = content.trim().split(":");
  const pid = parseInt(parts[0], 10);
  const port = parseInt(parts[1], 10);
  const version = parts[2] ?? "unknown";
  const fingerprint = parts[3]?.trim() ? parts[3].trim() : null;
  if (Number.isNaN(pid) || Number.isNaN(port)) {
    return null;
  }
  return { pid, port, version, fingerprint };
}

/**
 * @param {string} storedVersion
 * @param {string} currentVersion
 * @param {string | null | undefined} storedFingerprint
 * @param {string | null | undefined} currentFingerprint
 */
export function needsUpgrade(
  storedVersion,
  currentVersion,
  storedFingerprint,
  currentFingerprint
) {
  if (storedVersion !== currentVersion) {
    return true;
  }
  if (
    currentFingerprint &&
    storedFingerprint &&
    storedFingerprint !== currentFingerprint
  ) {
    return true;
  }
  return false;
}

/**
 * @param {number} pid
 * @param {number | string} port
 * @param {string} version
 * @param {string | null | undefined} fingerprint
 */
export function formatPidFile(pid, port, version, fingerprint) {
  const base = `${pid}:${port}:${version}`;
  return fingerprint ? `${base}:${fingerprint}\n` : `${base}\n`;
}

/**
 * @param {string} binPath
 * @returns {string | null}
 */
export function fingerprintBackendBinary(binPath) {
  try {
    const hash = createHash("sha256");
    hash.update(readFileSync(binPath));
    return hash.digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

/**
 * @param {string} baseUrl
 * @param {number} [timeoutMs]
 * @returns {Promise<{ ok: true, features: Record<string, boolean>, mindbrainVersion?: string } | { ok: false, reason: string }>}
 */
export async function probeMindbrainCapabilities(baseUrl, timeoutMs = 1000) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/mindbrain/capabilities`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (response.ok) {
      const payload = await response.json();
      const features =
        payload &&
        typeof payload === "object" &&
        payload.features &&
        typeof payload.features === "object"
          ? payload.features
          : {};
      return {
        ok: true,
        features,
        mindbrainVersion:
          typeof payload?.mindbrain_version === "string"
            ? payload.mindbrain_version
            : undefined
      };
    }
  } catch {
    // fall through to legacy route probe
  }

  try {
    const fallbackUrl = `${baseUrl.replace(/\/$/, "")}/api/mindbrain/graph/gap-rules?ontology_id=__capability_probe__`;
    const response = await fetch(fallbackUrl, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (response.status === 404 || response.status === 405) {
      return { ok: false, reason: "missing_graph_gap_routes" };
    }
    return {
      ok: true,
      features: {
        graph_diagnostics: true,
        graph_gap_rules: true
      }
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * @param {string} baseUrl
 * @param {number} [timeoutMs]
 */
export async function backendHasGraphDiagnostics(baseUrl, timeoutMs = 1000) {
  const probe = await probeMindbrainCapabilities(baseUrl, timeoutMs);
  if (!probe.ok) {
    return false;
  }
  return probe.features.graph_diagnostics === true;
}
