import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runListAnswerArtifactEvents,
  runRefreshLiveAnswerView
} from "../../src/db/answer-artifacts.js";

describe("answer-artifacts refresh and events client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("runListAnswerArtifactEvents", () => {
    it("maps backend rows field to normalized events", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL) => {
          expect(url.pathname).toBe(
            "/api/mindbrain/ghostcrab/artifact/live_answer_view__demo/events"
          );
          expect(url.searchParams.get("limit")).toBe("3");
          return new Response(
            JSON.stringify({
              artifact_id: "live_answer_view__demo",
              event_kind: "answer_update_event",
              rows: [
                {
                  event_id: "evt_2",
                  artifact_id: "live_answer_view__demo",
                  event_kind: "answer_update_event",
                  from_version: 1,
                  to_version: 2,
                  signal_json: '{"stale":false}',
                  created_at_unix: 200
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        })
      );

      const response = await runListAnswerArtifactEvents({
        mindbrainUrl: "http://127.0.0.1:8091",
        artifactId: "live_answer_view__demo",
        limit: 3
      });

      expect(response.event_kind).toBe("answer_update_event");
      expect(response.events).toHaveLength(1);
      expect(response.events[0]?.to_version).toBe(2);
    });
  });

  describe("runRefreshLiveAnswerView", () => {
    it("bumps current_version and returns latest answer_update_event", async () => {
      let refreshVersion = 1;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL, init?: RequestInit) => {
          if (url.pathname.endsWith("/artifact/live_answer_view__demo")) {
            return new Response(
              JSON.stringify({
                artifact_id: "live_answer_view__demo",
                artifact_kind: "live_answer_view",
                slug: "live",
                workspace_id: "ws_demo",
                agent_id: null,
                scope: null,
                public_label: "Live",
                lifecycle: "open",
                state: "open",
                current_version: 1,
                payload_json: "{}",
                legacy_ref: null
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          if (url.pathname.endsWith("/refresh")) {
            expect(init?.method).toBe("POST");
            refreshVersion += 1;
            return new Response(
              JSON.stringify({
                ok: true,
                artifact_id: "live_answer_view__demo",
                artifact_kind: "live_answer_view",
                current_version: refreshVersion,
                state: "open"
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }

          expect(url.pathname.endsWith("/events")).toBe(true);
          return new Response(
            JSON.stringify({
              artifact_id: "live_answer_view__demo",
              event_kind: "answer_update_event",
              rows: [
                {
                  event_id: "evt_latest",
                  artifact_id: "live_answer_view__demo",
                  event_kind: "answer_update_event",
                  from_version: refreshVersion - 1,
                  to_version: refreshVersion,
                  signal_json: "{}",
                  created_at_unix: 300
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        })
      );

      const result = await runRefreshLiveAnswerView({
        mindbrainUrl: "http://127.0.0.1:8091",
        artifactId: "live_answer_view__demo"
      });

      expect(result.artifact.current_version).toBe(2);
      expect(result.answer_update_event?.event_kind).toBe(
        "answer_update_event"
      );
      expect(result.answer_update_event?.to_version).toBe(2);
    });

    it("rejects refresh on non-live artifacts", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                artifact_id: "answer_snapshot__demo",
                artifact_kind: "answer_snapshot",
                slug: "snap",
                workspace_id: "ws_demo",
                agent_id: null,
                scope: null,
                public_label: "Snapshot",
                lifecycle: "closed",
                state: "closed",
                current_version: 1,
                payload_json: "{}",
                legacy_ref: null
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
        )
      );

      await expect(
        runRefreshLiveAnswerView({
          mindbrainUrl: "http://127.0.0.1:8091",
          artifactId: "answer_snapshot__demo"
        })
      ).rejects.toThrow(/live answer views/);
    });

    it("skips event fetch when includeLatestEvent is false", async () => {
      const fetchMock = vi.fn(async (url: URL, init?: RequestInit) => {
        if (url.pathname.endsWith("/artifact/live_answer_view__demo")) {
          return new Response(
            JSON.stringify({
              artifact_id: "live_answer_view__demo",
              artifact_kind: "live_answer_view",
              slug: "live",
              workspace_id: "ws_demo",
              agent_id: null,
              scope: null,
              public_label: "Live",
              lifecycle: "open",
              state: "open",
              current_version: 1,
              payload_json: "{}",
              legacy_ref: null
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ok: true,
              artifact_id: "live_answer_view__demo",
              artifact_kind: "live_answer_view",
              current_version: 4,
              state: "open"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error("events should not be fetched");
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await runRefreshLiveAnswerView({
        mindbrainUrl: "http://127.0.0.1:8091",
        artifactId: "live_answer_view__demo",
        includeLatestEvent: false
      });

      expect(result.answer_update_event).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
