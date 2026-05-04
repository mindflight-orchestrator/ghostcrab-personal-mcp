import assert from "node:assert/strict";

import {
  assertToolSuccess,
  callToolJson,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

await withSmokeClient(
  "ghostcrab-smoke-memory-workflow-client",
  async ({ client }) => {
    const rememberPayload = await callToolJson(
      client,
      "ghostcrab_remember",
      {
        content:
          "Phase 4 workflow note: package readiness should always be checked with verify:e2e before distribution-facing changes.",
        facets: {
          domain: "workflow-memory",
          type: "note",
          stream: "phase-4"
        },
        schema_id: "agent:observation",
        created_by: "smoke:memory-workflow"
      },
      "ghostcrab_remember(workflow-memory)"
    );

    assertToolSuccess(rememberPayload, "ghostcrab_remember");
    assert.equal(rememberPayload.stored, true);

    const searchPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "package readiness verify e2e",
        filters: {
          domain: "workflow-memory"
        },
        limit: 5
      },
      "ghostcrab_search(workflow-memory)"
    );

    assertToolSuccess(searchPayload, "ghostcrab_search");
    assert.equal(searchPayload.returned >= 1, true);
    assert.equal(
      searchPayload.results.some((row) => row.content.includes("verify:e2e")),
      true
    );

    const countPayload = await callToolJson(
      client,
      "ghostcrab_count",
      {
        group_by: ["domain", "type"],
        filters: {
          domain: "workflow-memory"
        }
      },
      "ghostcrab_count(workflow-memory)"
    );

    assertToolSuccess(countPayload, "ghostcrab_count");
    assert.equal(countPayload.counts.domain["workflow-memory"] >= 1, true);
    assert.equal(countPayload.counts.type.note >= 1, true);

    const packPayload = await callToolJson(
      client,
      "ghostcrab_pack",
      {
        query: "native extension build package distribution",
        agent_id: "agent:self",
        scope: "native-build"
      },
      "ghostcrab_pack(workflow-memory)"
    );

    assertToolSuccess(packPayload, "ghostcrab_pack");
    assert.equal(packPayload.has_blocking_constraint, true);
    assert.equal(
      packPayload.recommended_next_step,
      "resolve_constraints_first"
    );
    assert.equal(packPayload.pack_text.includes("CONSTRAINT[blocking]"), true);
    assert.equal(
      packPayload.pack.some((row) => row.proj_type === "CONSTRAINT"),
      true
    );

    const statusPayload = await callToolJson(
      client,
      "ghostcrab_status",
      {
        agent_id: "agent:self"
      },
      "ghostcrab_status(workflow-memory)"
    );

    assertToolSuccess(statusPayload, "ghostcrab_status");
    assert.equal(statusPayload.summary.health, "YELLOW");
    assert.equal(
      statusPayload.next_actions.includes("resolve_constraints_first"),
      true
    );
    assert.equal(
      statusPayload.next_actions.includes("escalate_to_human"),
      true
    );

    console.error(
      "[ghostcrab-smoke] Memory workflow scenario validated: remember -> search -> count -> pack -> status."
    );
  }
);
