/**
 * Canonical encoding for the embedding values stored in `facets.embedding_blob`.
 *
 * Storage shape (process-wide invariant for GhostCrab):
 *   `facets.embedding_blob` (declared `BLOB`) holds a UTF-8 text payload of the
 *   form `[v1,v2,...,vN]`, where each `vK` is a JSON number. SQLite's flexible
 *   typing accepts text into a BLOB-affinity column without conversion.
 *
 * Why text-in-BLOB and not packed Float32 bytes:
 *   The MindBrain HTTP SQL passthrough (`POST /api/mindbrain/sql`) is
 *   JSON-based. JSON has no native byte-array type, so binding a real
 *   `Buffer`/`Uint8Array` would require a side-channel encoding (base64/hex)
 *   plus matching decoder support in the Zig backend. The plan's Phase 3.1
 *   nominally recommends packed Float32 bytes; in practice, until a typed
 *   `/api/mindbrain/sql/blob` route exists in the backend (see "Upstream
 *   follow-up #2" in the plan), staying on a JSON-friendly text format keeps
 *   the read path correct without a backend change.
 *
 * Compatibility:
 *   The legacy `formatPgVector` helper produced an identical string. This
 *   module is the single source of truth going forward; `formatPgVector` is
 *   kept only as a thin alias for callers that have not yet migrated.
 */

const VECTOR_RE = /^\s*\[(.*)\]\s*$/s;

/**
 * Encode an embedding vector as the canonical JSON-array text payload that
 * gets stored in `facets.embedding_blob`.
 *
 * Uses `Number.toString()` per component (no fixed precision, no scientific
 * notation suppression) which round-trips exactly through `Number.parseFloat`.
 */
export function encodeEmbedding(values: readonly number[]): string {
  return `[${values.map((value) => Number(value).toString()).join(",")}]`;
}

/**
 * Decode a `facets.embedding_blob` payload back into a `number[]`.
 *
 * Returns `null` when the payload is absent, empty, malformed, or contains a
 * non-finite component. Callers should treat `null` as "no usable embedding"
 * and fall back to keyword scoring for that row.
 */
export function decodeEmbedding(payload: unknown): number[] | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  let text: string;
  if (typeof payload === "string") {
    text = payload;
  } else if (payload instanceof Uint8Array) {
    text = new TextDecoder().decode(payload);
  } else if (
    typeof payload === "object" &&
    "type" in (payload as Record<string, unknown>) &&
    (payload as { type?: unknown }).type === "Buffer" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    // Node's JSON serialization of a Buffer.
    text = new TextDecoder().decode(
      Uint8Array.from((payload as { data: number[] }).data)
    );
  } else {
    return null;
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const match = VECTOR_RE.exec(trimmed);
  if (!match) {
    return null;
  }

  const inner = match[1].trim();
  if (inner.length === 0) {
    return [];
  }

  const parts = inner.split(",");
  const values = new Array<number>(parts.length);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]?.trim();
    if (!part) {
      return null;
    }
    const value = Number.parseFloat(part);
    if (!Number.isFinite(value)) {
      return null;
    }
    values[index] = value;
  }
  return values;
}

/**
 * Cosine similarity in [-1, 1] for two embedding vectors of equal length.
 * Returns 0 when either input is empty or zero-norm; never throws.
 */
export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[]
): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  const denom = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  if (denom === 0) {
    return 0;
  }
  return dot / denom;
}
