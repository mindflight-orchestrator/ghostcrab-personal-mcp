import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANSWER_ARTIFACT_KINDS,
  assertAnswerArtifactKind,
  buildListAnswerArtifactsQuery,
  mapAnswerArtifactListRows,
  runGetAnswerArtifact,
  runListAnswerArtifacts
} from "../../src/db/answer-artifacts.js";

describe("answer-artifacts TS client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("buildListAnswerArtifactsQuery", () => {
    it("matches CLI SQL shape for combined filters", () => {
      const { sql, params } = buildListAnswerArtifactsQuery({
        workspaceId: "ws_a",
        kind: "evidence_pack",
        limit: 5
      });
      expect(sql).toContain("artifact_kind = ?");
      expect(sql).toContain("LIMIT 5");
      expect(params).toEqual(["ws_a", "evidence_pack"]);
    });
  });

  describe("mapAnswerArtifactListRows", () => {
    it("validates all mapped kinds", () => {
      const columns = [
        "artifact_id",
        "slug",
        "workspace_id",
        "agent_id",
        "scope",
        "artifact_kind",
        "public_label",
        "lifecycle",
        "state",
        "current_version",
        "legacy_ref"
      ];
      for (const kind of ANSWER_ARTIFACT_KINDS) {
        const [row] = mapAnswerArtifactListRows(columns, [
          ["id", "slug", "ws", null, null, kind, "label", "active", "open", 1, null]
        ]);
        expect(row.artifact_kind).toBe(kind);
      }
    });

    it("rejects answer_update_event as artifact_kind", () => {
      expect(() =>
        mapAnswerArtifactListRows(
          [
            "artifact_id",
            "slug",
            "workspace_id",
            "agent_id",
            "scope",
            "artifact_kind",
            "public_label",
            "lifecycle",
            "state",
            "current_version",
            "legacy_ref"
          ],
          [["id", "s", null, null, null, "answer_update_event", "x", "a", "b", 1, null]]
        )
      ).toThrow(/Invalid artifact_kind/);
    });
  });

  describe("assertAnswerArtifactKind", () => {
    it("documents the closed registry set", () => {
      expect(ANSWER_ARTIFACT_KINDS).toEqual([
        "analysis_plan",
        "live_answer_view",
        "answer_snapshot",
        "evidence_pack"
      ]);
      expect(() => assertAnswerArtifactKind("graph_gap_rule")).toThrow();
    });
  });

  describe("runListAnswerArtifacts", () => {
    it("posts SQL to MindBrain and maps rows", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL, init?: RequestInit) => {
          expect(url.pathname).toBe("/api/mindbrain/sql");
          expect(init?.method).toBe("POST");
          const body = JSON.parse(String(init?.body));
          expect(body.sql).toContain("mindbrain_answer_artifacts");
          expect(body.params).toEqual(["ws_demo", "analysis_plan"]);
          return new Response(
            JSON.stringify({
              ok: true,
              columns: [
                "artifact_id",
                "slug",
                "workspace_id",
                "agent_id",
                "scope",
                "artifact_kind",
                "public_label",
                "lifecycle",
                "state",
                "current_version",
                "legacy_ref"
              ],
              rows: [
                [
                  "analysis_plan__demo",
                  "demo",
                  "ws_demo",
                  "agent:self",
                  "ws_demo",
                  "analysis_plan",
                  "Demo plan",
                  "active",
                  "open",
                  1,
                  "projection:p1"
                ]
              ],
              changes: 0
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        })
      );

      const rows = await runListAnswerArtifacts({
        mindbrainUrl: "http://127.0.0.1:8091",
        workspaceId: "ws_demo",
        kind: "analysis_plan"
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.artifact_kind).toBe("analysis_plan");
      expect(rows[0]?.legacy_ref).toBe("projection:p1");
    });
  });

  describe("runGetAnswerArtifact", () => {
    it("fetches artifact via HTTP and validates kind", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: URL) => {
          expect(url.pathname).toBe(
            "/api/mindbrain/ghostcrab/artifact/answer_snapshot__demo"
          );
          return new Response(
            JSON.stringify({
              artifact_id: "answer_snapshot__demo",
              slug: "demo",
              workspace_id: "ws_demo",
              agent_id: null,
              scope: null,
              artifact_kind: "answer_snapshot",
              public_label: "Instantané demo",
              lifecycle: "frozen",
              state: "closed",
              current_version: 1,
              payload_json: "{}",
              legacy_ref: "projection_result:42"
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        })
      );

      const row = await runGetAnswerArtifact({
        mindbrainUrl: "http://127.0.0.1:8091",
        artifactId: "answer_snapshot__demo"
      });

      expect(row.artifact_kind).toBe("answer_snapshot");
      expect(row.public_label).toBe("Instantané demo");
    });

    it("rejects invalid artifact_kind in HTTP response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              artifact_id: "bad",
              slug: "bad",
              workspace_id: "ws_demo",
              agent_id: null,
              scope: null,
              artifact_kind: "graph_data_gap",
              public_label: "nope",
              lifecycle: "active",
              state: "open",
              current_version: 1,
              payload_json: "{}",
              legacy_ref: null
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      );

      await expect(
        runGetAnswerArtifact({
          mindbrainUrl: "http://127.0.0.1:8091",
          artifactId: "bad"
        })
      ).rejects.toThrow(/Invalid artifact_kind/);
    });
  });
});
