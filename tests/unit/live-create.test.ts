import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import {
  GHOSTCRAB_ARTIFACT_CREATE_BLOCKER,
  LiveCreateInput,
  liveCreateTool
} from "../../src/tools/pragma/live-create.js";
import { createToolContext } from "../helpers/tool-context.js";

const database = {} as DatabaseClient;

function artifactBody(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    created: true,
    idempotent: false,
    artifact_id: "live_answer_view__weekly_status",
    slug: "weekly_status",
    workspace_id: "default",
    agent_id: null,
    scope: "default",
    artifact_kind: "live_answer_view",
    public_label: "Weekly status",
    lifecycle: "stale",
    state: "dirty",
    current_version: 1,
    payload_json: '{"question":"What changed?"}',
    legacy_ref: null,
    ...overrides
  };
}

describe("ghostcrab_live_create", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("documents required creation inputs and validates reserved data", () => {
    const schema = liveCreateTool.definition.inputSchema as {
      required?: string[];
      properties: {
        workspace_id: unknown;
        definition: Record<string, unknown>;
      };
    };
    expect(schema.required).toEqual(["slug", "public_label", "definition"]);
    expect(schema.properties.workspace_id).toBeDefined();
    expect(schema.properties.definition.minProperties).toBe(1);
    expect(
      LiveCreateInput.safeParse({
        slug: "weekly_status",
        public_label: "Weekly status",
        definition: { question: "What changed?" }
      }).success
    ).toBe(true);
    expect(
      LiveCreateInput.safeParse({
        slug: "Weekly Status",
        public_label: "Weekly status",
        definition: { question: "x" }
      }).success
    ).toBe(false);
    expect(
      LiveCreateInput.safeParse({
        slug: "weekly_status",
        public_label: "Weekly status",
        definition: { materialized: {} }
      }).success
    ).toBe(false);
  });

  it.each([
    [true, false, 201],
    [false, true, 200]
  ])(
    "uses active workspace and returns created=%s idempotent=%s",
    async (created, idempotent, status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              kind: "mindbrain_capabilities",
              features: { live_answer_view_create: true }
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(artifactBody({ created, idempotent })), {
            status
          })
        );
      vi.stubGlobal("fetch", fetchMock);
      const context = createToolContext(database);
      context.session.workspace_id = "default";

      const result = await liveCreateTool.handler(
        {
          slug: "weekly_status",
          public_label: "Weekly status",
          definition: { question: "What changed?" }
        },
        context
      );
      const body = result.structuredContent as Record<string, unknown>;
      expect(result.isError).not.toBe(true);
      expect(body).toMatchObject({
        workspace_id: "default",
        created,
        idempotent
      });
      const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
      expect(JSON.parse(String(request.body)).workspace_id).toBe("default");
    }
  );

  it("honors an explicit workspace override", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            kind: "mindbrain_capabilities",
            features: { live_answer_view_create: true }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(artifactBody({ workspace_id: "ws_override" })),
          { status: 201 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await liveCreateTool.handler(
      {
        workspace_id: "ws_override",
        slug: "weekly_status",
        public_label: "Weekly status",
        definition: { question: "What changed?" }
      },
      createToolContext(database)
    );
    expect(result.structuredContent).toMatchObject({
      workspace_id: "ws_override"
    });
  });

  it("blocks before POST when the documented capability is absent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ kind: "mindbrain_capabilities", features: {} }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await liveCreateTool.handler(
      {
        slug: "weekly_status",
        public_label: "Weekly status",
        definition: { question: "What changed?" }
      },
      createToolContext(database)
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        code: GHOSTCRAB_ARTIFACT_CREATE_BLOCKER,
        message: GHOSTCRAB_ARTIFACT_CREATE_BLOCKER
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires a concrete effective workspace even if session state is malformed", async () => {
    const context = createToolContext(database);
    context.session.workspace_id = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await liveCreateTool.handler(
      {
        slug: "weekly_status",
        public_label: "Weekly status",
        definition: { question: "What changed?" }
      },
      context
    );
    expect(result.structuredContent).toMatchObject({
      error: { code: "workspace_context_required" }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps backend identity conflicts without retry or rename", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            kind: "mindbrain_capabilities",
            features: { live_answer_view_create: true }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "artifact_conflict", message: "conflict" }
          }),
          { status: 409, statusText: "Conflict" }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await liveCreateTool.handler(
      {
        slug: "weekly_status",
        public_label: "Different",
        definition: { question: "Different" }
      },
      createToolContext(database)
    );
    expect(result.structuredContent).toMatchObject({
      error: { code: "artifact_conflict" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
