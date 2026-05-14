import { describe, expect, it } from "vitest";

import { CLI_COMMANDS, resolveCommand } from "../../src/cli/commands.js";
import {
  __private__,
  HelpRequested,
  parseCliInput
} from "../../src/cli/parse-input.js";
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_UNKNOWN_TOOL,
  EXIT_VALIDATION,
  exitCodeForResult
} from "../../src/cli/execute.js";
import { createToolErrorResult } from "../../src/tools/registry.js";

describe("resolveCommand", () => {
  it("resolves status to ghostcrab_status", () => {
    const cmd = resolveCommand(["status"]);
    expect(cmd?.mcpToolName).toBe("ghostcrab_status");
  });

  it("returns undefined for unknown commands", () => {
    expect(resolveCommand(["unknown"])).toBeUndefined();
  });

  it("returns undefined for MCP-only command aliases", () => {
    expect(resolveCommand(["search"])).toBeUndefined();
    expect(resolveCommand(["schema"])).toBeUndefined();
  });
});

describe("parseCliInput", () => {
  const statusCmd = CLI_COMMANDS.find((c) => c.cliName === "status")!;

  it("maps kebab-case flags to snake_case tool args", () => {
    const args = parseCliInput(statusCmd, ["status", "--agent-id", "agent:1"]);
    expect(args).toEqual({
      agent_id: "agent:1"
    });
  });

  it("returns payload from --input and ignores other flags", () => {
    const args = parseCliInput(statusCmd, [
      "status",
      "--input",
      '{"agent_id":"agent:json"}',
      "--agent-id",
      "ignored"
    ]);
    expect(args).toEqual({ agent_id: "agent:json" });
  });

  it("rejects scalar JSON values in --input", () => {
    expect(() => parseCliInput(statusCmd, ["status", "--input", '"hello"'])).toThrow(
      /must contain a JSON object payload/
    );
  });

  it("throws when --input JSON is invalid", () => {
    expect(() =>
      parseCliInput(statusCmd, ["status", "--input", '{"query"'])
    ).toThrow();
  });

  it("throws HelpRequested when --help is passed", () => {
    expect(() => parseCliInput(statusCmd, ["status", "--help"])).toThrow(
      HelpRequested
    );
  });

  it("throws when --input and --stdin-json are combined", () => {
    expect(() =>
      parseCliInput(statusCmd, ["status", "--input", "{}", "--stdin-json"])
    ).toThrow(/Cannot use --input and --stdin-json/);
  });

  it("accepts --json as a no-op global flag", () => {
    const args = parseCliInput(statusCmd, [
      "status",
      "--json",
      "--agent-id",
      "agent:self"
    ]);

    expect(args).toEqual({ agent_id: "agent:self" });
  });
});

describe("parse-input internals", () => {
  it("coerceScalar returns the original string for malformed JSON-like values", () => {
    expect(__private__.coerceScalar("filters", "{invalide")).toBe("{invalide");
  });

  it("parseJsonObject rejects arrays for stdin/input payloads", () => {
    expect(() => __private__.parseJsonObject("[]", "--input")).toThrow(
      /must contain a JSON object payload/
    );
  });
});

describe("exitCodeForResult", () => {
  it("returns EXIT_OK for success", () => {
    const result = {
      content: [],
      isError: false
    };
    expect(exitCodeForResult(result)).toBe(EXIT_OK);
  });

  it("returns EXIT_VALIDATION for validation_error payloads", () => {
    const result = createToolErrorResult(
      "ghostcrab_search",
      "bad",
      "validation_error"
    );
    expect(exitCodeForResult(result)).toBe(EXIT_VALIDATION);
  });

  it("returns EXIT_UNKNOWN_TOOL for unknown_tool", () => {
    const result = createToolErrorResult(
      "ghostcrab_missing",
      "missing",
      "unknown_tool"
    );
    expect(exitCodeForResult(result)).toBe(EXIT_UNKNOWN_TOOL);
  });

  it("returns EXIT_ERROR for other tool errors", () => {
    const result = createToolErrorResult(
      "ghostcrab_upsert",
      "failed",
      "record_not_found"
    );
    expect(exitCodeForResult(result)).toBe(EXIT_ERROR);
  });
});
