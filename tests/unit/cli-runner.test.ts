import { beforeEach, describe, expect, it, vi } from "vitest";

import { createToolSuccessResult } from "../../src/tools/registry.js";

describe("runCli", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("prints global help for --help", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["--help"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: ghostcrab <command> [options]")
    );
  });

  it("prints schema group help for schema --help", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["schema", "--help"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: ghostcrab schema <subcommand> [options]")
    );
  });

  it("returns unknown tool exit code for bare schema command", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["schema"]);

    expect(exitSpy).toHaveBeenCalledWith(3);
    expect(errorSpy).toHaveBeenCalledWith(
      "Unknown schema subcommand. Run ghostcrab schema --help for usage."
    );
  });

  it("extractStructuredJson prefers structuredContent when available", async () => {
    const { extractStructuredJson } = await import("../../src/cli/runner.js");

    expect(
      extractStructuredJson(
        createToolSuccessResult("ghostcrab_test", { value: 1, note: "ok" })
      )
    ).toMatchObject({ value: 1, note: "ok" });
  });

  it("extractStructuredJson falls back to parsing text content", async () => {
    const { extractStructuredJson } = await import("../../src/cli/runner.js");

    expect(
      extractStructuredJson({
        content: [{ type: "text", text: '{"ok":true,"value":2}' }],
        isError: false
      })
    ).toEqual({ ok: true, value: 2 });
  });

  it("keeps --json as a silent no-op and emits compact JSON by default", async () => {
    vi.doMock("../../src/cli/context.js", () => ({
      initToolContext: vi.fn(async () => ({
        toolContext: {} as object,
        cleanup: async () => undefined
      }))
    }));
    vi.doMock("../../src/cli/execute.js", async () => {
      const actual = await vi.importActual("../../src/cli/execute.js");
      return {
        ...actual,
        executeTool: vi.fn(async () => ({
          result: createToolSuccessResult("ghostcrab_search", { returned: 1 }),
          exitCode: 0
        }))
      };
    });

    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["search", "--query", "memory", "--json"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('"returned":1')
    );
  });

  it("uses stdin-json payload and ignores additional flags", async () => {
    vi.doMock("../../src/cli/context.js", () => ({
      initToolContext: vi.fn(async () => ({
        toolContext: {} as object,
        cleanup: async () => undefined
      }))
    }));
    const executeTool = vi.fn(async () => ({
      result: createToolSuccessResult("ghostcrab_search", { echoed: true }),
      exitCode: 0
    }));
    vi.doMock("../../src/cli/execute.js", async () => {
      const actual = await vi.importActual("../../src/cli/execute.js");
      return {
        ...actual,
        executeTool
      };
    });
    Object.defineProperty(process, "stdin", {
      configurable: true,
      value: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('{"query":"from-stdin","limit":4}');
        }
      }
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["search", "--stdin-json", "--query", "ignored"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(executeTool).toHaveBeenCalledWith(
      "ghostcrab_search",
      { query: "from-stdin", limit: 4 },
      expect.anything()
    );
  });

  it("fails clearly when stdin-json is empty", async () => {
    Object.defineProperty(process, "stdin", {
      configurable: true,
      value: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from("");
        }
      }
    });
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["search", "--stdin-json"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error: --stdin-json was set but stdin was empty."
    );
  });
});
