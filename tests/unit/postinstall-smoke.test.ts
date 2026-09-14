import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPostinstallSmoke } from "../../bin/lib/postinstall-smoke.mjs";

describe("postinstall-smoke document engine", () => {
  let root = "";

  function successfulSpawn() {
    return vi.fn((command: string) => ({
      status: 0,
      signal: null,
      stdout:
        command === process.execPath ? "GhostCrab CLI" : "usage: ghostcrab",
      stderr: "",
      pid: 1,
      output: [],
      error: undefined
    }));
  }

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  function makeFakeBinary(name: string, usageLabel: string) {
    const path = join(root, name);
    writeFileSync(
      path,
      `#!/usr/bin/env sh\nif [ "$1" = "--help" ]; then echo "usage: ${usageLabel}"; exit 0; fi\nexit 1\n`,
      "utf8"
    );
    chmodSync(path, 0o755);
    return path;
  }

  it("skips document smoke when documentPath is absent", () => {
    root = mkdtempSync(join(tmpdir(), "gc-smoke-"));
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(
      join(root, "bin", "gcp.mjs"),
      "console.log('GhostCrab CLI');",
      "utf8"
    );
    const backendPath = makeFakeBinary(
      "ghostcrab-backend",
      "ghostcrab-backend"
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    const spawn = successfulSpawn();

    runPostinstallSmoke({
      pkgRoot: root,
      backendPath,
      quiet: false,
      spawn
    });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(
      /skipping document engine check/
    );
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(
      /document engine skipped/
    );
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("runs document smoke when documentPath is provided", () => {
    root = mkdtempSync(join(tmpdir(), "gc-smoke-"));
    mkdirSync(join(root, "bin"), { recursive: true });
    writeFileSync(
      join(root, "bin", "gcp.mjs"),
      "console.log('GhostCrab CLI');",
      "utf8"
    );
    const backendPath = makeFakeBinary(
      "ghostcrab-backend",
      "ghostcrab-backend"
    );
    const documentPath = makeFakeBinary(
      "ghostcrab-document",
      "ghostcrab-document"
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as never);
    const spawn = successfulSpawn();

    runPostinstallSmoke({
      pkgRoot: root,
      backendPath,
      documentPath,
      quiet: false,
      spawn
    });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(
      /ghostcrab-document --help/
    );
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn).toHaveBeenLastCalledWith(
      documentPath,
      ["--help"],
      expect.objectContaining({ shell: false })
    );
  });
});
