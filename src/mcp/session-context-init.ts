import type { DatabaseClient } from "../db/client.js";
import {
  getSessionPinMetadata,
  setSessionContext,
  setSessionPinMetadata,
  type SessionPinSource
} from "./session-context.js";

export interface ResolveInitialSessionContextInput {
  activeWorkspaceIdFromEnv?: string;
  cliWorkspaceName?: string;
  database: DatabaseClient;
}

export interface ResolveInitialSessionContextResult {
  resolved_workspace_id: string;
  pin_source: SessionPinSource;
  requested_workspace_id?: string;
  pin_status: "resolved" | "unresolved";
}

async function workspaceExists(
  database: DatabaseClient,
  workspaceId: string
): Promise<boolean> {
  const rows = await database.query<{ id: string }>(
    `SELECT id FROM workspaces WHERE id = ?`,
    [workspaceId]
  );
  return rows.length > 0;
}

/**
 * Pin MindBrain workspace_id at MCP startup from env or CLI workspace slug.
 */
export async function resolveInitialSessionContext(
  input: ResolveInitialSessionContextInput
): Promise<ResolveInitialSessionContextResult> {
  const envId = input.activeWorkspaceIdFromEnv?.trim();
  const cliSlug = input.cliWorkspaceName?.trim();

  if (envId) {
    if (await workspaceExists(input.database, envId)) {
      setSessionContext(envId);
      setSessionPinMetadata({
        source: "env",
        requested_workspace_id: envId,
        resolved_workspace_id: envId,
        pin_status: "resolved",
        cli_workspace_name: cliSlug ?? null
      });
      return {
        resolved_workspace_id: envId,
        pin_source: "env",
        requested_workspace_id: envId,
        pin_status: "resolved"
      };
    }

    setSessionContext("default");
    setSessionPinMetadata({
      source: "env",
      requested_workspace_id: envId,
      resolved_workspace_id: "default",
      pin_status: "unresolved",
      cli_workspace_name: cliSlug ?? null
    });
    return {
      resolved_workspace_id: "default",
      pin_source: "env",
      requested_workspace_id: envId,
      pin_status: "unresolved"
    };
  }

  if (cliSlug) {
    if (await workspaceExists(input.database, cliSlug)) {
      setSessionContext(cliSlug);
      setSessionPinMetadata({
        source: "cli_slug",
        requested_workspace_id: cliSlug,
        resolved_workspace_id: cliSlug,
        pin_status: "resolved",
        cli_workspace_name: cliSlug
      });
      return {
        resolved_workspace_id: cliSlug,
        pin_source: "cli_slug",
        requested_workspace_id: cliSlug,
        pin_status: "resolved"
      };
    }

    setSessionContext("default");
    setSessionPinMetadata({
      source: "cli_slug",
      requested_workspace_id: cliSlug,
      resolved_workspace_id: "default",
      pin_status: "unresolved",
      cli_workspace_name: cliSlug
    });
    return {
      resolved_workspace_id: "default",
      pin_source: "cli_slug",
      requested_workspace_id: cliSlug,
      pin_status: "unresolved"
    };
  }

  setSessionContext("default");
  setSessionPinMetadata({
    source: "default",
    resolved_workspace_id: "default",
    pin_status: "resolved",
    cli_workspace_name: null
  });
  return {
    resolved_workspace_id: "default",
    pin_source: "default",
    pin_status: "resolved"
  };
}

export { getSessionPinMetadata };
