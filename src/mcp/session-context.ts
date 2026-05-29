/**
 * In-memory session context for the MCP server process.
 *
 * One shared object per `gcp brain up` / `gcp serve` process — not isolated between chat tabs
 * that share the same MCP server entry. For isolation, use per-call overrides
 * or separate MCP server entries (`--workspace`).
 *
 * Reset to defaults on process restart.
 */

export interface SessionContext {
  /** Active workspace id. Defaults to "default". */
  workspace_id: string;
  /** Active schema filter. null means no filter. */
  schema_id: string | null;
}

export type SessionPinSource = "env" | "cli_slug" | "default";

export type SessionPinStatus = "resolved" | "unresolved";

export interface SessionPinMetadata {
  source: SessionPinSource;
  requested_workspace_id?: string;
  resolved_workspace_id: string;
  pin_status: SessionPinStatus;
  cli_workspace_name: string | null;
  /** Set when ghostcrab_workspace_use changes workspace away from startup pin. */
  workspace_switched_at?: string;
  pinned_workspace_id?: string;
}

let currentContext: SessionContext = {
  workspace_id: "default",
  schema_id: null
};

let pinMetadata: SessionPinMetadata = {
  source: "default",
  resolved_workspace_id: "default",
  pin_status: "resolved",
  cli_workspace_name: null
};

/** Returns a snapshot of the current session context (shallow copy). */
export function getSessionContext(): SessionContext {
  return { ...currentContext };
}

export function getSessionPinMetadata(): SessionPinMetadata {
  return { ...pinMetadata };
}

export function setSessionPinMetadata(metadata: SessionPinMetadata): void {
  pinMetadata = { ...metadata };
  if (!pinMetadata.pinned_workspace_id) {
    pinMetadata.pinned_workspace_id = metadata.resolved_workspace_id;
  }
}

/** Overwrites the session context. Call from ghostcrab_workspace_use. */
export function setSessionContext(
  workspace_id: string,
  schema_id?: string | null
): SessionContext {
  const prev = currentContext.workspace_id;
  currentContext = {
    workspace_id,
    schema_id: schema_id ?? null
  };

  if (
    workspace_id !== prev &&
    pinMetadata.pinned_workspace_id &&
    workspace_id !== pinMetadata.pinned_workspace_id
  ) {
    pinMetadata = {
      ...pinMetadata,
      workspace_switched_at: new Date().toISOString()
    };
  }

  return { ...currentContext };
}

/** Resets to factory defaults (useful in tests). */
export function resetSessionContext(): void {
  currentContext = { workspace_id: "default", schema_id: null };
  pinMetadata = {
    source: "default",
    resolved_workspace_id: "default",
    pin_status: "resolved",
    cli_workspace_name: null
  };
}
