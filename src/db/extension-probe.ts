/**
 * Legacy PG-extension capability shape kept only as a placeholder until Phase 4
 * removes `extensions` / `nativeExtensionsMode` from the tool execution context.
 *
 * GhostCrab is mono-backend (SQLite); every PG extension is permanently false.
 * No probe, no reconciliation, no dispatch.
 */
export interface ExtensionCapabilities {
  pgFacets: boolean;
  pgDgraph: boolean;
  pgPragma: boolean;
  pgMindbrain?: boolean;
}
