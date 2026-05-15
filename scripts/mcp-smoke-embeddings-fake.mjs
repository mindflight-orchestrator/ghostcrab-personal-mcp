import assert from "node:assert/strict";

import {
  assertToolSuccess,
  callToolJson,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

// Phase 4: semantic and hybrid retrieval are wired. Smoke scripts default to
// asserting the wired behaviour. Setting GHOSTCRAB_SEMANTIC_WIRED=0 reverts to
// the Phase 1 keyword_sql fallback assertions — useful for environments that
// have not run the FTS-sync bootstrap (e.g. an older MindBrain backend).
const semanticWired = process.env.GHOSTCRAB_SEMANTIC_WIRED !== "0";

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
    assert.equal(semanticSearchPayload.embedding_runtime.mode, "fake");
    assert.equal(semanticSearchPayload.returned >= 1, true);

    if (semanticWired) {
      assert.equal(semanticSearchPayload.mode_applied, "semantic");
      assert.equal(semanticSearchPayload.semantic_available, true);
    } else {
      assert.equal(semanticSearchPayload.mode_applied, "keyword_sql");
      assert.equal(semanticSearchPayload.semantic_available, false);
    }

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
    assert.equal(
      hybridSearchPayload.results.some((row) =>
        row.content.includes("native extension build")
      ),
      true
    );

    if (semanticWired) {
      assert.equal(hybridSearchPayload.mode_applied, "hybrid");
      assert.equal(hybridSearchPayload.semantic_available, true);
    } else {
      assert.equal(hybridSearchPayload.mode_applied, "keyword_sql");
      assert.equal(hybridSearchPayload.semantic_available, false);
    }

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
      semanticWired
        ? "[ghostcrab-smoke] Fake embeddings scenario validated: write path + semantic/hybrid retrieval."
        : "[ghostcrab-smoke] Fake embeddings scenario validated: write path + keyword_sql fallback (semantic wiring deferred to Phase 3; set GHOSTCRAB_SEMANTIC_WIRED=1 to flip)."
    );
  }
);
