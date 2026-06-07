import { afterEach, describe, expect, it, vi } from "vitest";

import { ontologyImportTool } from "../../src/tools/ontology/import.js";
import { runNativeMindbrainEngine } from "../../src/db/native-engine.js";
import type { ToolExecutionContext } from "../../src/tools/registry.js";

vi.mock("../../src/db/native-engine.js", () => ({
  runNativeMindbrainEngine: vi.fn(() => ({
    ok: true,
    status: 0,
    stdout: "{\"ontology_id\":\"demo::core\"}",
    stderr: "",
    engineSource: "vendor-dev"
  }))
}));

const context = {
  session: { workspace_id: "demo" }
} as ToolExecutionContext;

describe("ghostcrab_ontology_import HTTP transport", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses native HTTP ontology import when MindBrain advertises the route", async () => {
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/mindbrain/capabilities") {
        return jsonResponse({
          kind: "mindbrain_capabilities",
          features: {
            ontology_import: true,
            ontology_compile_linkml: true
          }
        });
      }
      expect(path).toBe("/api/mindbrain/ontology/compile-linkml");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspace_id: "demo",
        ontology_id: "demo::core",
        input_path: "package.json"
      });
      return jsonResponse({
        ontology_id: "demo::core",
        entity_types: 1,
        edge_types: 2,
        enum_values: 3,
        triples: 4,
        imported: true
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GHOSTCRAB_MINDBRAIN_URL", "http://mindbrain.test");

    const result = await ontologyImportTool.handler(
      { ontology_id: "demo::core", input_path: "package.json" },
      context
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      backend: "mindbrain/http-ontology-import",
      ontology_id: "demo::core"
    });
    expect(runNativeMindbrainEngine).not.toHaveBeenCalled();
  });

  it("falls back to the native CLI when ontology HTTP capabilities are absent", async () => {
    const fetchMock = vi.fn(async (url: URL | string) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/mindbrain/capabilities") {
        return jsonResponse({
          kind: "mindbrain_capabilities",
          features: {}
        });
      }
      expect(path).toBe("/api/mindbrain/sql/write-status");
      return jsonResponse({ mode: "serialized-writer", active_session_id: null });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GHOSTCRAB_MINDBRAIN_URL", "http://mindbrain.test");

    const result = await ontologyImportTool.handler(
      {
        ontology_id: "demo::core",
        input_path: "package.json",
        source_format: "ntriples",
        materialize_graph: true
      },
      context
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      backend: "mindbrain/native-ontology-import",
      engine_source: "vendor-dev"
    });
    expect(runNativeMindbrainEngine).toHaveBeenCalledWith(
      expect.arrayContaining(["ontology-import", "--materialize-graph"]),
      expect.any(Object)
    );
  });

  it("does not fall back to CLI on HTTP writer-lane errors", async () => {
    const fetchMock = vi.fn(async (url: URL | string) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/mindbrain/capabilities") {
        return jsonResponse({
          kind: "mindbrain_capabilities",
          features: {
            ontology_import: true,
            ontology_compile_linkml: true
          }
        });
      }
      return new Response('{"error":"writer_busy"}', {
        status: 409,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GHOSTCRAB_MINDBRAIN_URL", "http://mindbrain.test");

    const result = await ontologyImportTool.handler(
      {
        ontology_id: "demo::core",
        input_path: "package.json",
        source_format: "ntriples"
      },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: {
        code: "http_import_failed"
      }
    });
    expect(runNativeMindbrainEngine).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
