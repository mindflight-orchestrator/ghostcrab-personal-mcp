import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

function loadWorkflow(filename: string) {
  return parse(
    readFileSync(
      new URL(`../../.github/workflows/${filename}`, import.meta.url),
      "utf8"
    )
  );
}

const workflow = loadWorkflow("publish.yml");
const ciWorkflow = loadWorkflow("ci.yml");
const nodeWorkflow = loadWorkflow("test-node.yml");
const integrityWorkflow = loadWorkflow("write-integrity.yml");

function checkoutStep(job: { steps: Array<{ uses?: string }> }) {
  return job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
}

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
    const checkout = checkoutStep(workflow.jobs["build-backends"]);
    expect(checkout.with.submodules).toBe(true);
    expect(Number(workflow.env.NODE_VERSION)).toBeGreaterThanOrEqual(22);
  });

  it("checks out the pinned engine everywhere a clean CI checkout builds", () => {
    for (const job of [
      ciWorkflow.jobs.node,
      ciWorkflow.jobs["docker-native"],
      ...Object.values(nodeWorkflow.jobs)
    ]) {
      expect(
        checkoutStep(job as { steps: Array<{ uses?: string }> })?.with
      ).toMatchObject({ submodules: "recursive" });
    }
  });

  it("builds and requires the native document engine in write-integrity", () => {
    const job = integrityWorkflow.jobs["sqlite-and-mutations"];
    expect(job.env.GHOSTCRAB_TEST_REQUIRE_NATIVE_DOCUMENT).toBe("1");
    expect(
      job.steps.some(
        (step: { run?: string }) =>
          step.run === "BACKEND_VENDOR_UPDATE=0 npm run backend:build"
      )
    ).toBe(true);
  });

  it("runs integration directories with the integration Vitest config", () => {
    for (const jobName of ["tool-tests", "native-tests"] as const) {
      const integrationStep = nodeWorkflow.jobs[jobName].steps.find(
        (step: { name?: string }) =>
          step.name?.startsWith("Run integration tests")
      );
      expect(integrationStep?.run).toContain(
        "--config vitest.integration.config.ts tests/integration/"
      );
    }
  });
});
