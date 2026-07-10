import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendProfileSnippet,
  getPathSnippet,
  isGhostcrabBinOnPath,
  resolveGcpMjsPath,
  SHIM_MARKER,
  writeGcpShim
} from "../../bin/lib/path-shim.mjs";

describe("path-shim", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("getPathSnippet returns shell-specific exports", () => {
    const binDir = "/home/user/.ghostcrab/bin";
    expect(getPathSnippet("zsh", binDir)).toBe(
      `export PATH="${binDir}${delimiter}$PATH"`
    );
    expect(getPathSnippet("fish", binDir)).toBe(`fish_add_path -a "${binDir}"`);
    expect(getPathSnippet("powershell", binDir)).toBe(
      `$env:Path = "${binDir};" + $env:Path`
    );
  });

  it("writeGcpShim writes Unix exec wrapper", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gc-path-shim-"));
    const nodePath = process.execPath;
    const gcpMjsPath = join(tempDir, "pkg", "bin", "gcp.mjs");
    const { shimPath } = writeGcpShim({
      nodePath,
      gcpMjsPath,
      binDir: tempDir
    });
    expect(shimPath).toBe(join(tempDir, "gcp"));
    const content = readFileSync(shimPath, "utf8");
    expect(content).toContain("#!/usr/bin/env sh");
    expect(content).toContain(`exec "${nodePath}" "${gcpMjsPath}"`);
    if (process.platform !== "win32") {
      const mode = statSync(shimPath).mode;
      expect(mode & 0o111).not.toBe(0);
    }
  });

  it("writeGcpShim writes Windows cmd wrapper", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gc-path-shim-"));
    const nodePath = "C:\\Program Files\\nodejs\\node.exe";
    const gcpMjsPath = "C:\\pkg\\bin\\gcp.mjs";
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const { shimPath } = writeGcpShim({
        nodePath,
        gcpMjsPath,
        binDir: tempDir
      });
      expect(shimPath).toBe(join(tempDir, "gcp.cmd"));
      const content = readFileSync(shimPath, "utf8");
      expect(content).toContain("@echo off");
      expect(content).toContain(`"${nodePath}" "${gcpMjsPath}"`);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("appendProfileSnippet is idempotent", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gc-path-shim-"));
    const profilePath = join(tempDir, "profile.sh");
    const snippet = 'export PATH="/tmp/.ghostcrab/bin:$PATH"';
    expect(appendProfileSnippet(profilePath, snippet)).toBe("appended");
    expect(readFileSync(profilePath, "utf8")).toContain(SHIM_MARKER);
    expect(appendProfileSnippet(profilePath, snippet)).toBe("present");
    expect(readFileSync(profilePath, "utf8").split(SHIM_MARKER).length).toBe(2);
  });

  it("isGhostcrabBinOnPath detects bin dir in PATH", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gc-path-shim-"));
    const prevPath = process.env.PATH;
    process.env.PATH = `${tempDir}${delimiter}${prevPath ?? ""}`;
    expect(isGhostcrabBinOnPath(tempDir)).toBe(true);
    process.env.PATH = prevPath;
    expect(isGhostcrabBinOnPath(tempDir)).toBe(false);
  });

  it("resolveGcpMjsPath resolves package bin/gcp.mjs", () => {
    tempDir = mkdtempSync(join(tmpdir(), "gc-path-shim-"));
    const pkgRoot = join(tempDir, "pkg");
    const gcpMjs = join(pkgRoot, "bin", "gcp.mjs");
    mkdirSync(join(pkgRoot, "bin"), { recursive: true });
    writeFileSync(gcpMjs, "// stub", "utf8");
    expect(resolveGcpMjsPath(pkgRoot)).toBe(gcpMjs);
    expect(existsSync(resolveGcpMjsPath(pkgRoot))).toBe(true);
  });
});
