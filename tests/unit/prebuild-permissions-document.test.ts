import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePrebuildForInstall } from "../../bin/lib/prebuild-permissions.mjs";

describe("prebuild-permissions document engine", () => {
  let root = "";
  const platformKey = `${process.platform}-${process.arch}`;
  const backendName =
    process.platform === "win32"
      ? "ghostcrab-backend.exe"
      : "ghostcrab-backend";
  const documentName =
    process.platform === "win32"
      ? "ghostcrab-document.exe"
      : "ghostcrab-document";

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  function stageBackendOnly() {
    root = mkdtempSync(join(tmpdir(), "gc-prebuild-doc-"));
    const prebuildDir = join(root, "prebuilds", platformKey);
    mkdirSync(prebuildDir, { recursive: true });
    const backendPath = join(prebuildDir, backendName);
    writeFileSync(
      backendPath,
      "#!/bin/sh\necho ghostcrab-backend usage:\n",
      "utf8"
    );
    if (process.platform !== "win32") {
      chmodSync(backendPath, 0o755);
    }
    writeFileSync(join(root, "package.json"), '{"name":"test-pkg"}', "utf8");
  }

  it("returns documentMissing when backend OK but document absent", () => {
    stageBackendOnly();
    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = preparePrebuildForInstall(root, {
      ignoreOptionalDependency: true,
      ignorePostinstallEnv: true,
      silent: true
    });

    expect(result.ok).toBe(true);
    expect(result.documentMissing).toBe(true);
    expect(result.documentOk).toBe(false);
    expect(result.documentPath).toContain(documentName);
    expect(warnSpy).toHaveBeenCalled();
    const combined = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(combined).toMatch(/ghostcrab-document/);
    expect(combined).toMatch(/ontology\|document\|structured-import/);
  });

  it("returns documentOk when both binaries are present", () => {
    stageBackendOnly();
    const documentPath = join(root, "prebuilds", platformKey, documentName);
    writeFileSync(documentPath, "#!/bin/sh\necho usage:\n", "utf8");
    if (process.platform !== "win32") {
      chmodSync(documentPath, 0o755);
    }

    const result = preparePrebuildForInstall(root, {
      ignoreOptionalDependency: true,
      ignorePostinstallEnv: true,
      silent: true
    });

    expect(result.documentOk).toBe(true);
    expect(result.documentMissing).toBe(false);
    expect(result.documentPath).toBe(documentPath);
  });
});
