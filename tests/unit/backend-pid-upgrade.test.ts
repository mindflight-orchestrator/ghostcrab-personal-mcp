/**
 * Tests for the PID file format change (3–4 field: pid:port:version[:fingerprint])
 * and the version/fingerprint comparison logic used by serve.mjs.
 */
import {
  backendHasGraphDiagnostics,
  formatPidFile,
  needsUpgrade,
  parsePidFile,
  probeMindbrainCapabilities
} from "../../bin/lib/backend-pid.mjs";
import { describe, expect, it } from "vitest";

describe("PID file format (pid:port:version[:fingerprint])", () => {
  it("parses a current-format file correctly", () => {
    const result = parsePidFile("54390:8091:0.3.0\n");
    expect(result).toEqual({
      pid: 54390,
      port: 8091,
      version: "0.3.0",
      fingerprint: null
    });
  });

  it("parses a 4-field file with binary fingerprint", () => {
    const result = parsePidFile("54390:8091:0.4.1:abc123def456\n");
    expect(result).toEqual({
      pid: 54390,
      port: 8091,
      version: "0.4.1",
      fingerprint: "abc123def456"
    });
  });

  it("parses a legacy 2-field file (pre-0.2.23) as version 'unknown'", () => {
    const result = parsePidFile("54390:8091\n");
    expect(result).toEqual({
      pid: 54390,
      port: 8091,
      version: "unknown",
      fingerprint: null
    });
  });

  it("returns null for an empty string", () => {
    expect(parsePidFile("")).toBeNull();
  });

  it("returns null when pid field is not a number", () => {
    expect(parsePidFile("abc:8091:0.3.0")).toBeNull();
  });

  it("returns null when port field is not a number", () => {
    expect(parsePidFile("54390:xyz:0.3.0")).toBeNull();
  });

  it("handles whitespace-only content", () => {
    expect(parsePidFile("   ")).toBeNull();
  });
});

describe("formatPidFile", () => {
  it("writes 3-field format without fingerprint", () => {
    expect(formatPidFile(1, 8091, "0.4.1", null)).toBe("1:8091:0.4.1\n");
  });

  it("writes 4-field format with fingerprint", () => {
    expect(formatPidFile(1, 8091, "0.4.1", "deadbeef1234")).toBe(
      "1:8091:0.4.1:deadbeef1234\n"
    );
  });
});

describe("upgrade detection logic", () => {
  it("no upgrade needed when versions and fingerprints match", () => {
    expect(needsUpgrade("0.3.0", "0.3.0", "abc", "abc")).toBe(false);
  });

  it("upgrade triggered when stored version is older", () => {
    expect(needsUpgrade("0.2.22", "0.3.0", null, null)).toBe(true);
  });

  it("upgrade triggered for legacy 2-field files (version = 'unknown')", () => {
    expect(needsUpgrade("unknown", "0.3.0", null, null)).toBe(true);
  });

  it("upgrade triggered when stored version is somehow newer (downgrade scenario)", () => {
    expect(needsUpgrade("0.3.1", "0.3.0", null, null)).toBe(true);
  });

  it("upgrade triggered when semver matches but binary fingerprint differs", () => {
    expect(
      needsUpgrade("0.4.1", "0.4.1", "oldfingerprint", "newfingerprint")
    ).toBe(true);
  });

  it("no upgrade when semver matches and fingerprint is missing on stored file", () => {
    expect(needsUpgrade("0.4.1", "0.4.1", null, "newfingerprint")).toBe(false);
  });
});

describe("probeMindbrainCapabilities", () => {
  it("reports missing graph routes for unknown hosts", async () => {
    const probe = await probeMindbrainCapabilities("http://127.0.0.1:1", 200);
    expect(probe.ok).toBe(false);
  });

  it("backendHasGraphDiagnostics returns false when probe fails", async () => {
    await expect(
      backendHasGraphDiagnostics("http://127.0.0.1:1", 200)
    ).resolves.toBe(false);
  });
});
