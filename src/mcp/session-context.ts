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

let currentContext: SessionContext = {
  workspace_id: "default",
  schema_id: null
};

/** Returns a snapshot of the current session context (shallow copy). */
export function getSessionContext(): SessionContext {
  return { ...currentContext };
}

/** Overwrites the session context. Call from ghostcrab_workspace_use. */
export function setSessionContext(
  workspace_id: string,
  schema_id?: string | null
): SessionContext {
  currentContext = {
    workspace_id,
    schema_id: schema_id ?? null
  };
  return { ...currentContext };
}

/** Resets to factory defaults (useful in tests). */
export function resetSessionContext(): void {
  currentContext = { workspace_id: "default", schema_id: null };
}
