import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { loadToolManifestFromDist } from "./load-tool-manifest.mjs";
import { listTools, withSmokeClient } from "./mcp-smoke-shared.mjs";

const { manifest } = loadToolManifestFromDist();
const runId = randomUUID().slice(0, 8);
const workspaceId = `mcp-smoke-${runId}`;
const schemaId = `mcp-smoke:${runId}`;
const facetName = `mcp_smoke_${runId}`;
const ontologyId = `${workspaceId}::core`;
const loadoutId = "default-minimal";
const repoRoot = process.cwd();
const ontologyInputPath = join(repoRoot, "ontologies", "immeuble", "core.yaml");

if (!existsSync(ontologyInputPath)) {
  throw new Error(`Missing ontology fixture: ${ontologyInputPath}`);
}

function gapRule(ruleId) {
  return {
    rule_id: ruleId,
    entity_type: "unit",
    relation_type: "owns",
    direction: "in",
    target_entity_type: "person",
    min_count: 1,
    severity: "warning",
    label: "Smoke unit must have an owner"
  };
}

const smokeCalls = [
  [
    "ghostcrab_workspace_create",
    { id: workspaceId, label: "MCP all-tools smoke" }
  ],
  ["ghostcrab_workspace_use", { workspace_id: workspaceId }],
  ["ghostcrab_status", { agent_id: "verify:mcp-all-tools" }],
  ["ghostcrab_workspace_list", {}],
  ["ghostcrab_workspace_inspect", { workspace_id: workspaceId }],
  ["ghostcrab_workspace_export_model", { workspace_id: workspaceId }],
  ["ghostcrab_workspace_export_model_toon", { workspace_id: workspaceId }],
  ["ghostcrab_loadout_list", { workspace_id: workspaceId }],
  ["ghostcrab_loadout_inspect", { loadout_id: loadoutId }],
  ["ghostcrab_loadout_suggest", { goal: "minimal smoke workspace", limit: 1 }],
  [
    "ghostcrab_loadout_apply",
    { workspace_id: workspaceId, loadout_id: loadoutId, overwrite: false }
  ],
  [
    "ghostcrab_loadout_seed",
    {
      workspace_id: workspaceId,
      loadout_id: loadoutId,
      persist_semantics: false
    }
  ],
  [
    "ghostcrab_ontology_import",
    {
      workspace_id: workspaceId,
      ontology_id: ontologyId,
      input_path: ontologyInputPath,
      source_format: "linkml",
      force: true,
      materialize_graph: false
    }
  ],
  ["ghostcrab_ontology_list", { workspace_id: workspaceId }],
  [
    "ghostcrab_ontology_reconcile_report",
    { workspace_id: workspaceId, limit: 5 }
  ],
  [
    "ghostcrab_ontology_reconcile_apply",
    {
      workspace_id: workspaceId,
      ontology_id: ontologyId,
      overwrite_custom: false
    }
  ],
  [
    "ghostcrab_schema_register",
    {
      workspace_id: workspaceId,
      target: "facets",
      definition: {
        schema_id: schemaId,
        description: "MCP all-tools smoke schema"
      }
    }
  ],
  ["ghostcrab_schema_list", { target: "all", summary_only: true }],
  ["ghostcrab_schema_get", { workspace_id: workspaceId, schema_id: schemaId }],
  [
    "ghostcrab_schema_inspect",
    { workspace_id: workspaceId, schema_id: schemaId }
  ],
  [
    "ghostcrab_schema_sync_preview",
    { workspace_id: workspaceId, schema_id: schemaId }
  ],
  [
    "ghostcrab_schema_sync_apply",
    {
      workspace_id: workspaceId,
      schema_id: schemaId,
      action: "create_ontology_from_registry",
      confirm: false
    }
  ],
  ["ghostcrab_onboarding_schemas", {}],
  [
    "ghostcrab_facet_register",
    {
      workspace_id: workspaceId,
      definition: {
        facet_name: facetName,
        label: "MCP smoke facet",
        description: "Temporary facet used by all-tools smoke"
      }
    }
  ],
  ["ghostcrab_facet_catalog", {}],
  [
    "ghostcrab_facet_inspect",
    { workspace_id: workspaceId, facet_name: facetName }
  ],
  [
    "ghostcrab_facet_validate",
    {
      strict: false,
      record: {
        schema_id: schemaId,
        facets: { record_id: `smoke:${runId}`, [facetName]: "ok" }
      }
    }
  ],
  [
    "ghostcrab_remember",
    {
      workspace_id: workspaceId,
      schema_id: schemaId,
      content: "MCP all-tools smoke fact",
      facets: { record_id: `smoke:${runId}`, status: "open" },
      created_by: "verify:mcp-all-tools"
    }
  ],
  [
    "ghostcrab_upsert",
    {
      workspace_id: workspaceId,
      schema_id: schemaId,
      match: { facets: { record_id: `smoke:${runId}` } },
      set_content: "MCP all-tools smoke fact updated",
      set_facets: { status: "updated" },
      create_if_missing: true
    }
  ],
  ["ghostcrab_search", { workspace_id: workspaceId, query: "smoke", limit: 1 }],
  [
    "ghostcrab_csearch",
    { workspace_id: workspaceId, query: "smoke", limit: 1 }
  ],
  [
    "ghostcrab_combined_search",
    { workspace_id: workspaceId, query: "smoke", limit: 1 }
  ],
  [
    "ghostcrab_collection_facet_search",
    {
      workspace_id: workspaceId,
      collection_id: "default",
      facets: {},
      limit: 1
    }
  ],
  [
    "ghostcrab_count",
    { workspace_id: workspaceId, schema_id: schemaId, group_by: ["status"] }
  ],
  [
    "ghostcrab_pack",
    {
      workspace_id: workspaceId,
      agent_id: "verify:mcp-all-tools",
      query: "smoke",
      limit: 1
    }
  ],
  [
    "ghostcrab_project",
    {
      scope: `mcp-smoke-${runId}`,
      content: "MCP all-tools smoke projection",
      proj_type: "STEP",
      status: "active",
      agent_id: "verify:mcp-all-tools"
    }
  ],
  [
    "ghostcrab_projections_list",
    { workspace_id: workspaceId, agent_id: "verify:mcp-all-tools", limit: 1 }
  ],
  [
    "ghostcrab_projection_get",
    {
      workspace_id: workspaceId,
      collection_id: "registry",
      projection_id: "missing"
    }
  ],
  ["ghostcrab_artifact_get", { artifact_id: "missing" }],
  ["ghostcrab_live_refresh", { artifact_id: "missing" }],
  [
    "ghostcrab_modeling_guidance",
    { goal: "model a smoke workspace", detail: "brief" }
  ],
  ["ghostcrab_tool_search", { query: "workspace", limit: 5 }],
  [
    "ghostcrab_business_query_answer",
    { workspace_id: workspaceId, question: "What changed?", dry_run: true }
  ],
  [
    "ghostcrab_business_query_register",
    {
      workspace_id: workspaceId,
      proposal_id: `proposal:${runId}`,
      accepted_by: "verify:mcp-all-tools"
    }
  ],
  [
    "ghostcrab_learn",
    {
      workspace_id: workspaceId,
      node: {
        id: `smoke-node-${runId}`,
        node_type: "unit",
        label: "Smoke Unit"
      }
    }
  ],
  [
    "ghostcrab_graph_search",
    {
      workspace_id: workspaceId,
      query: "Smoke",
      include_relations: true,
      limit: 5
    }
  ],
  [
    "ghostcrab_graph_path",
    {
      workspace_id: workspaceId,
      source: `smoke-node-${runId}`,
      target: `smoke-node-${runId}`,
      max_depth: 2
    }
  ],
  [
    "ghostcrab_graph_subgraph",
    { workspace_id: workspaceId, seed_ids: [1], hops: 1 }
  ],
  [
    "ghostcrab_traverse",
    { workspace_id: workspaceId, start: `smoke-node-${runId}`, depth: 1 }
  ],
  [
    "ghostcrab_entity_chunks",
    { workspace_id: workspaceId, entity_id: 1, limit: 1 }
  ],
  ["ghostcrab_coverage", { workspace_id: workspaceId, domain: workspaceId }],
  ["ghostcrab_graph_reindex", { workspace_id: workspaceId }],
  [
    "ghostcrab_collection_reindex",
    { workspace_id: workspaceId, collection_id: "default", table_id: 1 }
  ],
  ["ghostcrab_reindex_all", { workspace_id: workspaceId }],
  ["ghostcrab_graph_gap_rules", { workspace_id: workspaceId }],
  [
    "ghostcrab_graph_gap_rules_import",
    {
      workspace_id: workspaceId,
      ontology_id: ontologyId,
      validation_mode: "warn",
      rules: [gapRule(`smoke-owner-${runId}`)]
    }
  ],
  ["ghostcrab_graph_diagnostics", { workspace_id: workspaceId, limit: 10 }],
  [
    "ghostcrab_graph_rule_evaluations_run",
    { workspace_id: workspaceId, limit: 10, create_remediation_actions: false }
  ],
  [
    "ghostcrab_graph_rule_evaluations",
    { workspace_id: workspaceId, limit: 10 }
  ],
  ["ghostcrab_graph_rule_events", { workspace_id: workspaceId, limit: 10 }],
  [
    "ghostcrab_graph_gap_rules_delete",
    {
      workspace_id: workspaceId,
      ontology_id: ontologyId,
      rule_ids: [`smoke-owner-${runId}`]
    }
  ],
  [
    "ghostcrab_quality_convergence_run",
    { workspace_id: workspaceId, persist: false, limit: 10 }
  ],
  [
    "ghostcrab_quality_convergence_list",
    { workspace_id: workspaceId, limit: 5 }
  ],
  ["ghostcrab_quality_convergence_get", { run_id: "missing" }],
  ["ghostcrab_quality_remediation_actions", { run_id: "missing" }],
  [
    "ghostcrab_quality_remediation_decide",
    {
      action_id: "missing",
      decision: "rejected",
      actor: "verify:mcp-all-tools"
    }
  ],
  [
    "ghostcrab_quality_remediation_apply",
    { run_id: "missing", action_id: "missing", actor: "verify:mcp-all-tools" }
  ],
  [
    "ghostcrab_ddl_propose",
    {
      workspace_id: workspaceId,
      sql: `CREATE TABLE smoke_${runId} (id TEXT PRIMARY KEY, label TEXT);`,
      rationale: "MCP all-tools smoke"
    }
  ],
  ["ghostcrab_ddl_list_pending", { workspace_id: workspaceId }],
  [
    "ghostcrab_ddl_execute",
    { migration_id: "00000000-0000-0000-0000-000000000000" }
  ],
  ["ghostcrab_workspace_reset", { workspace_id: workspaceId, confirm: true }],
  [
    "ghostcrab_workspace_delete",
    { workspace_id: workspaceId, confirm: true, mode: "hard" }
  ]
];

