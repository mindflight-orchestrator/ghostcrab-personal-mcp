import { describe, expect, it } from "vitest";
import {
  CollectionFacetSearchInput,
  collectionFacetSearchTool
} from "../../src/tools/facets/collection-search.js";

describe("document and chunk facet target contract", () => {
  it("advertises exact targets and ontology identity", () => {
    expect(
      collectionFacetSearchTool.definition.inputSchema.properties
    ).toMatchObject({
      target_kind: { enum: ["doc", "chunk"] },
      chunk_index: { minimum: 0 },
      ontology_id: { type: "string" },
      doc_id: { type: ["integer", "string"] }
    });
  });
  it("retains chunk zero and an exact bigint document id", () => {
    expect(
      CollectionFacetSearchInput.parse({
        collection_id: "docs",
        target_kind: "chunk",
        chunk_index: 0,
        doc_id: "9007199254740993",
        ontology_id: "other::core"
      })
    ).toMatchObject({
      chunk_index: 0,
      doc_id: "9007199254740993",
      ontology_id: "other::core"
    });
  });
  it("retains the native unsigned 64-bit document range", () => {
    expect(
      CollectionFacetSearchInput.parse({
        collection_id: "docs",
        doc_id: "18446744073709551615"
      }).doc_id
    ).toBe("18446744073709551615");
  });
  it("rejects contradictory targets and lossy or overflowing identifiers", () => {
    for (const extra of [
      { target_kind: "doc", chunk_index: 0 },
      { doc_id: 9007199254740992 },
      { doc_id: "18446744073709551616" },
      { doc_id: "not-an-id" },
      { doc_id: "" },
      { chunk_index: -1 },
      { chunk_index: 4294967296 }
    ]) {
      expect(
        CollectionFacetSearchInput.safeParse({
          collection_id: "docs",
          ...extra
        }).success
      ).toBe(false);
    }
  });
});
