import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// These spies are defined at module scope so the vi.mock factories (which are
// hoisted) can close over them. The actual implementations are reset in
// beforeEach so each test starts clean.
const connectSpy = vi.fn();
const maybeSendStartupPingSpy = vi.fn(
  () => new Promise<void>(() => undefined)
);
const pingMock = vi.fn(async () => true);
const bootstrapMock = vi.fn(async () => ({
  insertedSystemEntries: 0,
  insertedSchemas: 0,
  insertedOntologies: 0,
  insertedProductRecords: 0,
  insertedGraphNodes: 0,
  insertedGraphEdges: 0,
  insertedAgentStates: 0,
  insertedProjections: 0,
  skipped: 0
}));

// Captures Server constructor args so tests can inspect instructions.
const capturedServerArgs: unknown[][] = [];

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: class {
    constructor(...args: unknown[]) {
      capturedServerArgs.push(args);
    }

    setRequestHandler(): void {
      // no-op for unit test
    }

    async connect(): Promise<void> {
      connectSpy();
    }
  }
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {
    onclose?: () => void;
    onerror?: (error: unknown) => void;
  }
}));

vi.mock("../../src/bootstrap/seed.js", () => ({
  ensureBootstrapData: bootstrapMock
}));

vi.mock("../../src/config/env.js", () => ({
  redactDatabaseUrl: vi.fn(() => "postgres://ghostcrab:***@localhost:5432/ghostcrab"),
  resolveGhostcrabConfig: vi.fn(() => ({
    databaseKind: "sqlite",
    databaseUrl: "postgres://ghostcrab:ghostcrab@localhost:5432/ghostcrab",
    embeddingApiKey: undefined,
    embeddingBaseUrl: undefined,
    embeddingDimensions: 1536,
    embeddingFixturePath: undefined,
    embeddingModel: undefined,
    embeddingTimeoutMs: 30000,
    embeddingsMode: "disabled",
    hybridBm25Weight: 0.6,
    hybridVectorWeight: 0.4,
    nativeExtensionsMode: "auto",
    nodeEnv: "test",
    pgPoolMax: 10,
    resolvedConfigPath: undefined,
    sqlitePath: "/tmp/ghostcrab-test.sqlite",
    telemetryEnabled: true,
    telemetryEndpoint: "https://telemetry.example.com/v1/ping",
    telemetryTimeoutMs: 1500,
    telemetryStateDir: "/tmp/ghostcrab-telemetry-test",
    telemetryDebug: false,
    agentHost: undefined,
    agentHostSource: undefined,
    executionMode: undefined
  }))
}));

vi.mock("../../src/db/client.js", () => ({
  createDatabaseClient: vi.fn(() => ({
    kind: "sqlite",
    close: vi.fn(async () => undefined),
    ping: pingMock,
    query: vi.fn(async () => []),
    transaction: vi.fn(async (operation: (queryable: unknown) => Promise<unknown>) =>
      operation({ kind: "sqlite", query: vi.fn(async () => []) })
    )
  }))
}));

vi.mock("../../src/db/embedding-dimension.js", () => ({
  getFacetsEmbeddingColumnDimension: vi.fn(async () => null)
}));

vi.mock("../../src/db/extension-probe.js", () => ({
  resolveExtensionCapabilities: vi.fn(async () => ({
    pgFacets: false,
    pgDgraph: false,
    pgPragma: false
  }))
}));

vi.mock("../../src/embeddings/provider.js", () => ({
  createEmbeddingProvider: vi.fn(() => ({}))
}));

vi.mock("../../src/tools/register-all.js", () => ({
  registerAllTools: vi.fn(() => undefined)
}));

vi.mock("../../src/tools/registry.js", () => ({
  createToolErrorResult: vi.fn(),
  createToolSuccessResult: vi.fn(),
  getRegisteredTool: vi.fn(),
  listRegisteredTools: vi.fn(() => [])
}));

vi.mock("../../src/version.js", () => ({
  getPackageVersion: vi.fn(async () => "0.1.0")
}));

vi.mock("../../src/telemetry/index.js", () => ({
  maybeSendStartupPing: maybeSendStartupPingSpy
}));

describe("startMcpServer", () => {
  beforeEach(() => {
    connectSpy.mockReset();
    maybeSendStartupPingSpy.mockClear();
    pingMock.mockReset();
    pingMock.mockResolvedValue(true);
    bootstrapMock.mockReset();
    bootstrapMock.mockResolvedValue({
      insertedSystemEntries: 0,
      insertedSchemas: 0,
      insertedOntologies: 0,
      insertedProductRecords: 0,
      insertedGraphNodes: 0,
      insertedGraphEdges: 0,
      insertedAgentStates: 0,
      insertedProjections: 0,
      skipped: 0
    });
    capturedServerArgs.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not await the startup telemetry ping before connecting the server", async () => {
    const { startMcpServer } = await import("../../src/server.js");

    const result = await Promise.race([
      startMcpServer().then(() => "done"),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 100);
      })
    ]);

    expect(result).toBe("done");
    expect(maybeSendStartupPingSpy).toHaveBeenCalledWith(
      expect.any(Object),
      true
    );
    expect(connectSpy).toHaveBeenCalledOnce();
  });

  it("connects transport and runs SQLite bootstrap", async () => {
    const callOrder: string[] = [];

    connectSpy.mockImplementation(() => {
      callOrder.push("connect");
    });

    bootstrapMock.mockImplementation(async () => {
      callOrder.push("bootstrap");
      return {
        insertedSystemEntries: 0,
        insertedSchemas: 0,
        insertedOntologies: 0,
        insertedProductRecords: 0,
        insertedGraphNodes: 0,
        insertedGraphEdges: 0,
        insertedAgentStates: 0,
        insertedProjections: 0,
        skipped: 0
      };
    });

    const { startMcpServer } = await import("../../src/server.js");
    await startMcpServer();

    expect(callOrder).toEqual(["connect", "bootstrap"]);
  });

  it("starts in degraded mode without crashing when database is unreachable", async () => {
    pingMock.mockResolvedValue(false);

    const { startMcpServer } = await import("../../src/server.js");

    await expect(startMcpServer()).resolves.toBeUndefined();
    expect(connectSpy).toHaveBeenCalledOnce();
  });

  it("includes a backend-unreachable warning in MCP server instructions when backend is down", async () => {
    pingMock.mockResolvedValue(false);

    const { startMcpServer } = await import("../../src/server.js");
    await startMcpServer();

    expect(capturedServerArgs.length).toBeGreaterThan(0);
    const [, serverOptions] = capturedServerArgs[0] as [
      unknown,
      { instructions?: string }
    ];
    expect(serverOptions.instructions).toContain("WARNING: backend is unreachable");
  });
});
