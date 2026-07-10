import { resolveGhostcrabConfig } from "../config/env.js";
import {
  getSessionContext,
  getSessionPinMetadata,
  type SessionPinMetadata
} from "./session-context.js";

export interface WorkspaceContextStatus {
  pin_source: SessionPinMetadata["source"];
  requested_workspace_id?: string;
  pinned_workspace_id?: string;
  cli_workspace_name: string | null;
  sqlite_path_source: string;
  switch_policy: "intentional_switch_allowed";
  pin_status: SessionPinMetadata["pin_status"];
  workspace_switched_at?: string;
}

function deriveSqlitePathSource(
  config: ReturnType<typeof resolveGhostcrabConfig>
): string {
  if (process.env.GHOSTCRAB_SQLITE_PATH?.trim()) {
    return "GHOSTCRAB_SQLITE_PATH";
  }
  if (config.cliWorkspaceName) {
    return `CLI workspace "${config.cliWorkspaceName}"`;
  }
  return "default (~/.ghostcrab/databases/ghostcrab.sqlite unless overridden)";
}

export function buildWorkspaceContextStatus(): WorkspaceContextStatus {
  const pin = getSessionPinMetadata();
  const config = resolveGhostcrabConfig();

  return {
    pin_source: pin.source,
    requested_workspace_id: pin.requested_workspace_id,
    pinned_workspace_id: pin.pinned_workspace_id,
    cli_workspace_name: pin.cli_workspace_name,
    sqlite_path_source: deriveSqlitePathSource(config),
    switch_policy: "intentional_switch_allowed",
    pin_status: pin.pin_status,
    ...(pin.workspace_switched_at
      ? { workspace_switched_at: pin.workspace_switched_at }
      : {})
  };
}

export function buildWorkspaceContextDirectives(): string[] {
  const pin = getSessionPinMetadata();
  const session = getSessionContext();
  const directives: string[] = [];

  if (pin.pin_status === "unresolved") {
    directives.push(
      `Requested workspace '${pin.requested_workspace_id}' was not found — active session fell back to '${session.workspace_id}'. ` +
        `Call ghostcrab_workspace_list to see valid workspace_ids; do not open the SQLite file directly.`
    );
  }

  if (
    pin.pinned_workspace_id &&
    pin.workspace_switched_at &&
    session.workspace_id !== pin.pinned_workspace_id
  ) {
    directives.push(
      `Session workspace changed from pinned '${pin.pinned_workspace_id}' to '${session.workspace_id}' at ${pin.workspace_switched_at}. ` +
        `Confirm with the user that this switch is intentional before writing.`
    );
  }

  return directives;
}

export const WORKSPACE_CONTEXT_DISCIPLINE = [
  "Workspace context discipline:",
  "  Always read active_workspace_id in ghostcrab_status before writes.",
  "  Intentional switch: ghostcrab_workspace_list → announce to user → ghostcrab_workspace_use → re-read status.",
  "  Forbidden: switching workspace on empty reads, tool errors, or backend failures.",
  "  Forbidden for agents: sqlite3, reading .sqlite files, gcp brain document/SQL shell to read data — use MCP tools only."
].join("\n");
