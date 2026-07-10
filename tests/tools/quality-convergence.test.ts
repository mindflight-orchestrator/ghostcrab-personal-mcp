import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import {
  qualityConvergenceGetTool,
  qualityConvergenceListTool,
  qualityConvergenceRunTool,
  qualityRemediationActionsTool,
  qualityRemediationApplyTool,
  qualityRemediationDecideTool
} from "../../src/tools/quality/convergence.js";
import { createToolContext } from "../helpers/tool-context.js";

function createMockDatabase(): DatabaseClient {
  return {
    kind: "sqlite",
    query: vi.fn(async () => []),
    ping: async () => true,
    close: async () => undefined,
    transaction: async (operation) =>
      operation({
        kind: "sqlite",
        query: vi.fn(async () => [])
      })
  };
}

function readStructured(result: {
  structuredContent?: unknown;
  isError?: boolean;
}): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("quality convergence MCP tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs convergence through the native MindBrain quality endpoint", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe("/api/mindbrain/quality/convergence/run");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          workspace_id: "default",
          ontology_id: "serenity::production",
          persist: false,
          limit: 25,
          component_small_max: 3
        });
        return jsonResponse({
          kind: "quality_convergence_report",
          run_id: "run_quality_1",
          workspace_id: "default",
          ontology_id: "serenity::production",
          remediation: { proposed_actions: 2 }
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await qualityConvergenceRunTool.handler(
      {
        ontology_id: "serenity::production",
        persist: false,
        limit: 25,
        component_small_max: 3
      },
      createToolContext(createMockDatabase())
    );

    const body = readStructured(result);
    expect(body.ok).toBe(true);
    expect(body.run_id).toBe("run_quality_1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("lists, reads, filters, and decides remediation actions on the native endpoints", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push(
          `${init?.method ?? "GET"} ${url.pathname}?${url.searchParams}`
        );

        if (url.pathname === "/api/mindbrain/quality/convergence/runs") {
          expect(url.searchParams.get("workspace_id")).toBe("ws_quality");
          expect(url.searchParams.get("limit")).toBe("7");
          return jsonResponse({
            kind: "quality_convergence_runs",
            workspace_id: "ws_quality",
            runs: [{ run_id: "run_quality_1" }]
          });
        }

        if (url.pathname === "/api/mindbrain/quality/convergence/run") {
          expect(url.searchParams.get("run_id")).toBe("run_quality_1");
          return jsonResponse({
            kind: "quality_convergence_report",
            run_id: "run_quality_1",
            workspace_id: "ws_quality"
          });
        }

        if (url.pathname === "/api/mindbrain/quality/remediation/actions") {
          expect(url.searchParams.get("run_id")).toBe("run_quality_1");
          expect(url.searchParams.get("status")).toBe("approved");
          return jsonResponse({
            kind: "quality_remediation_actions",
            run_id: "run_quality_1",
            actions: [{ action_id: "act_1", status: "approved" }]
          });
        }

        if (url.pathname === "/api/mindbrain/quality/remediation/decision") {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            action_id: "act_1",
            decision: "approved",
            actor: "tester",
            note: "covered by MCP contract test"
          });
          return jsonResponse({
            ok: true,
            action_id: "act_1",
            decision: "approved"
          });
        }

        throw new Error(`Unexpected request: ${url.pathname}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const context = createToolContext(createMockDatabase());

    const list = readStructured(
      await qualityConvergenceListTool.handler(
        { workspace_id: "ws_quality", limit: 7 },
        context
      )
    );
    expect(list.runs).toEqual([{ run_id: "run_quality_1" }]);

    const report = readStructured(
      await qualityConvergenceGetTool.handler(
        { run_id: "run_quality_1" },
        context
      )
    );
    expect(report.run_id).toBe("run_quality_1");

    const actions = readStructured(
      await qualityRemediationActionsTool.handler(
        { run_id: "run_quality_1", status: "approved" },
        context
      )
    );
    expect(actions.actions).toEqual([
      { action_id: "act_1", status: "approved" }
    ]);

    const decision = readStructured(
      await qualityRemediationDecideTool.handler(
        {
          action_id: "act_1",
          decision: "approved",
          actor: "tester",
          note: "covered by MCP contract test"
        },
        context
      )
    );
    expect(decision.decision).toBe("approved");
    expect(calls).toHaveLength(4);
  });

  it("applies only approved diagnostic remediation actions and records status", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));

        if (url.pathname === "/api/mindbrain/quality/remediation/actions") {
          expect(url.searchParams.get("run_id")).toBe("run_quality_1");
          expect(url.searchParams.get("status")).toBe("approved");
          return jsonResponse({
            kind: "quality_remediation_actions",
            run_id: "run_quality_1",
            actions: [
              {
                action_id: "act_diagnostics",
                execution_mode: "diagnostic_only",
                mcp_tool: "ghostcrab_graph_diagnostics",
                tool_args: {
                  workspace_id: "ws_quality",
                  ontology_id: "serenity::production"
                }
              }
            ]
          });
        }

        if (url.pathname === "/api/mindbrain/graph/diagnostics") {
          expect(url.searchParams.get("workspace_id")).toBe("ws_quality");
          expect(url.searchParams.get("ontology_id")).toBe(
            "serenity::production"
          );
          return jsonResponse({
            kind: "graph_diagnostics_report",
            summary: { workspace_id: "ws_quality", issue_count: 0 },
            issues: []
          });
        }

        if (url.pathname === "/api/mindbrain/quality/remediation/status") {
          expect(init?.method).toBe("POST");
          const body = JSON.parse(String(init?.body));
          expect(body.action_id).toBe("act_diagnostics");
          expect(body.status).toBe("applied");
          expect(JSON.parse(String(body.result_json))).toMatchObject({
            applied_by: "tester"
          });
          return jsonResponse({
            ok: true,
            action_id: "act_diagnostics",
            status: "applied"
          });
        }

        throw new Error(`Unexpected request: ${url.pathname}`);
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await qualityRemediationApplyTool.handler(
      {
        run_id: "run_quality_1",
        action_id: "act_diagnostics",
        actor: "tester"
      },
      createToolContext(createMockDatabase())
    );

    const body = readStructured(result);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("applied");
    expect(body.diagnostic_result).toMatchObject({
      kind: "graph_diagnostics_report"
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
