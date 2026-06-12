/**
 * ghostcrab_projection_get — real MindBrain backend, no mocks.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  projectionGetTool,
  ProjectionGetInput
} from "../../../src/tools/pragma/projection-get.js";
import {
  createIntegrationHarness,
  readStructured
} from "../../helpers/cli-integration.js";
import {
  deleteWorkspaceProjectionsData,
  seedGraphEntity,
  seedGraphProjectionResult,
  seedGraphRelation
} from "../../helpers/integration-pragma-seed.js";
import { createToolContext } from "../../helpers/tool-context.js";

const harness = createIntegrationHarness();
const RUN_ID = randomUUID().slice(0, 8).replace(/-/g, "");
const WS_ID = `projget${RUN_ID}`;
const COLLECTION_ID = `${WS_ID}::docs`;
const PROJECTION_ID = `proj_keyword_${RUN_ID}`;

describe.sequential("ghostcrab_projection_get (integration, no mocks)", () => {
  beforeAll(async () => {
    await deleteWorkspaceProjectionsData(harness.database, WS_ID);

    const projectionEntityId = await seedGraphProjectionResult(
      harness.database,
      {
        workspaceId: WS_ID,
        projectionId: PROJECTION_ID,
        collectionId: COLLECTION_ID,
        label: "keyword opportunity set"
      }
    );

    const evidenceEntityId = await seedGraphEntity(harness.database, {
      workspaceId: WS_ID,
      entityType: "Evidence",
      name: "query export",
      metadata: { external_id: "evidence-1" },
      confidence: 0.9
    });

    await seedGraphRelation(harness.database, {
      workspaceId: WS_ID,
      relationType: "PROVEN_BY",
      sourceId: projectionEntityId,
      targetId: evidenceEntityId,
      metadata: { source: "import" }
    });

    await seedGraphEntity(harness.database, {
      workspaceId: WS_ID,
      entityType: "DeltaFinding",
      name: "keyword gap",
      metadata: {
        metric: PROJECTION_ID,
        collection_id: COLLECTION_ID,
        external_id: "delta-1"
      },
      confidence: 0.8
    });
  });

  afterAll(async () => {
    await deleteWorkspaceProjectionsData(harness.database, WS_ID);
  });

  it("reads materialized graph projections through the MindBrain endpoint", async () => {
    const context = createToolContext(harness.database);
    context.session.workspace_id = WS_ID;

    const result = await projectionGetTool.handler(
      {
        workspace_id: WS_ID,
        collection_id: COLLECTION_ID,
        projection_id: PROJECTION_ID,
        include_evidence: true,
        include_deltas: true
      },
      context
    );

    expect(result.isError).not.toBe(true);
    const structured = readStructured(result);
    expect(structured).toMatchObject({
      ok: true,
      tool: "ghostcrab_projection_get",
      backend: "native",
      artifact_kind: "answer_snapshot",
      legacy_kind: "projection_type_b",
      lifecycle: "frozen",
      is_terminal_answer: true,
      report: {
        collection_id: COLLECTION_ID,
        projection_result_count: 1,
        linked_evidence_count: 1,
        delta_count: 1,
        has_projection: true
      }
    });

    const projectionResults = structured.projection_results as Array<
      Record<string, unknown>
    >;
    expect(projectionResults[0]).toMatchObject({
      entity_type: "ProjectionResult",
      metadata: expect.objectContaining({
        projection_id: PROJECTION_ID
      })
    });

    const linkedEvidence = structured.linked_evidence as Array<
      Record<string, unknown>
    >;
    expect(linkedEvidence[0]).toMatchObject({
      relation: expect.objectContaining({ relation_type: "PROVEN_BY" }),
      evidence: expect.objectContaining({ name: "query export" })
    });
  });

  it("requires a projection_id", () => {
    expect(ProjectionGetInput.safeParse({ projection_id: "" }).success).toBe(
      false
    );
    expect(
      ProjectionGetInput.safeParse({
        collection_id: "seo",
        projection_id: PROJECTION_ID
      }).success
    ).toBe(true);
  });
});
