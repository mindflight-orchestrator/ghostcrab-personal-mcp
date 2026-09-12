import type { DatabaseClient } from "./client.js";
import { resolveGhostcrabConfig } from "../config/env.js";
import {
  ensureFactsFtsSync,
  type FactsFtsSyncSummary
} from "./facets-fts-sync.js";
import { runStandaloneKnowledge } from "./standalone-mindbrain.js";
import { setNativeFactIndexOwned } from "../runtime/facets-fts-state.js";

/** Explicit startup/maintenance write phase. Never called by a read handler. */
export async function reconcileWorkspaceFacts(
  database: DatabaseClient,
  workspaceId: string
): Promise<FactsFtsSyncSummary> {
  const config = resolveGhostcrabConfig();
  const args = {
    mindbrainUrl: config.mindbrainUrl,
    timeoutMs: config.mindbrainHttpTimeoutMs
  };
  const empty = {
    ready: false,
    registered: false,
    documentsInserted: 0,
    ftsDocsInserted: 0,
    ftsRowsInserted: 0,
    error: null as string | null
  };
  try {
    const capabilities = await runStandaloneKnowledge<{
      features?: Record<string, boolean>;
    }>({ ...args, operation: "capabilities" });
    const native = capabilities.features?.native_fact_index === true;
    setNativeFactIndexOwned(native);
    if (!native) return ensureFactsFtsSync(database, undefined, workspaceId);
    const result = await runStandaloneKnowledge<{
      after: { ready: boolean };
      indexed: number;
    }>({ ...args, operation: "facts_reindex", workspaceId });
    return {
      ...empty,
      ready: result.after.ready,
      documentsInserted: result.indexed,
      error: result.after.ready ? null : "Native fact index is incomplete"
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
