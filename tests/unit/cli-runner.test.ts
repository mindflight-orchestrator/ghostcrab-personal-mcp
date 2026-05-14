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

  it("prints smoke help for smoke --help", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["smoke", "--help"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: ghostcrab smoke [--verbose]")
    );
  });

  it("returns unknown tool exit code for MCP-only CLI aliases", async () => {
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
      "Command 'schema' is MCP-only. Start GhostCrab with 'ghostcrab serve' and call the corresponding ghostcrab_* MCP tool instead."
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
          result: createToolSuccessResult("ghostcrab_status", { runtime: {} }),
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

    await runCli(["status", "--agent-id", "agent:self", "--json"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('"runtime":{}')
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
      result: createToolSuccessResult("ghostcrab_status", { echoed: true }),
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
          yield Buffer.from('{"agent_id":"from-stdin"}');
        }
      }
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["status", "--stdin-json", "--agent-id", "ignored"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(executeTool).toHaveBeenCalledWith(
      "ghostcrab_status",
      { agent_id: "from-stdin" },
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

    await runCli(["status", "--stdin-json"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error: --stdin-json was set but stdin was empty."
    );
  });

  it("runs read-only smoke through ghostcrab_status", async () => {
    vi.doMock("../../src/cli/context.js", () => ({
      initToolContext: vi.fn(async () => ({
        toolContext: {} as object,
        cleanup: async () => undefined
      }))
    }));
    const executeTool = vi.fn(async () => ({
      result: createToolSuccessResult("ghostcrab_status", {
        tool: "ghostcrab_status"
      }),
      exitCode: 0
    }));
    vi.doMock("../../src/cli/execute.js", async () => {
      const actual = await vi.importActual("../../src/cli/execute.js");
      return {
        ...actual,
        executeTool
      };
    });
    vi.doMock("../../src/version.js", () => ({
      getPackageVersion: vi.fn(async () => "9.9.9-test")
    }));

    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["smoke"]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(executeTool).toHaveBeenCalledWith(
      "ghostcrab_status",
      { agent_id: "ghostcrab:cli-smoke" },
      expect.anything()
    );
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('"backend_reachable":true')
    );
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('"version":"9.9.9-test"')
    );
  });

  it("reports structured smoke failure when backend context cannot initialize", async () => {
    vi.doMock("../../src/cli/context.js", () => ({
      initToolContext: vi.fn(async () => {
        throw new Error("backend unavailable");
      })
    }));
    vi.doMock("../../src/version.js", () => ({
      getPackageVersion: vi.fn(async () => "9.9.9-test")
    }));

    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const { runCli } = await import("../../src/cli/runner.js");

    await runCli(["smoke"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('"backend_reachable":false')
    );
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining("backend unavailable")
    );
  });
});
