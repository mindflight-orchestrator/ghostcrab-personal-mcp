import { createHash } from "node:crypto";

export function createDeterministicUnitVector(
  text: string,
  dimensions: number
): number[] {
  const values = new Array<number>(dimensions).fill(0);
  let norm = 0;

  for (let index = 0; index < dimensions; index += 1) {
    const digest = createHash("sha256").update(`${text}:${index}`).digest();
    const raw = digest.readInt16BE(index % (digest.length - 1));
    const normalized = raw / 32_768;

    values[index] = normalized;
    norm += normalized * normalized;
  }

  const scale = Math.sqrt(norm) || 1;
  return values.map((value) => value / scale);
}

/**
 * @deprecated Prefer `encodeEmbedding` from `./blob.js`. Kept as a thin alias
 * because the wire format is the same (canonical JSON-array text payload
 * stored in `facets.embedding_blob`). Will be removed once all call sites
 * have migrated.
 */
export function formatPgVector(vector: number[]): string {
  return `[${vector.map((value) => Number(value).toString()).join(",")}]`;
}
