import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadDemoProfile,
  normalizeAnswerArtifactEntry
} from "../../src/cli/demo-load.js";
import type { GhostcrabConfig } from "../../src/config/env.js";
import type { Queryable } from "../../src/db/client.js";

const factWriteResponse = {
  created: true,
  doc_id: 123,
  id: "fact:1",
  ok: true,
  updated: false
};

const config = {
  mindbrainHttpTimeoutMs: 1000,
  mindbrainUrl: "http://127.0.0.1:8091"
} as GhostcrabConfig;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/mindbrain/facts/write")) {
        return new Response(JSON.stringify(factWriteResponse), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(null, { status: 404 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo-load answer_artifact entries", () => {
  it("normalizes analysis plans and live answer views", () => {
    expect(
      normalizeAnswerArtifactEntry({
        agent_id: "agent:demo",
        artifact_id: "analysis_plan__demo",
        artifact_kind: "analysis_plan",
        lifecycle: "active",
        payload: { steps: ["inspect"] },
        public_label: "Plan demo",
        scope: "demo",
        slug: "demo",
        state: "open"
      })
    ).toMatchObject({
      agent_id: "agent:demo",
      artifact_kind: "analysis_plan",
      current_version: 1,
      payload_json: '{"steps":["inspect"]}',
      scope: "demo",
      workspace_id: null
    });

    expect(
      normalizeAnswerArtifactEntry({
        artifact_id: "live_answer_view__demo",
        artifact_kind: "live_answer_view",
        lifecycle: "stale",
        payload_json: '{"source_plan_id":"analysis_plan__demo"}',
        public_label: "Vue demo",
        slug: "demo",
        state: "dirty",
        workspace_id: "demo"
      })
    ).toMatchObject({
      artifact_kind: "live_answer_view",
      payload_json: '{"source_plan_id":"analysis_plan__demo"}',
      workspace_id: "demo"
    });
  });

  it("rejects invalid artifact kinds and invalid scope shapes", () => {
    expect(() =>
      normalizeAnswerArtifactEntry({
        agent_id: "agent:demo",
        artifact_id: "bad__demo",
        artifact_kind: "answer_update_event" as "analysis_plan",
        lifecycle: "active",
        public_label: "Bad",
        scope: "demo",
        slug: "demo",
        state: "open"
      })
    ).toThrow(/Invalid answer_artifact artifact_kind/);

    expect(() =>
      normalizeAnswerArtifactEntry({
        artifact_id: "analysis_plan__demo",
        artifact_kind: "analysis_plan",
        lifecycle: "active",
        public_label: "Bad plan",
        slug: "demo",
        state: "open",
        workspace_id: "demo"
      })
    ).toThrow(/analysis_plan requires agent_id and scope/);

    expect(() =>
      normalizeAnswerArtifactEntry({
        artifact_id: "live_answer_view__demo",
        artifact_kind: "live_answer_view",
        lifecycle: "stale",
        public_label: "Bad live view",
        slug: "demo",
        state: "dirty"
      })
    ).toThrow(/live_answer_view requires workspace_id/);

    expect(() =>
      normalizeAnswerArtifactEntry({
        agent_id: "agent:demo",
        artifact_id: "analysis_plan__payload_conflict",
        artifact_kind: "analysis_plan",
        lifecycle: "active",
        payload: { steps: [] },
        payload_json: "{}",
        public_label: "Bad payload",
        scope: "demo",
        slug: "demo",
        state: "open"
      })
    ).toThrow(/either payload or payload_json/);
  });

  it("loads answer artifacts idempotently", async () => {
    const insertedIds = new Set<string>();
    const query = vi.fn<Queryable["query"]>(async (sql, params = []) => {
      if (sql.includes("SELECT artifact_id")) {
        const artifactId = String(params[0]);
        return insertedIds.has(artifactId) ? [{ artifact_id: artifactId }] : [];
      }

      if (sql.includes("INSERT INTO mindbrain_answer_artifacts")) {
        insertedIds.add(String(params[0]));
        return [];
      }

      return [];
    });
    const queryable: Queryable = { kind: "sqlite", query };
    const entries = [
      {
        kind: "answer_artifact" as const,
        profile_id: "demo",
        artifact: {
          agent_id: "agent:demo",
          artifact_id: "analysis_plan__demo",
          artifact_kind: "analysis_plan" as const,
          lifecycle: "active",
          payload: { step_count: 1 },
          public_label: "Plan demo",
          scope: "demo",
          slug: "demo",
          state: "open"
        }
      }
    ];

    const first = await loadDemoProfile(config, queryable, entries, "demo");
    const second = await loadDemoProfile(config, queryable, entries, "demo");

    expect(first.insertedArtifacts).toBe(1);
    expect(first.skipped).toBe(0);
    expect(second.insertedArtifacts).toBe(0);
    expect(second.skipped).toBe(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO mindbrain_answer_artifacts"),
      expect.arrayContaining([
        "analysis_plan__demo",
        "demo",
        null,
        "agent:demo",
        "demo",
        "analysis_plan"
      ])
    );
  });

  it("loads demo profile imports into a target workspace", async () => {
    const query = vi.fn<Queryable["query"]>(async (sql, params = []) => {
      if (sql.includes("mb_pragma.agent_facts")) {
        return [];
      }
      if (sql.includes("INSERT INTO mb_pragma.agent_facts")) {
        return [];
      }
      if (sql.includes("INSERT INTO graph_relation")) {
        return [];
      }
      if (sql.includes("INSERT INTO graph_entity")) {
        return [];
      }
      return [];
    });
    const queryable: Queryable = { kind: "sqlite", query };

    const entries = [
      {
        kind: "remember" as const,
        profile_id: "demo",
        schema_id: "demo:schema",
        facets: { key: "value" },
        content: "sample content"
      }
    ];

    const summary = await loadDemoProfile(
      config,
      queryable,
      entries,
      "demo",
      "my-app"
    );

    expect(summary.insertedFacts).toBe(1);
    expect(summary.insertedEdges).toBe(0);
    expect(summary.insertedNodes).toBe(0);
    expect(summary.insertedArtifacts).toBe(0);
    expect(summary.insertedProjections).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("mb_pragma.agent_facts"),
      ["demo:schema", "sample content", JSON.stringify({ key: "value" }), "my-app"]
    );
  });
});
