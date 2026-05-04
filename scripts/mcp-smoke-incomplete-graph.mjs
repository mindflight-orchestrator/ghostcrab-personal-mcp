import assert from "node:assert/strict";

import {
  assertToolSuccess,
  assertPathContainsNode,
  callToolJson,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

await withSmokeClient(
  "ghostcrab-smoke-incomplete-graph-client",
  async ({ client }) => {
    const coveragePayload = await callToolJson(
      client,
      "ghostcrab_coverage",
      {
        domain: "ghostcrab-product"
      },
      "ghostcrab_coverage(ghostcrab-product)"
    );

    assertToolSuccess(coveragePayload, "ghostcrab_coverage");
    assert.equal(coveragePayload.covered_nodes >= 1, true);
    assert.equal(coveragePayload.total_nodes >= coveragePayload.covered_nodes, true);
    assert.equal(coveragePayload.can_proceed_autonomously, false);
    assert.equal(coveragePayload.recommended_action, "proceed_with_disclosure");
    assert.equal(
      coveragePayload.gap_nodes.some(
        (node) =>
          node.id === "concept:ghostcrab:native-compatibility" &&
          node.criticality === "high"
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

    console.error(
      "[ghostcrab-smoke] Incomplete graph scenario validated: proceed_with_disclosure + explicit native compatibility gap."
    );
  }
);
