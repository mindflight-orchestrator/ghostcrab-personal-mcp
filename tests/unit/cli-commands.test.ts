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
  it("resolves search to ghostcrab_search", () => {
    const cmd = resolveCommand(["search"]);
    expect(cmd?.mcpToolName).toBe("ghostcrab_search");
  });

  it("resolves schema list to ghostcrab_schema_list", () => {
    const cmd = resolveCommand(["schema", "list"]);
    expect(cmd?.mcpToolName).toBe("ghostcrab_schema_list");
  });

  it("resolves schema inspect to ghostcrab_schema_inspect", () => {
    const cmd = resolveCommand(["schema", "inspect"]);
    expect(cmd?.mcpToolName).toBe("ghostcrab_schema_inspect");
  });

  it("returns undefined for unknown commands", () => {
    expect(resolveCommand(["unknown"])).toBeUndefined();
  });

  it("returns undefined for schema without subcommand", () => {
    expect(resolveCommand(["schema"])).toBeUndefined();
  });
});

describe("parseCliInput", () => {
  const searchCmd = CLI_COMMANDS.find((c) => c.cliName === "search")!;

  it("maps kebab-case flags to snake_case tool args", () => {
    const args = parseCliInput(searchCmd, [
      "search",
      "--schema-id",
      "my:schema",
      "--query",
      "hello"
    ]);
    expect(args).toEqual({
      schema_id: "my:schema",
      query: "hello"
    });
  });

  it("parses JSON strings for filters", () => {
    const args = parseCliInput(searchCmd, [
      "search",
      "--filters",
      '{"team":"ops"}',
      "--limit",
      "5"
    ]);
    expect(args.filters).toEqual({ team: "ops" });
    expect(args.limit).toBe(5);
  });

  it("returns payload from --input and ignores other flags", () => {
    const args = parseCliInput(searchCmd, [
      "search",
      "--input",
      '{"query":"test","limit":3}',
      "--query",
      "ignored"
    ]);
    expect(args).toEqual({ query: "test", limit: 3 });
  });

  it("rejects scalar JSON values in --input", () => {
    expect(() => parseCliInput(searchCmd, ["search", "--input", '"hello"'])).toThrow(
      /must contain a JSON object payload/
    );
  });

  it("throws when --input JSON is invalid", () => {
    expect(() =>
      parseCliInput(searchCmd, ["search", "--input", '{"query"'])
    ).toThrow();
  });

  it("throws HelpRequested when --help is passed", () => {
    expect(() => parseCliInput(searchCmd, ["search", "--help"])).toThrow(
      HelpRequested
    );
  });

  it("throws when --input and --stdin-json are combined", () => {
    expect(() =>
      parseCliInput(searchCmd, ["search", "--input", "{}", "--stdin-json"])
    ).toThrow(/Cannot use --input and --stdin-json/);
  });

  it("accepts --json as a no-op global flag", () => {
    const args = parseCliInput(searchCmd, [
      "search",
      "--json",
      "--query",
      "test"
    ]);

    expect(args).toEqual({ query: "test" });
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
