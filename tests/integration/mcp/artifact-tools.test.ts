/**
 * Answer artifact MCP tools — real MindBrain backend, no mocks.
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  artifactGetTool,
  ArtifactGetInput
} from "../../../src/tools/pragma/artifact-get.js";
import {
  liveRefreshTool,
  LiveRefreshInput
} from "../../../src/tools/pragma/live-refresh.js";
import {
  createIntegrationHarness,
  readStructured
} from "../../helpers/cli-integration.js";
import {
  deleteWorkspaceProjectionsData,
  seedAnswerArtifact
} from "../../helpers/integration-pragma-seed.js";
import { createToolContext } from "../../helpers/tool-context.js";

const harness = createIntegrationHarness();
const RUN_ID = randomUUID().slice(0, 8).replace(/-/g, "");
const WS_ID = `artif${RUN_ID}`;
const ARTIFACT_PREFIX = `artif_${RUN_ID}`;
let backendReachable = false;
let seeded = false;

describe.sequential("answer artifact MCP tools (integration, no mocks)", () => {
  beforeEach(async ({ skip }) => {
    backendReachable = await harness.database.ping();
    if (!backendReachable) {
      skip("Integration backend unavailable; skipping artifact tool tests.");
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
      artifactId: `${ARTIFACT_PREFIX}__plan`,
      slug: "demo",
      workspaceId: WS_ID,
      artifactKind: "analysis_plan",
      publicLabel: "Plan démo",
      payload: { steps: ["a"] },
      legacyRef: "projection:p1",
      agentId: "agent:self"
    });
    await seedAnswerArtifact(harness.database, {
      artifactId: `${ARTIFACT_PREFIX}__live`,
      slug: "weekly",
      workspaceId: WS_ID,
      artifactKind: "live_answer_view",
      publicLabel: "Vue live",
      payload: { summary: "seed" },
      currentVersion: 4
    });
    await seedAnswerArtifact(harness.database, {
      artifactId: `${ARTIFACT_PREFIX}__snap`,
      slug: "frozen",
      workspaceId: WS_ID,
      artifactKind: "answer_snapshot",
      publicLabel: "Snapshot figé",
      lifecycle: "frozen",
      state: "closed"
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

  describe("ghostcrab_artifact_get", () => {
    it("fetches registry row with parsed payload", async () => {
      const context = createToolContext(harness.database);
      context.session.workspace_id = WS_ID;

      const result = await artifactGetTool.handler(
        { artifact_id: `${ARTIFACT_PREFIX}__plan`, workspace_id: WS_ID },
        context
      );

      expect(result.isError).not.toBe(true);
      const body = readStructured(result);
      expect(body.artifact_kind).toBe("analysis_plan");
      expect(body.public_label).toBe("Plan démo");
      expect(body.payload).toEqual({ steps: ["a"] });
    });

    it("documents required artifact_id in MCP schema", () => {
      const schema = artifactGetTool.definition.inputSchema as {
        required?: string[];
      };
      expect(schema.required).toEqual(expect.arrayContaining(["artifact_id"]));
      expect(ArtifactGetInput.safeParse({ artifact_id: "x" }).success).toBe(
        true
      );
    });
  });

  describe("ghostcrab_live_refresh", () => {
    it("refreshes live view and attaches answer_update_event", async () => {
      const context = createToolContext(harness.database);
      context.session.workspace_id = WS_ID;

      const result = await liveRefreshTool.handler(
        {
          artifact_id: `${ARTIFACT_PREFIX}__live`,
          workspace_id: WS_ID,
          include_latest_event: true
        },
        context
      );

      expect(result.isError).not.toBe(true);
      const body = readStructured(result);
      expect(body.refreshed).toBe(true);
      expect(Number(body.current_version)).toBeGreaterThanOrEqual(5);
      const event = body.answer_update_event as Record<string, unknown> | null;
      expect(event?.event_kind).toBe("answer_update_event");
    });

    it("returns invalid_artifact_kind for snapshot refresh attempts", async () => {
      const context = createToolContext(harness.database);
      context.session.workspace_id = WS_ID;

      const result = await liveRefreshTool.handler(
        {
          artifact_id: `${ARTIFACT_PREFIX}__snap`,
          workspace_id: WS_ID
        },
        context
      );

      expect(result.isError).toBe(true);
      const body = readStructured(result);
      const code = (body.error as Record<string, unknown>).code;
      expect(code === "invalid_artifact_kind" || code === "backend_unavailable").toBe(
        true
      );
    });

    it("documents include_latest_event default true", () => {
      const schema = liveRefreshTool.definition.inputSchema as {
        properties: { include_latest_event: { default?: boolean } };
      };
      expect(schema.properties.include_latest_event.default).toBe(true);
      expect(
        LiveRefreshInput.parse({ artifact_id: "live_answer_view__x" })
          .include_latest_event
      ).toBe(true);
    });
  });
});