const terminalBackendCodes = new Set([
  "backend_not_found",
  "backend_error",
  "backend_unavailable",
  "backend_reindex_failed",
  "unknown_tool",
  "validation_error",
  "tool_execution_error"
]);

const acceptedToolErrorCodes = new Map([
  ["ghostcrab_quality_remediation_decide", new Set(["backend_not_found"])]
]);

const timeoutMs = Number.parseInt(
  process.env.MCP_SMOKE_TIMEOUT_MS ?? "10000",
  10
);

async function callToolAny(client, name, args) {
  const result = await withTimeout(
    client.callTool({ name, arguments: args }),
    timeoutMs,
    name
  );
  if (result.structuredContent) return result.structuredContent;

  const textItem = result.content?.find((item) => item.type === "text");
  if (!textItem) {
    return result.isError
      ? {
          ok: false,
          tool: name,
          error: {
            code: "empty_error",
            message: "Tool returned an empty error result."
          }
        }
      : { ok: true, tool: name, output_format: "empty" };
  }

  try {
    return JSON.parse(textItem.text);
  } catch (_error) {
    if (result.isError) {
      return {
        ok: false,
        tool: name,
        error: {
          code: "non_json_error",
          message: textItem.text.slice(0, 200)
        }
      };
    }
    return {
      ok: true,
      tool: name,
      output_format: "text",
      text_preview: textItem.text.slice(0, 120)
    };
  }
}

