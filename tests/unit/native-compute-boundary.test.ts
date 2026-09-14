import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

async function runtimeSource(): Promise<string> {
  const root = new URL("../../src/", import.meta.url);
  const paths = (await readdir(root, { recursive: true })).filter((path) =>
    path.endsWith(".ts")
  );
  return (
    await Promise.all(
      paths.map(async (path) => await readFile(new URL(path, root), "utf8"))
    )
  ).join("\n");
}

describe("native compute boundary", () => {
  it("forbids JavaScript vector decoding and scoring across runtime sources", async () => {
    const text = await runtimeSource();

    expect(text).not.toMatch(/\b(?:function|const)\s+cosineSimilarity\b/);
    expect(text).not.toMatch(/\b(?:function|const)\s+decodeEmbedding\b/);
    expect(text).not.toMatch(/\b(?:function|const)\s+rankByCosine\b/);
    expect(text).not.toMatch(/\b(?:function|const)\s+blendBm25AndCosine\b/);
  });

  it("keeps vector retrieval and ranking out of the GhostCrab search wrapper", async () => {
    const text = await source("src/tools/facets/search.ts");

    for (const forbidden of [
      "decodeEmbedding",
      "cosineSimilarity",
      "rankByCosine",
      "blendBm25AndCosine",
      "embedding_blob IS NOT NULL"
    ]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).toContain("runStandaloneGhostcrabSearch");
  });

  it("does not rebuild and compare guidance embeddings in JavaScript", async () => {
    const text = await source("src/tools/pragma/guidance.ts");

    expect(text).not.toContain("embedMany(");
    expect(text).not.toContain("cosineSimilarity");
    expect(text).not.toContain("scoreEmbeddingSimilarity");
  });

  it("delegates embedding backfill persistence to one native batch contract", async () => {
    const text = await source("src/cli/embeddings-backfill.ts");

    expect(text).toContain("runStandaloneSearchEmbeddingBatchUpsert");
    expect(text).not.toContain("runStandaloneSearchEmbeddingUpsert");
    expect(text).not.toContain("UPDATE ${SQLITE_FACT_STORE_TABLE}");
    expect(text).not.toContain("encodeEmbedding");
  });
});
