import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __private__,
  cmdBrainArtifact
} from "../../bin/commands/brain-artifact.mjs";

describe("gcp brain artifact command helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("re-exports parseArtifactArgs from shared lib", () => {
    expect(
      __private__.parseArtifactArgs(["list", "--kind", "analysis_plan"])
    ).toMatchObject({
      subcommand: "list",
      kind: "analysis_plan"
    });
  });

  it("builds migrate engine args for repair", () => {
    expect(
      __private__.buildArtifactMigrateEngineArgs("/tmp/brain.sqlite", {
        dryRun: false,
        repair: true
      })
    ).toEqual(["artifact-migrate", "--db", "/tmp/brain.sqlite", "--repair"]);
  });

  it("prints refresh help with exact-id, no-wildcard, and 405 guidance", () => {
    const help = __private__.artifactHelpText();
    expect(help).toContain("The id must be exact");
    expect(help).toContain("globs/wildcards");
    expect(help).toContain("live_answer_view__foo_*");
    expect(help).toContain("The refresh route is POST");
    expect(help).toContain("405 MethodNotAllowed");
  });

  it("prints governed create help and mandatory workspace resolution", () => {
    const help = __private__.artifactHelpText();
    expect(help).toContain("artifact create");
    expect(help).toContain("--definition-file");
    expect(help).toContain("concrete workspace is always");
  });

  it("preflights capability then posts governed creation JSON", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "gcp-live-create-"));
    const definitionFile = join(fixtureDir, "definition.json");
    writeFileSync(definitionFile, '{"question":"What changed?"}');
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
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
            ok: true,
            created: true,
            idempotent: false,
            artifact_id: "live_answer_view__weekly_status"
          }),
          { status: 201 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await cmdBrainArtifact([
        "create",
        "--workspace-id",
        "default",
        "--slug",
        "weekly_status",
        "--public-label",
        "Weekly status",
        "--definition-file",
        definitionFile,
        "--url",
        "http://127.0.0.1:8091"
      ]);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]?.[0] as URL).pathname).toBe(
      "/api/mindbrain/capabilities"
    );
    expect((fetchMock.mock.calls[1]?.[0] as URL).pathname).toBe(
      "/api/mindbrain/ghostcrab/artifact"
    );
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      workspace_id: "default",
      slug: "weekly_status",
      public_label: "Weekly status",
      definition: { question: "What changed?" }
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"created": true')
    );
  });

  it("stops before POST with the exact blocker when capability is absent", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "gcp-live-blocker-"));
    const definitionFile = join(fixtureDir, "definition.json");
    writeFileSync(definitionFile, '{"question":"What changed?"}');
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`EXIT_${code ?? 0}`);
    }) as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ kind: "mindbrain_capabilities", features: {} }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(
        cmdBrainArtifact([
          "create",
          "--workspace-id",
          "default",
          "--slug",
          "weekly_status",
          "--public-label",
          "Weekly status",
          "--definition-file",
          definitionFile,
          "--url",
          "http://127.0.0.1:8091"
        ])
      ).rejects.toThrow("EXIT_1");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "BLOCKER_GHOSTCRAB_ARTIFACT_CREATE_UNAVAILABLE"
    );
  });
});
