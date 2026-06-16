import { describe, expect, it } from "vitest";

import {
  ANSWER_ARTIFACT_KINDS,
  assertAnswerArtifactKind,
  buildListArtifactsQuery,
  buildArtifactGetUrl,
  buildArtifactRefreshUrl,
  buildArtifactEventsUrl,
  buildArtifactMigrateEngineArgs,
  isAnswerArtifactKind,
  mapListArtifactRows,
  normalizeArtifactEventsBody,
  parseArtifactArgs
} from "../../bin/lib/answer-artifact-cli.mjs";

describe("answer-artifact-cli helpers", () => {
  describe("isAnswerArtifactKind / assertAnswerArtifactKind", () => {
    it("accepts the four answer artifact kinds", () => {
      for (const kind of ANSWER_ARTIFACT_KINDS) {
        expect(isAnswerArtifactKind(kind)).toBe(true);
        expect(assertAnswerArtifactKind(kind)).toBe(kind);
      }
    });

    it("rejects gap and report kinds", () => {
      for (const kind of [
        "graph_gap_rule",
        "graph_data_gap",
        "coverage_gap",
        "answerability_gap",
        "mece_gap",
        "answer_update_event",
        "diagnostics_report"
      ]) {
        expect(isAnswerArtifactKind(kind)).toBe(false);
        expect(() => assertAnswerArtifactKind(kind)).toThrow(/Invalid artifact_kind/);
      }
    });

    it("rejects empty and non-string values", () => {
      expect(isAnswerArtifactKind("")).toBe(false);
      expect(isAnswerArtifactKind(null)).toBe(false);
      expect(() => assertAnswerArtifactKind(undefined)).toThrow();
    });
  });

  describe("buildListArtifactsQuery", () => {
    it("builds an unfiltered query with default limit 100", () => {
      const { sql, params } = buildListArtifactsQuery();
      expect(sql).toContain("FROM mindbrain_answer_artifacts");
      expect(sql).toContain("LIMIT 100");
      expect(params).toEqual([]);
    });

    it("adds workspace, kind, agent, and scope filters", () => {
      const { sql, params } = buildListArtifactsQuery({
        workspaceId: "ws_demo",
        kind: "live_answer_view",
        agentId: "agent:self",
        scope: "ws_demo",
        limit: 25
      });
      expect(sql).toContain("workspace_id = ?");
      expect(sql).not.toContain("scope LIKE ?");
      expect(sql).toContain("artifact_kind = ?");
      expect(sql).toContain("agent_id = ?");
      expect(sql).toContain("scope = ?");
      expect(sql).toContain("LIMIT 25");
      expect(params).toEqual([
        "ws_demo",
        "live_answer_view",
        "agent:self",
        "ws_demo"
      ]);
    });

    it("caps limit at 500", () => {
      const { sql } = buildListArtifactsQuery({ limit: 9999 });
      expect(sql).toContain("LIMIT 500");
    });

    it("rejects invalid kind filters", () => {
      expect(() =>
        buildListArtifactsQuery({ kind: "graph_gap_rule" })
      ).toThrow(/Invalid artifact_kind/);
    });
  });

  describe("mapListArtifactRows", () => {
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

    it("maps SQL rows and validates artifact_kind", () => {
      const rows = mapListArtifactRows(columns, [
        [
          "analysis_plan__pilotage",
          "pilotage",
          "ws_demo",
          "agent:self",
          "ws_demo",
          "analysis_plan",
          "Plan pilotage",
          "active",
          "open",
          1,
          "projection:abc"
        ]
      ]);
      expect(rows).toEqual([
        {
          artifact_id: "analysis_plan__pilotage",
          slug: "pilotage",
          workspace_id: "ws_demo",
          agent_id: "agent:self",
          scope: "ws_demo",
          artifact_kind: "analysis_plan",
          public_label: "Plan pilotage",
          lifecycle: "active",
          state: "open",
          current_version: 1,
          legacy_ref: "projection:abc"
        }
      ]);
    });

    it("throws when a row has a non-answer artifact_kind", () => {
      expect(() =>
        mapListArtifactRows(columns, [
          [
            "bad__x",
            "x",
            "ws",
            null,
            null,
            "coverage_gap",
            "label",
            "active",
            "open",
            1,
            null
          ]
        ])
      ).toThrow(/Invalid artifact_kind/);
    });

    it("maps multiple rows preserving order", () => {
      const rows = mapListArtifactRows(columns, [
        [
          "answer_snapshot__r1",
          "r1",
          "ws",
          null,
          null,
          "answer_snapshot",
          "Snap",
          "frozen",
          "closed",
          3,
          "projection_result:1"
        ],
        [
          "live_answer_view__live",
          "live",
          "ws",
          null,
          null,
          "live_answer_view",
          "Live",
          "stale",
          "dirty",
          2,
          null
        ]
      ]);
      expect(rows.map((r) => r.artifact_kind)).toEqual([
        "answer_snapshot",
        "live_answer_view"
      ]);
    });
  });

  describe("parseArtifactArgs", () => {
    it("parses list with filters", () => {
      expect(
        parseArtifactArgs([
          "list",
          "--workspace-id",
          "ws_x",
          "--kind",
          "answer_snapshot",
          "--limit",
          "10"
        ])
      ).toMatchObject({
        subcommand: "list",
        workspaceId: "ws_x",
        kind: "answer_snapshot",
        limit: 10
      });
    });

    it("parses get with artifact id", () => {
      expect(
        parseArtifactArgs(["get", "live_answer_view__weekly", "--url", "http://127.0.0.1:8091"])
      ).toMatchObject({
        subcommand: "get",
        artifactId: "live_answer_view__weekly",
        mindbrainUrl: "http://127.0.0.1:8091"
      });
    });

    it("parses refresh and events with artifact id", () => {
      expect(
        parseArtifactArgs([
          "refresh",
          "live_answer_view__weekly",
          "--url",
          "http://127.0.0.1:8091"
        ])
      ).toMatchObject({
        subcommand: "refresh",
        artifactId: "live_answer_view__weekly",
        mindbrainUrl: "http://127.0.0.1:8091"
      });
      expect(
        parseArtifactArgs([
          "events",
          "live_answer_view__weekly",
          "--limit",
          "5"
        ])
      ).toMatchObject({
        subcommand: "events",
        artifactId: "live_answer_view__weekly",
        limit: 5
      });
    });

    it("parses migrate dry-run and repair modes", () => {
      expect(
        parseArtifactArgs(["migrate", "--dry-run", "--db", "/tmp/x.sqlite", "--force"])
      ).toMatchObject({
        subcommand: "migrate",
        dryRun: true,
        repair: false,
        sqlitePathFromCli: "/tmp/x.sqlite",
        force: true
      });
      expect(
        parseArtifactArgs(["migrate", "--repair", "--db", "/tmp/x.sqlite"])
      ).toMatchObject({
        subcommand: "migrate",
        dryRun: false,
        repair: true
      });
    });

    it("requires exactly one of --dry-run or --repair for migrate", () => {
      expect(parseArtifactArgs(["migrate", "--db", "/tmp/x.sqlite"])).toEqual({
        error:
          "gcp brain artifact migrate: specify exactly one of --dry-run or --repair."
      });
      expect(
        parseArtifactArgs(["migrate", "--dry-run", "--repair", "--db", "/tmp/x.sqlite"])
      ).toEqual({
        error:
          "gcp brain artifact migrate: specify exactly one of --dry-run or --repair."
      });
    });

    it("rejects invalid kind on list", () => {
      expect(parseArtifactArgs(["list", "--kind", "mece_gap"])).toEqual({
        error: expect.stringContaining("Invalid artifact_kind")
      });
    });

    it("rejects unknown subcommands and flags", () => {
      expect(parseArtifactArgs(["freeze"])).toEqual({
        error: 'gcp brain artifact: unknown subcommand "freeze".'
      });
      expect(parseArtifactArgs(["list", "--bogus"])).toEqual({
        error: 'gcp brain artifact: unknown flag "--bogus".'
      });
    });

    it("validates get positional arity", () => {
      expect(parseArtifactArgs(["get"])).toEqual({
        error: "gcp brain artifact get: requires exactly one <artifact_id>."
      });
      expect(parseArtifactArgs(["get", "a", "b"])).toEqual({
        error: "gcp brain artifact get: requires exactly one <artifact_id>."
      });
    });
  });

  describe("buildArtifactMigrateEngineArgs", () => {
    it("builds dry-run native engine args", () => {
      expect(
        buildArtifactMigrateEngineArgs("/data/ghostcrab.sqlite", {
          dryRun: true,
          repair: false
        })
      ).toEqual([
        "artifact-migrate",
        "--db",
        "/data/ghostcrab.sqlite",
        "--dry-run"
      ]);
    });

    it("builds repair native engine args", () => {
      expect(
        buildArtifactMigrateEngineArgs("/data/ghostcrab.sqlite", {
          dryRun: false,
          repair: true
        })
      ).toEqual([
        "artifact-migrate",
        "--db",
        "/data/ghostcrab.sqlite",
        "--repair"
      ]);
    });
  });

  describe("buildArtifactGetUrl", () => {
    it("encodes artifact id in the path", () => {
      const url = buildArtifactGetUrl(
        "http://127.0.0.1:8091",
        "live_answer_view__pilotage/hebdo"
      );
      expect(url.href).toBe(
        "http://127.0.0.1:8091/api/mindbrain/ghostcrab/artifact/live_answer_view__pilotage%2Fhebdo"
      );
    });
  });

  describe("buildArtifactRefreshUrl / buildArtifactEventsUrl", () => {
    it("builds refresh and events endpoints", () => {
      const refresh = buildArtifactRefreshUrl(
        "http://127.0.0.1:8091",
        "live_answer_view__demo"
      );
      expect(refresh.pathname).toBe(
        "/api/mindbrain/ghostcrab/artifact/live_answer_view__demo/refresh"
      );

      const events = buildArtifactEventsUrl(
        "http://127.0.0.1:8091",
        "live_answer_view__demo",
        10
      );
      expect(events.pathname).toBe(
        "/api/mindbrain/ghostcrab/artifact/live_answer_view__demo/events"
      );
      expect(events.searchParams.get("limit")).toBe("10");
    });
  });

  describe("normalizeArtifactEventsBody", () => {
    it("prefers rows over legacy events field", () => {
      expect(
        normalizeArtifactEventsBody({
          artifact_id: "live_answer_view__x",
          event_kind: "answer_update_event",
          rows: [{ event_id: "e1" }],
          events: [{ event_id: "legacy" }]
        })
      ).toEqual({
        artifact_id: "live_answer_view__x",
        event_kind: "answer_update_event",
        count: 1,
        events: [{ event_id: "e1" }]
      });
    });
  });
});
