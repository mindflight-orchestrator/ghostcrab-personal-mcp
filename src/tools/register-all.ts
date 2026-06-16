import "./dgraph/coverage.js";
import "./dgraph/diagnostics.js";
import "./dgraph/entity-chunks.js";
import "./dgraph/graph-path.js";
import "./dgraph/graph-reindex.js";
import "./dgraph/collection-reindex.js";
import "./dgraph/workspace-reindex-all.js";
import "./dgraph/graph-search.js";
import "./dgraph/graph-subgraph.js";
import "./dgraph/learn.js";
import "./dgraph/traverse.js";
import "./facets/collection-search.js";
import "./facets/count.js";
import "./facets/catalog.js";
import "./facets/remember.js";
import "./facets/schema.js";
import "./facets/search.js";
import "./facets/upsert.js";
import "./business-query-learning/register-proposal.js";
import "./business-query-learning/index.js";
import "./business-query-router/index.js";
import "./ontology/import.js";
import "./ontology/list.js";
import "./ontology/reconciliation.js";
import "./pragma/artifact-get.js";
import "./pragma/guidance.js";
import "./pragma/live-refresh.js";
import "./pragma/pack.js";
import "./pragma/projection-get.js";
import "./pragma/projections-list.js";
import "./pragma/project.js";
import "./pragma/status.js";
import "./quality/convergence.js";
import "./search/combined-search.js";
import "./workspace/use.js";
import "./workspace/create.js";
import "./workspace/delete.js";
import "./workspace/ddl.js";
import "./workspace/export.js";
import "./workspace/export-toon.js";
import "./workspace/inspect.js";
import "./workspace/list.js";
import "./workspace/reset.js";
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
