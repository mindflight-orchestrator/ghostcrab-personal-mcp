import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseClient } from "../../src/db/client.js";
import {
  getSessionContext,
  getSessionPinMetadata,
  resetSessionContext
} from "../../src/mcp/session-context.js";
import { resolveInitialSessionContext } from "../../src/mcp/session-context-init.js";

function mockDatabase(existingIds: string[]): DatabaseClient {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM workspaces WHERE id")) {
        const id = params?.[0] as string;
        return existingIds.includes(id) ? [{ id }] : [];
      }
      return [];
    },
    ping: async () => true,
    close: async () => {}
  } as unknown as DatabaseClient;
}

describe("resolveInitialSessionContext", () => {
  afterEach(() => {
    resetSessionContext();
  });

  it("pins from GHOSTCRAB_ACTIVE_WORKSPACE_ID when workspace exists", async () => {
    const result = await resolveInitialSessionContext({
      activeWorkspaceIdFromEnv: "immeuble-demo",
      database: mockDatabase(["default", "immeuble-demo"])
    });
    expect(result.resolved_workspace_id).toBe("immeuble-demo");
    expect(result.pin_source).toBe("env");
    expect(getSessionContext().workspace_id).toBe("immeuble-demo");
    expect(getSessionPinMetadata().pin_status).toBe("resolved");
  });

  it("falls back to default when env workspace missing", async () => {
    const result = await resolveInitialSessionContext({
      activeWorkspaceIdFromEnv: "missing-ws",
      database: mockDatabase(["default"])
    });
    expect(result.resolved_workspace_id).toBe("default");
    expect(result.pin_status).toBe("unresolved");
    expect(getSessionPinMetadata().requested_workspace_id).toBe("missing-ws");
  });

  it("uses CLI slug when env unset and slug exists", async () => {
    const result = await resolveInitialSessionContext({
      cliWorkspaceName: "my-app",
      database: mockDatabase(["default", "my-app"])
    });
    expect(result.resolved_workspace_id).toBe("my-app");
    expect(result.pin_source).toBe("cli_slug");
  });

  it("defaults when no env and slug missing in DB", async () => {
    const result = await resolveInitialSessionContext({
      cliWorkspaceName: "my-app",
      database: mockDatabase(["default"])
    });
    expect(result.resolved_workspace_id).toBe("default");
    expect(result.pin_status).toBe("unresolved");
  });

  it("prefers the env pin over the cli slug when both resolve", async () => {
    const result = await resolveInitialSessionContext({
      activeWorkspaceIdFromEnv: "serenity-coproprietes",
      cliWorkspaceName: "other",
      database: mockDatabase(["default", "serenity-coproprietes", "other"])
    });
    expect(result.resolved_workspace_id).toBe("serenity-coproprietes");
    expect(result.pin_source).toBe("env");
    expect(result.pin_status).toBe("resolved");
  });

  it("resolves a registered workspace_id so facts under it are not orphaned to default", async () => {
    // Reproduces the original failure mode: facts live under
    // "serenity-coproprietes" and the registry row now exists, so the pin holds.
    const result = await resolveInitialSessionContext({
      activeWorkspaceIdFromEnv: "serenity-coproprietes",
      database: mockDatabase(["default", "serenity-coproprietes"])
    });
    expect(result.resolved_workspace_id).toBe("serenity-coproprietes");
    expect(result.pin_status).toBe("resolved");
    expect(getSessionContext().workspace_id).toBe("serenity-coproprietes");
  });
});
