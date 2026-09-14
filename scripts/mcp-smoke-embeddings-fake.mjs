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
const smokeContent =
  "Fake embeddings validation note: native extension build remains blocked by version pinning.";

await withSmokeClient(
  "ghostcrab-smoke-embeddings-fake-client",
  async ({ client, getStderrOutput }) => {
    await waitForBootstrap(getStderrOutput);
    const rememberPayload = await callToolJson(
      client,
      "ghostcrab_remember",
      {
        content:
          smokeContent,
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
        query: smokeContent,
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
        query: smokeContent,
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
        selection_mode: "exact",
        scope: "default:native-build"
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
  },
  {
    serverEnv: {
      GHOSTCRAB_BOOTSTRAP_SEED: "1",
      GHOSTCRAB_EMBEDDINGS_MODE: "fake"
    }
  }
);

async function waitForBootstrap(getStderrOutput) {
  const timeoutMs = Number.parseInt(
    process.env.MCP_SMOKE_BOOTSTRAP_TIMEOUT_MS ?? "60000",
    10
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const output = getStderrOutput();
    if (output.includes("bootstrap seed complete")) return;
    if (output.includes("bootstrap seed failed")) {
      throw new Error(`Bootstrap seed failed.\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Bootstrap seed did not complete within ${timeoutMs}ms.\n${getStderrOutput()}`
  );
}
