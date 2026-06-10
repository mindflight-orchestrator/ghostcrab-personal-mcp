import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  auditCliInvocation,
  detectCliInstallKind,
  formatGcpCommand,
  GCP_NPX_PREFIX
} from "../../bin/lib/cli-invocation.mjs";
import {
  isEphemeralNodePath,
  resolveRuntimeNodePath
} from "../../bin/lib/runtime-node.mjs";
import { PKG_ROOT } from "../../bin/lib/mcp-global-setup.mjs";

describe("runtime-node", () => {
  it("flags Cursor AppImage node paths as ephemeral", () => {
    expect(
      isEphemeralNodePath(
        "/tmp/.mount_cursorEPfGmg/usr/share/cursor/resources/app/resources/helpers/node"
      )
    ).toBe(true);
    expect(isEphemeralNodePath("/usr/bin/node")).toBe(false);
  });

  it("resolveRuntimeNodePath prefers a normal execPath", () => {
    expect(resolveRuntimeNodePath("/usr/bin/node")).toBe("/usr/bin/node");
  });
});

describe("cli-invocation", () => {
  let tempDir = "";
  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("formatGcpCommand uses scoped --package form", () => {
    expect(formatGcpCommand("brain setup codex --force")).toBe(
      `${GCP_NPX_PREFIX} brain setup codex --force`
    );
  });

  it("detectCliInstallKind classifies package roots", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gc-cli-kind-"));
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "my-consumer-app" })
    );
    const localRoot = join(
      tempDir,
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp"
    );
    mkdirSync(localRoot, { recursive: true });
    writeFileSync(join(localRoot, "package.json"), JSON.stringify({ version: "0.5.2" }));

    expect(detectCliInstallKind(localRoot)).toBe("local");
    expect(
      detectCliInstallKind(
        "/home/user/.npm-global/lib/node_modules/@mindflight/ghostcrab-personal-mcp"
      )
    ).toBe("global-or-linked");
    expect(detectCliInstallKind("/src/ghostcrab-personal-mcp")).toBe("source");
  });

  it("auditCliInvocation warns when running from source checkout root", () => {
    const audit = auditCliInvocation({
      pkgRoot: PKG_ROOT,
      cwd: PKG_ROOT
    });
    expect(audit.installKind).toBe("source");
    expect(audit.issues.some((line) => /git checkout root/i.test(line))).toBe(
      true
    );
    expect(audit.fixes.some((line) => line.includes(GCP_NPX_PREFIX))).toBe(true);
  });
});
