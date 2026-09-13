import { afterEach, describe, expect, it, vi } from "vitest";
import { artifactGetTool } from "../../src/tools/pragma/artifact-get.js";
import { createToolContext } from "../helpers/tool-context.js";
import type { DatabaseClient } from "../../src/db/client.js";

const binding = {
  workspace_id: "w",
  artifact_id: "a",
  include_answer: true,
  expected_version: 2,
  expected_contract_digest: "c".repeat(64),
  expected_source_digest: "d".repeat(64),
  expected_as_of: "2026-09-13"
};
const answer = {
  status: "ready",
  workspace_id: "w",
  contract_digest: binding.expected_contract_digest,
  source_digest: binding.expected_source_digest,
  as_of: binding.expected_as_of,
  rows: [{ total: 1000 }],
  ontology: { ontology_id: "w::core" }
};
const artifact = {
  artifact_id: "a",
  artifact_kind: "live_answer_view",
  workspace_id: "w",
  current_version: 2,
  state: "refreshed",
  lifecycle: "active",
  payload_json: "{}",
  answer_json: JSON.stringify(answer)
};
const context = createToolContext({} as DatabaseClient);
function mock(row = artifact) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(row), { status: 200 }))
  );
}
afterEach(() => vi.unstubAllGlobals());
describe("bound native projection answer", () => {
  it("returns both business result and ontology in the single read", async () => {
    mock();
    const result = await artifactGetTool.handler(binding, context);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      answer_available: true,
      answer: { rows: [{ total: 1000 }], ontology: { ontology_id: "w::core" } }
    });
  });
  it.each([
    [{ ...artifact, lifecycle: "archived" }, "projection_stale"],
    [{ ...artifact, state: "dirty" }, "projection_stale"],
    [{ ...artifact, current_version: 3 }, "projection_version_changed"],
    [{ ...artifact, workspace_id: "foreign" }, "workspace_mismatch"],
    [
      { ...artifact, answer_json: JSON.stringify({ status: "stale" }) },
      "projection_stale"
    ],
    [
      {
        ...artifact,
        answer_json: JSON.stringify({
          ...answer,
          source_digest: "e".repeat(64)
        })
      },
      "projection_binding_changed"
    ],
    [
      {
        ...artifact,
        answer_json: JSON.stringify({
          ...answer,
          contract_digest: "e".repeat(64)
        })
      },
      "projection_binding_changed"
    ],
    [
      {
        ...artifact,
        answer_json: JSON.stringify({ ...answer, as_of: "2026-09-14" })
      },
      "projection_binding_changed"
    ]
  ])("rejects changed identity or revision", async (row, code) => {
    mock(row);
    expect(
      (await artifactGetTool.handler(binding, context)).structuredContent
    ).toMatchObject({ ok: false, error: { code } });
  });
  it("does not call partial evidence a complete answer", async () => {
    mock({
      ...artifact,
      answer_json: JSON.stringify({
        ...answer,
        status: "indeterminate",
        complete: false
      })
    });
    expect(
      (await artifactGetTool.handler(binding, context)).structuredContent
    ).toMatchObject({
      ok: true,
      answer_available: false,
      answer: { status: "indeterminate" }
    });
  });
  it("requires the entire discovery binding", async () => {
    mock();
    expect(
      (
        await artifactGetTool.handler(
          { workspace_id: "w", artifact_id: "a", include_answer: true },
          context
        )
      ).structuredContent
    ).toMatchObject({ ok: false, error: { code: "missing_answer_binding" } });
  });
});
