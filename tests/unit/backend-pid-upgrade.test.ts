/**
 * Tests for the PID file format change (3-field: pid:port:version) and the
 * version comparison logic used by the upgrade detection block in serve.mjs.
 *
 * The parsing mirrors the exact logic in serve.mjs so any format change here
 * must be reflected there and vice versa.
 */
import { describe, expect, it } from "vitest";

/** Mirrors the parsing in serve.mjs */
function parsePidFile(content: string): {
  pid: number;
  port: number;
  version: string;
} | null {
  const parts = content.trim().split(":");
  const pid = parseInt(parts[0], 10);
  const port = parseInt(parts[1], 10);
  const version = parts[2] ?? "unknown";
  if (isNaN(pid) || isNaN(port)) return null;
  return { pid, port, version };
}

/** Mirrors the upgrade decision in serve.mjs */
function needsUpgrade(storedVersion: string, currentVersion: string): boolean {
  return storedVersion !== currentVersion;
}

describe("PID file format (3-field: pid:port:version)", () => {
  it("parses a current-format file correctly", () => {
    const result = parsePidFile("54390:8091:0.2.22\n");
    expect(result).toEqual({ pid: 54390, port: 8091, version: "0.2.22" });
  });

  it("parses a legacy 2-field file (pre-0.2.23) as version 'unknown'", () => {
    const result = parsePidFile("54390:8091\n");
    expect(result).toEqual({ pid: 54390, port: 8091, version: "unknown" });
  });

  it("returns null for an empty string", () => {
    expect(parsePidFile("")).toBeNull();
  });

  it("returns null when pid field is not a number", () => {
    expect(parsePidFile("abc:8091:0.2.22")).toBeNull();
  });

  it("returns null when port field is not a number", () => {
    expect(parsePidFile("54390:xyz:0.2.22")).toBeNull();
  });

  it("handles whitespace-only content", () => {
    expect(parsePidFile("   ")).toBeNull();
  });
});

describe("upgrade detection logic", () => {
  it("no upgrade needed when versions match", () => {
    expect(needsUpgrade("0.2.22", "0.2.22")).toBe(false);
  });

  it("upgrade triggered when stored version is older", () => {
    expect(needsUpgrade("0.2.18", "0.2.22")).toBe(true);
  });

  it("upgrade triggered for legacy 2-field files (version = 'unknown')", () => {
    expect(needsUpgrade("unknown", "0.2.22")).toBe(true);
  });

  it("upgrade triggered when stored version is somehow newer (downgrade scenario)", () => {
    expect(needsUpgrade("0.2.99", "0.2.22")).toBe(true);
  });
});
