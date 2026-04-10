import assert from "node:assert/strict";

import {
  assertToolSuccess,
  callToolJson,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

await withSmokeClient(
  "ghostcrab-smoke-long-running-client",
  async ({ client }) => {
    const environmentPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "",
        schema_id: "ghostcrab:environment-context",
        filters: {
          scope: "project:apollo-rollout",
          environment: "acme-eu-staging"
        },
        limit: 5
      },
      "ghostcrab_search(environment-context)"
    );

    assertToolSuccess(environmentPayload, "ghostcrab_search");
    assert.equal(environmentPayload.returned >= 1, true);

    const integrationPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "",
        schema_id: "ghostcrab:integration-endpoint",
        filters: {
          scope: "project:apollo-rollout"
        },
        limit: 10
      },
      "ghostcrab_search(integration-endpoint)"
    );

    assertToolSuccess(integrationPayload, "ghostcrab_search");
    assert.equal(integrationPayload.returned >= 2, true);
    assert.equal(
      integrationPayload.results.some(
        (row) => row.facets.record_id === "integration:apollo:erp-postgres"
      ),
      true
    );

    const taskCountPayload = await callToolJson(
      client,
      "ghostcrab_count",
      {
        schema_id: "ghostcrab:task",
        filters: {
          scope: "project:apollo-rollout"
        },
        group_by: ["status", "phase", "environment"]
      },
      "ghostcrab_count(apollo tasks)"
    );

    assertToolSuccess(taskCountPayload, "ghostcrab_count");
    assert.equal(taskCountPayload.counts.status.blocked >= 1, true);
    assert.equal(taskCountPayload.counts.status.in_progress >= 1, true);
    assert.equal(taskCountPayload.counts.phase["phase-2"] >= 2, true);
    assert.equal(
      taskCountPayload.counts.environment["acme-eu-staging"] >= 2,
      true
    );

    const constraintPayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "",
        schema_id: "ghostcrab:constraint",
        filters: {
          scope: "project:apollo-rollout",
          environment: "acme-eu-staging"
        },
        limit: 10
      },
      "ghostcrab_search(apollo constraints)"
    );

    assertToolSuccess(constraintPayload, "ghostcrab_search");
    assert.equal(constraintPayload.returned >= 1, true);

    const sourcePayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "",
        schema_id: "ghostcrab:source",
        filters: {
          scope: "project:apollo-rollout"
        },
        limit: 10
      },
      "ghostcrab_search(apollo sources)"
    );

    assertToolSuccess(sourcePayload, "ghostcrab_search");
    assert.equal(sourcePayload.returned >= 2, true);

    const notePayload = await callToolJson(
      client,
      "ghostcrab_search",
      {
        query: "",
        schema_id: "ghostcrab:note",
        filters: {
          scope: "project:apollo-rollout",
          note_kind: "recovery-brief"
        },
        limit: 5
      },
      "ghostcrab_search(apollo notes)"
    );

    assertToolSuccess(notePayload, "ghostcrab_search");
    assert.equal(notePayload.returned >= 1, true);
    assert.equal(
      notePayload.results[0].content.includes("phase-2 integration hardening"),
      true
    );

    console.error(
      "[ghostcrab-smoke] Long-running recovery scenario validated: environment + integration endpoints + tasks + constraints + sources + notes."
    );
  },
  {
    serverEnv: {
      GHOSTCRAB_EMBEDDINGS_MODE: "disabled"
    }
  }
);
