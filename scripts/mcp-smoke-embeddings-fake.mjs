import assert from "node:assert/strict";

import {
  assertToolSuccess,
  callToolJson,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

await withSmokeClient(
  "ghostcrab-smoke-embeddings-fake-client",
  async ({ client }) => {
    const rememberPayload = await callToolJson(
      client,
      "ghostcrab_remember",
      {
        content:
          "Fake embeddings validation note: native extension build remains blocked by version pinning.",
        facets: {
          domain: "embedding-smoke",
          type: "semantic-note"
        },
        schema_id: "agent:observation",
        created_by: "smoke:embeddings-fake"
      },
      "ghostcrab_remember(embeddings-fake)"
    );

    assertToolSuccess(rememberPayload, "ghostcrab_remember");
    assert.equal(rememberPayload.embedding_stored, true);

    const semanticSearchPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query:
          "Fake embeddings validation note: native extension build remains blocked by version pinning.",
        filters: {
          domain: "embedding-smoke"
        },
        mode: "semantic",
        limit: 5
      },
      "ghostcrab_search(semantic/fake)"
    );

    assertToolSuccess(semanticSearchPayload, "ghostcrab_search");
    assert.equal(semanticSearchPayload.mode_applied, "semantic");
    assert.equal(semanticSearchPayload.semantic_available, true);
    assert.equal(semanticSearchPayload.embedding_runtime.mode, "fake");
    assert.equal(semanticSearchPayload.returned >= 1, true);

    const hybridSearchPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "native extension build version pinning",
        filters: {
          domain: "embedding-smoke"
        },
        mode: "hybrid",
        limit: 5
      },
      "ghostcrab_search(hybrid/fake)"
    );

    assertToolSuccess(hybridSearchPayload, "ghostcrab_search");
    assert.equal(hybridSearchPayload.mode_applied, "hybrid");
    assert.equal(hybridSearchPayload.semantic_available, true);
    assert.equal(
      hybridSearchPayload.results.some((row) =>
        row.content.includes("native extension build")
      ),
      true
    );

    const packPayload = await callToolJson(
      client,
      "ghostcrab_pack",
      {
        query: "native extension build version pinning",
        agent_id: "agent:self",
        scope: "native-build"
      },
      "ghostcrab_pack(fake-embeddings)"
    );

    assertToolSuccess(packPayload, "ghostcrab_pack");
    assert.equal(packPayload.embedding_runtime.mode, "fake");
    assert.equal(packPayload.has_blocking_constraint, true);

    console.error(
      "[ghostcrab-smoke] Fake embeddings scenario validated: write path + semantic/hybrid retrieval."
    );
  }
);
