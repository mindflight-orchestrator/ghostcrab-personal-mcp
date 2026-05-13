import "./dgraph/coverage.js";
import "./dgraph/entity-chunks.js";
import "./dgraph/graph-reindex.js";
import "./dgraph/graph-search.js";
import "./dgraph/learn.js";
import "./dgraph/traverse.js";
import "./facets/count.js";
import "./facets/catalog.js";
import "./facets/geo.js";
import "./facets/hierarchy.js";
import "./facets/remember.js";
import "./facets/schema.js";
import "./facets/search.js";
import "./facets/upsert.js";
import "./pragma/guidance.js";
import "./pragma/pack.js";
import "./pragma/projection-get.js";
import "./pragma/project.js";
import "./pragma/status.js";
import "./workspace/create.js";
import "./workspace/ddl.js";
import "./workspace/export.js";
import "./workspace/export-toon.js";
import "./workspace/inspect.js";
import "./workspace/list.js";
import "./workspace/loadout-seed.js";
import "./workspace/loadouts.js";
import "./tool-search.js";

/**
 * Ensures all MCP tool modules are loaded so their `registerTool` side effects run.
 * Safe to call multiple times: tool modules are cached; duplicate registration throws.
 */
export function registerAllTools(): void {
  // Side-effect imports above register all tools in the registry.
}
