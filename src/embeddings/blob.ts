/**
 * Encode a provider vector for the legacy `agent_facts.embedding_blob` field.
 * Native MindBrain owns vector indexing, decoding, similarity and ranking;
 * JavaScript only forwards the provider result across the write contract.
 */
export function encodeEmbedding(values: readonly number[]): string {
  return `[${values.map((value) => Number(value).toString()).join(",")}]`;
}