async function withTimeout(promise, timeout, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new Error(`Timed out while waiting for ${label} after ${timeout}ms`)
        ),
      timeout
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function errorCode(payload) {
  return payload?.error && typeof payload.error === "object"
    ? String(payload.error.code ?? "unknown")
    : "unknown";
}

function compareNames(actual, expected, label) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (JSON.stringify(a) !== JSON.stringify(e)) {
    const actualSet = new Set(a);
    const expectedSet = new Set(e);
    throw new Error(
      `${label} mismatch: missing=${JSON.stringify(e.filter((name) => !actualSet.has(name)))} extra=${JSON.stringify(a.filter((name) => !expectedSet.has(name)))}`
    );
  }
}

function acceptsDomainError(toolName, code) {
  return acceptedToolErrorCodes.get(toolName)?.has(code) === true;
}

const smokeNames = smokeCalls.map(([name]) => name);
compareNames(smokeNames, manifest.names, "all-tools smoke matrix");

const report = {
  ok: true,
  expected_count: manifest.total,
  listed_count: 0,
  called_count: 0,
  failures: [],
  accepted_domain_errors: []
};

await withSmokeClient("verify-mcp-all-tools", async ({ client }) => {
  const listed = await listTools(client);
  report.listed_count = listed.length;
  compareNames(listed, manifest.names, "tools/list");

  for (const [name, args] of smokeCalls) {
    const payload = await callToolAny(client, name, args);
    report.called_count += 1;
    if (payload.ok === true) continue;

    const code = errorCode(payload);
    const entry = {
      tool: name,
      code,
      message: String(payload?.error?.message ?? "")
    };
    if (terminalBackendCodes.has(code) && !acceptsDomainError(name, code)) {
      report.ok = false;
      report.failures.push(entry);
    } else {
      report.accepted_domain_errors.push(entry);
    }
  }
});

if (report.called_count !== manifest.total) {
  report.ok = false;
  report.failures.push({
    tool: "verify-mcp-all-tools",
    code: "incomplete_call_matrix",
    message: `called ${report.called_count}/${manifest.total}`
  });
}

const jsonOutput = process.argv.includes("--json");
if (jsonOutput || !report.ok) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error(
    `[verify-mcp-all-tools] OK - called ${report.called_count}/${report.expected_count} tools; accepted ${report.accepted_domain_errors.length} domain errors.`
  );
}

process.exit(report.ok ? 0 : 1);
