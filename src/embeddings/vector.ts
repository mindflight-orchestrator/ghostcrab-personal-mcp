import { createHash } from "node:crypto";

export function createDeterministicUnitVector(
  text: string,
  dimensions: number
): number[] {
  const values = new Array<number>(dimensions).fill(0);
  if (dimensions === 0) return values;

  // Test-only fake provider: one digest and at most eight assignments. It must
  // not turn local validation into a JavaScript embedding workload.
  const digest = createHash("sha256").update(text).digest();
  const activeDimensions = Math.min(8, dimensions);
  const components = new Map<number, number>();
  for (let index = 0; index < activeDimensions; index += 1) {
    const digestOffset = (index * 2) % (digest.length - 1);
    const vectorIndex = digest.readUInt16BE(digestOffset) % dimensions;
    const sign = (digest[(index + 16) % digest.length] & 1) === 0 ? -1 : 1;
    components.set(vectorIndex, (components.get(vectorIndex) ?? 0) + sign);
  }

  const norm =
    Math.sqrt(
      [...components.values()].reduce((sum, value) => sum + value * value, 0)
    ) || 1;
  for (const [index, value] of components) values[index] = value / norm;
  return values;
}
