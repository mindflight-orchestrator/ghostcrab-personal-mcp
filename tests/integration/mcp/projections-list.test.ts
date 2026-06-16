/**
 * ghostcrab_projections_list — real MindBrain backend, no mocks.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  projectionsListTool,
  ProjectionsListInput
} from "../../../src/tools/pragma/projections-list.js";
import {
  createIntegrationHarness,
  readStructured
} from "../../helpers/cli-integration.js";
import {
  deleteWorkspaceProjectionsData,
  seedAnswerArtifact,
  seedGraphProjectionResult
} from "../../helpers/integration-pragma-seed.js";
import { createToolContext } from "../../helpers/tool-context.js";

const harness = createIntegrationHarness();
const RUN_ID = randomUUID().slice(0, 8).replace(/-/g, "");
const WS_ID = `projlist${RUN_ID}`;
const ARTIFACT_PREFIX = `projlist_${RUN_ID}`;

describe.sequential("ghostcrab_projections_list (integration, no mocks)", () => {
  const graphProjectionId = `proj_graph_${RUN_ID}`;
  const registryLegacyProjectionId = `p_legacy_${RUN_ID}`;
  let backendReachable = false;
  let seeded = false;

  beforeEach(async ({ skip }) => {
    backendReachable = await harness.database.ping();
    if (!backendReachable) {
      skip("Integration backend unavailable; skipping projections-list tests.");
      return;
    }

    if (seeded) {
      return;
    }

    await deleteWorkspaceProjectionsData(
      harness.database,
      WS_ID,
      ARTIFACT_PREFIX
    );
    await seedAnswerArtifact(harness.database, {
      artifactId: `${ARTIFACT_PREFIX}__live`,
      slug: "weekly",
      workspaceId: WS_ID,
      artifactKind: "live_answer_view",
      publicLabel: "Pilotage hebdo"
    });
    await seedAnswerArtifact(harness.database, {
      artifactId: `${ARTIFACT_PREFIX}__plan`,
      slug: "copropriete_360",
      workspaceId: WS_ID,
      artifactKind: "analysis_plan",
      publicLabel: "Plan chantier",
      legacyRef: `projection:${registryLegacyProjectionId}`,
      agentId: "agent:self",
      scope: `${WS_ID}:production:copropriete_360`
    });
    await seedGraphProjectionResult(harness.database, {
      workspaceId: WS_ID,
      projectionId: graphProjectionId,
      collectionId: `${WS_ID}::docs`,
      label: "Keyword opportunities"
    });

    seeded = true;
  });

  afterAll(async () => {
    if (!backendReachable) {
      return;
    }

    await deleteWorkspaceProjectionsData(
      harness.database,
      WS_ID,
      ARTIFACT_PREFIX
    );
  });

  it("executes graph_entity SQL with metadata_json collection_id", async () => {
    const rows = await harness.database.query<{
      projection_id: string;
      name: string;
      collection_id: string | null;
    }>(
      `
        SELECT DISTINCT
          json_extract(ge.metadata_json, '$.projection_id') AS projection_id,
          ge.name,
          json_extract(ge.metadata_json, '$.collection_id') AS collection_id
        FROM graph_entity ge
        WHERE ge.workspace_id = $1
          AND ge.entity_type = 'ProjectionResult'
          AND json_extract(ge.metadata_json, '$.projection_id') IS NOT NULL
          AND trim(json_extract(ge.metadata_json, '$.projection_id')) != ''
        ORDER BY projection_id
        LIMIT $2
      `,
      [WS_ID, 10]
    );

    expect(rows.some((row) => row.projection_id === graphProjectionId)).toBe(
      true
    );
    expect(
      rows.find((row) => row.projection_id === graphProjectionId)?.collection_id
    ).toBe(`${WS_ID}::docs`);
  });

  it("lists registry rows and graph projection ids with routing hints", async () => {
    const context = createToolContext(harness.database);
    context.session.workspace_id = WS_ID;

    const result = await projectionsListTool.handler(
      { workspace_id: WS_ID },
      context
    );

    expect(result.isError).not.toBe(true);
    const body = readStructured(result);
    expect(body.count).toBe(3);

    const projections = body.projections as Array<Record<string, unknown>>;
    const live = projections.find((row) => row.artifact_kind === "live_answer_view");
    const plan = projections.find((row) => row.artifact_kind === "analysis_plan");
    const graph = projections.find((row) => row.source === "graph");
    expect(live?.suggested_tools).toEqual([
      "ghostcrab_artifact_get",
      "ghostcrab_live_refresh"
    ]);
    expect(plan?.projection_id).toBe(registryLegacyProjectionId);
    expect(graph?.projection_id).toBe(graphProjectionId);
    expect(graph?.suggested_tools).toEqual(["ghostcrab_projection_get"]);
  });

  it("returns missing_workspace when session and input omit workspace_id", async () => {
    const context = createToolContext(harness.database);
    context.session.workspace_id = null;

    const result = await projectionsListTool.handler({}, context);
    expect(result.isError).toBe(true);
    const body = readStructured(result);
    expect((body.error as Record<string, unknown>).code).toBe("missing_workspace");
  });

  it("skips graph scan when include_graph is false", async () => {
    const context = createToolContext(harness.database);
    context.session.workspace_id = WS_ID;

    const result = await projectionsListTool.handler(
      { workspace_id: WS_ID, include_graph: false },
      context
    );

    const body = readStructured(result);
    expect(body.count).toBe(2);
    const projections = body.projections as Array<Record<string, unknown>>;
    expect(projections.every((row) => row.source === "registry")).toBe(true);
  });

  it("documents optional filters and include_graph default", () => {
    const schema = projectionsListTool.definition.inputSchema as {
      properties: {
        include_graph: { default?: boolean };
        kind: { enum?: string[] };
      };
    };
    expect(schema.properties.include_graph.default).toBe(true);
    expect(schema.properties.kind.enum).toEqual(
      expect.arrayContaining(["analysis_plan", "graph"])
    );
    expect(
      ProjectionsListInput.parse({ workspace_id: WS_ID, kind: "graph" }).kind
    ).toBe("graph");
  });
});
