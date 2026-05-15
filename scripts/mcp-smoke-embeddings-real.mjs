import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  assertToolSuccess,
  callToolJson,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

process.env.MCP_SMOKE_TIMEOUT_MS ??= "30000";

// Phase 4: semantic and hybrid retrieval are wired. Smoke scripts default to
// asserting the wired behaviour. Setting GHOSTCRAB_SEMANTIC_WIRED=0 reverts to
// the Phase 1 keyword_sql fallback assertions — useful for environments that
// have not run the FTS-sync bootstrap (e.g. an older MindBrain backend).
const semanticWired = process.env.GHOSTCRAB_SEMANTIC_WIRED !== "0";

const localEnv = readLocalEnvFile();
const openRouterApiKey =
  process.env.GHOSTCRAB_EMBEDDINGS_API_KEY ??
  process.env.OPENROUTER_API_KEY ??
  localEnv.GHOSTCRAB_EMBEDDINGS_API_KEY ??
  localEnv.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  console.error(
    "[ghostcrab-smoke] Skipping real embeddings smoke: OPENROUTER_API_KEY is not configured."
  );
  process.exit(0);
}

await withSmokeClient(
  "ghostcrab-smoke-embeddings-real-client",
  async ({ client }) => {
    const content =
      "Real embeddings validation note: OpenRouter semantic retrieval is enabled for GhostCrab smoke tests.";

    const rememberPayload = await callToolJson(
      client,
      "ghostcrab_remember",
      {
        content,
        facets: {
          domain: "embedding-real-smoke",
          type: "semantic-note"
        },
        schema_id: "agent:observation",
        created_by: "smoke:embeddings-real"
      },
      "ghostcrab_remember(embeddings-real)"
    );

    assertToolSuccess(rememberPayload, "ghostcrab_remember");
    assert.equal(rememberPayload.embedding_stored, true);
    assert.equal(rememberPayload.embedding_runtime.mode, "openrouter");

    const semanticSearchPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: content,
        filters: {
          domain: "embedding-real-smoke"
        },
        mode: "semantic",
        limit: 5
      },
      "ghostcrab_search(semantic/real)"
    );

    assertToolSuccess(semanticSearchPayload, "ghostcrab_search");
    assert.equal(semanticSearchPayload.embedding_runtime.mode, "openrouter");
    assert.equal(
      semanticSearchPayload.results.some((row) =>
        row.content.includes("OpenRouter semantic retrieval")
      ),
      true
    );
    assert.deepEqual(semanticSearchPayload.hybrid_weights, {
      bm25: 0.6,
      vector: 0.4
    });

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
        query: "OpenRouter semantic retrieval GhostCrab smoke tests",
        filters: {
          domain: "embedding-real-smoke"
        },
        mode: "hybrid",
        limit: 5
      },
      "ghostcrab_search(hybrid/real)"
    );

    assertToolSuccess(hybridSearchPayload, "ghostcrab_search");
    assert.equal(hybridSearchPayload.embedding_runtime.mode, "openrouter");

    if (semanticWired) {
      assert.equal(hybridSearchPayload.mode_applied, "hybrid");
    } else {
      assert.equal(hybridSearchPayload.mode_applied, "keyword_sql");
    }

    const packPayload = await callToolJson(
      client,
      "ghostcrab_pack",
      {
        query: "OpenRouter semantic retrieval smoke tests",
        agent_id: "agent:self",
        scope: "native-build"
      },
      "ghostcrab_pack(real-embeddings)"
    );

    assertToolSuccess(packPayload, "ghostcrab_pack");
    assert.equal(packPayload.embedding_runtime.mode, "openrouter");
    assert.equal(
      packPayload.facts_mode_applied,
      semanticWired ? "hybrid" : "keyword_sql"
    );

    const statusPayload = await callToolJson(
      client,
      "ghostcrab_status",
      {},
      "ghostcrab_status(real-embeddings)"
    );

    assertToolSuccess(statusPayload, "ghostcrab_status");
    assert.equal(statusPayload.runtime.embeddings.mode, "openrouter");
    assert.deepEqual(statusPayload.runtime.retrieval, {
      hybrid_bm25_weight: 0.6,
      hybrid_vector_weight: 0.4
    });

    console.error(
      semanticWired
        ? "[ghostcrab-smoke] Real embeddings scenario validated against OpenRouter: remember + semantic + hybrid + pack + status."
        : "[ghostcrab-smoke] Real embeddings scenario validated against OpenRouter: remember + keyword_sql fallback + pack + status (semantic wiring deferred to Phase 3; set GHOSTCRAB_SEMANTIC_WIRED=1 to flip)."
    );
  },
  {
    serverEnv: {
      OPENROUTER_API_KEY: openRouterApiKey,
      GHOSTCRAB_EMBEDDINGS_API_KEY:
        process.env.GHOSTCRAB_EMBEDDINGS_API_KEY ??
        localEnv.GHOSTCRAB_EMBEDDINGS_API_KEY ??
        openRouterApiKey,
      GHOSTCRAB_EMBEDDINGS_MODE: "openrouter",
      GHOSTCRAB_EMBEDDINGS_MODEL:
        process.env.GHOSTCRAB_EMBEDDINGS_MODEL ??
        localEnv.GHOSTCRAB_EMBEDDINGS_MODEL ??
        "openai/text-embedding-3-small",
      GHOSTCRAB_HYBRID_BM25_WEIGHT: "0.6",
      GHOSTCRAB_HYBRID_VECTOR_WEIGHT: "0.4"
    }
  }
);

function readLocalEnvFile() {
  const envPath = path.join(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return {};
  }

  const values = {};
  const contents = readFileSync(envPath, "utf8");

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}
