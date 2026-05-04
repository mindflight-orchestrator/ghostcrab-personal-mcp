import assert from "node:assert/strict";

import {
  assertToolSuccess,
  assertPathContainsNode,
  callToolJson,
  listTools,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

await withSmokeClient(
  "ghostcrab-smoke-client",
  async ({ client, getStderrOutput }) => {
    const toolNames = await listTools(client);
    const stderrOutput = getStderrOutput();

    assert.equal(
      toolNames.length >= 20,
      true,
      `Expected at least 20 registered GhostCrab tools. stderr:\n${stderrOutput}`
    );
    assert.ok(
      toolNames.includes("ghostcrab_search") &&
        toolNames.includes("ghostcrab_remember") &&
        toolNames.includes("ghostcrab_upsert") &&
        toolNames.includes("ghostcrab_count") &&
        toolNames.includes("ghostcrab_status") &&
        toolNames.includes("ghostcrab_workspace_create") &&
        toolNames.includes("ghostcrab_ddl_propose"),
      `Missing expected tools. Registered tools: ${toolNames.join(", ")}`
    );

    const rememberPayload = await callToolJson(
      client,
      "ghostcrab_remember",
      {
        content: "Phase 2 smoke fact for GhostCrab MCP.",
        facets: {
          domain: "smoke",
          type: "verification"
        },
        schema_id: "agent:observation",
        created_by: "smoke:mcp"
      },
      "ghostcrab_remember"
    );

    assertToolSuccess(rememberPayload, "ghostcrab_remember");
    assert.equal(rememberPayload.stored, true);
    assert.equal(rememberPayload.schema_id, "agent:observation");

    const upsertPayload = await callToolJson(
      client,
      "ghostcrab_upsert",
      {
        schema_id: "agent:observation",
        match: {
          id: rememberPayload.id
        },
        set_facets: {
          status: "active"
        },
        created_by: "smoke:mcp"
      },
      "ghostcrab_upsert"
    );

    assertToolSuccess(upsertPayload, "ghostcrab_upsert");
    assert.equal(upsertPayload.updated, true);
    assert.equal(upsertPayload.created, false);

    const searchPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "smoke fact",
        filters: {
          domain: "smoke",
          status: "active"
        },
        mode: "bm25",
        limit: 5
      },
      "ghostcrab_search"
    );

    assertToolSuccess(searchPayload, "ghostcrab_search");
    assert.equal(searchPayload.returned >= 1, true);

    const systemSearchPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "",
        schema_id: "mindbrain:system",
        filters: {
          entry_type: "tool",
          tool_name: "ghostcrab_pack"
        },
        limit: 5
      },
      "ghostcrab_search(mindbrain:system)"
    );

    assertToolSuccess(systemSearchPayload, "ghostcrab_search");
    assert.equal(systemSearchPayload.returned >= 1, true);

    const countPayload = await callToolJson(
      client,
      "ghostcrab_count",
      {
        group_by: ["domain"],
        filters: {
          domain: "smoke"
        }
      },
      "ghostcrab_count"
    );

    assertToolSuccess(countPayload, "ghostcrab_count");
    assert.equal(countPayload.counts.domain.smoke >= 1, true);

    const schemaInspectPayload = await callToolJson(
      client,
      "ghostcrab_schema_inspect",
      {
        schema_id: "ghostcrab:runtime-component"
      },
      "ghostcrab_schema_inspect"
    );

    assertToolSuccess(schemaInspectPayload, "ghostcrab_schema_inspect");
    assert.equal(schemaInspectPayload.found, true);
    assert.equal(schemaInspectPayload.meta.target, "facets");

    const productCountPayload = await callToolJson(
      client,
      "ghostcrab_count",
      {
        schema_id: "ghostcrab:roadmap-pr",
        group_by: ["status"]
      },
      "ghostcrab_count(ghostcrab:roadmap-pr)"
    );

    assertToolSuccess(productCountPayload, "ghostcrab_count");
    assert.equal(productCountPayload.counts.status.done >= 1, true);
    assert.equal(productCountPayload.counts.status.planned >= 1, true);

    const productSearchPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "",
        schema_id: "ghostcrab:runtime-component",
        filters: {
          status: "active"
        },
        limit: 10
      },
      "ghostcrab_search(ghostcrab:runtime-component)"
    );

    assertToolSuccess(productSearchPayload, "ghostcrab_search");
    assert.equal(productSearchPayload.returned >= 1, true);

    const coveragePayload = await callToolJson(
      client,
      "ghostcrab_coverage",
      {
        domain: "ghostcrab-product"
      },
      "ghostcrab_coverage"
    );

    assertToolSuccess(coveragePayload, "ghostcrab_coverage");
    assert.equal(coveragePayload.coverage_score > 0, true);
    assert.equal(coveragePayload.coverage_score <= 1, true);
    assert.equal(coveragePayload.covered_nodes >= 1, true);
    assert.equal(coveragePayload.total_nodes >= coveragePayload.covered_nodes, true);
    assert.equal(coveragePayload.can_proceed_autonomously, false);
    assert.equal(coveragePayload.recommended_action, "proceed_with_disclosure");
    assert.equal(Array.isArray(coveragePayload.gap_nodes), true);
    assert.equal(
      coveragePayload.gap_nodes.some(
        ({ id }) =>
          typeof id === "string" && id.startsWith("concept:ghostcrab:")
      ),
      true
    );

    const blocksTraversePayload = await callToolJson(
      client,
      "ghostcrab_traverse",
      {
        start: "component:ghostcrab:native-extension-build",
        direction: "outbound",
        edge_labels: ["BLOCKS"],
        depth: 2
      },
      "ghostcrab_traverse(BLOCKS)"
    );

    assertToolSuccess(blocksTraversePayload, "ghostcrab_traverse");
    assertPathContainsNode(
      blocksTraversePayload,
      "distribution:ghostcrab:compose-mcp-service",
      "Expected BLOCKS traversal to expose the compose distribution blocker."
    );

    const gapTraversePayload = await callToolJson(
      client,
      "ghostcrab_traverse",
      {
        start: "task:ghostcrab:native-toolchain-pinning",
        direction: "outbound",
        edge_labels: ["HAS_GAP"],
        depth: 2
      },
      "ghostcrab_traverse(HAS_GAP)"
    );

    assertToolSuccess(gapTraversePayload, "ghostcrab_traverse");
    assertPathContainsNode(
      gapTraversePayload,
      "concept:ghostcrab:native-compatibility",
      "Expected HAS_GAP traversal to expose the missing native compatibility concept."
    );

    const statusPayload = await callToolJson(
      client,
      "ghostcrab_status",
      {},
      "ghostcrab_status"
    );

    assertToolSuccess(statusPayload, "ghostcrab_status");
    assert.equal(
      ["GREEN", "YELLOW"].includes(statusPayload.operational.health),
      true
    );
    assert.equal(
      statusPayload.next_actions.includes("resolve_constraints_first"),
      true
    );
    assert.equal(statusPayload.runtime.embeddings.mode, "disabled");

    console.error(
      `[ghostcrab-smoke] Connected successfully. Registered tools: ${toolNames.length}`
    );
  },
  {
    serverEnv: {
      GHOSTCRAB_EMBEDDINGS_MODE: "disabled"
    }
  }
);
