import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    new URL("../../.github/workflows/publish.yml", import.meta.url),
    "utf8"
  )
);

describe("release publication boundary", () => {
  it("requires manual opt-in on a release tag before submitting to npm", () => {
    expect(workflow.on.workflow_dispatch.inputs.stage_npm).toMatchObject({
      type: "boolean",
      default: false
    });
    expect(workflow.jobs.publish.if).toBe(
      "${{ github.event_name == 'workflow_dispatch' && inputs.stage_npm == true && startsWith(github.ref, 'refs/tags/v') }}"
    );
    expect(workflow.jobs.publish.needs).toContain("beta-install-windows");
    expect(workflow.jobs.publish.needs).toContain("write-integrity");
    expect(workflow.jobs.publish.needs).toContain("native-write-integrity");
    expect(workflow.jobs["write-integrity"].uses).toBe(
      "./.github/workflows/write-integrity.yml"
    );
  });

  it("builds the pinned engine and supports the npm toolchain on Windows", () => {
    const checkout = workflow.jobs["build-backends"].steps.find(
      (step: { uses?: string }) => step.uses?.startsWith("actions/checkout@")
    );
    expect(checkout.with.submodules).toBe(true);
    expect(Number(workflow.env.NODE_VERSION)).toBeGreaterThanOrEqual(22);
  });
});
