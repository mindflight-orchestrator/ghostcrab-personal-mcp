#!/usr/bin/env node
/**
 * Regenerate docs/reference/operator-catalog.md from tool-manifest + static gcp groups.
 * Run: node scripts/export-operator-catalog.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "docs/reference/operator-catalog.md");

const EXPECTED_TOOL_NAMES = [
  "ghostcrab_collection_facet_search",
  "ghostcrab_collection_reindex",
  "ghostcrab_combined_search",
  "ghostcrab_count",
  "ghostcrab_coverage",
  "ghostcrab_csearch",
  "ghostcrab_ddl_execute",
  "ghostcrab_ddl_list_pending",
  "ghostcrab_ddl_propose",
  "ghostcrab_entity_chunks",
  "ghostcrab_facet_catalog",
  "ghostcrab_facet_inspect",
  "ghostcrab_facet_register",
  "ghostcrab_facet_validate",
  "ghostcrab_graph_diagnostics",
  "ghostcrab_graph_gap_rules",
  "ghostcrab_graph_gap_rules_delete",
  "ghostcrab_graph_gap_rules_import",
  "ghostcrab_graph_path",
  "ghostcrab_graph_reindex",
  "ghostcrab_graph_search",
  "ghostcrab_graph_subgraph",
  "ghostcrab_learn",
  "ghostcrab_loadout_apply",
  "ghostcrab_loadout_inspect",
  "ghostcrab_loadout_list",
  "ghostcrab_loadout_seed",
  "ghostcrab_loadout_suggest",
  "ghostcrab_modeling_guidance",
  "ghostcrab_onboarding_schemas",
  "ghostcrab_pack",
  "ghostcrab_projection_get",
  "ghostcrab_project",
  "ghostcrab_remember",
  "ghostcrab_schema_inspect",
  "ghostcrab_schema_list",
  "ghostcrab_schema_register",
  "ghostcrab_search",
  "ghostcrab_status",
  "ghostcrab_tool_search",
  "ghostcrab_traverse",
  "ghostcrab_upsert",
  "ghostcrab_workspace_create",
  "ghostcrab_workspace_delete",
  "ghostcrab_workspace_export_model",
  "ghostcrab_workspace_export_model_toon",
  "ghostcrab_workspace_inspect",
  "ghostcrab_workspace_list",
  "ghostcrab_workspace_reset",
  "ghostcrab_workspace_use"
];

const BASIC = new Set([
  "ghostcrab_status",
  "ghostcrab_search",
  "ghostcrab_count",
  "ghostcrab_combined_search",
  "ghostcrab_remember",
  "ghostcrab_upsert",
  "ghostcrab_schema_list",
  "ghostcrab_schema_inspect",
  "ghostcrab_pack",
  "ghostcrab_project",
  "ghostcrab_modeling_guidance",
  "ghostcrab_tool_search"
]);

function classifySubsystem(name) {
  if (name.startsWith("ghostcrab_loadout_")) return "loadout";
  if (name.startsWith("ghostcrab_workspace_") || name.startsWith("ghostcrab_ddl_")) {
    return name === "ghostcrab_workspace_use" ? "session" : "workspace";
  }
  if (
    name.startsWith("ghostcrab_status") ||
    name.startsWith("ghostcrab_pack") ||
    name.startsWith("ghostcrab_projection") ||
    name.startsWith("ghostcrab_project") ||
    name.startsWith("ghostcrab_modeling_guidance")
  ) {
    return "pragma";
  }
  if (
    name.startsWith("ghostcrab_traverse") ||
    name.startsWith("ghostcrab_entity_chunks") ||
    name.startsWith("ghostcrab_graph") ||
    name.startsWith("ghostcrab_collection_") ||
    name.startsWith("ghostcrab_coverage") ||
    name.startsWith("ghostcrab_learn")
  ) {
    return "graph";
  }
  return "facets";
}

function classifyAccess(name) {
  if (name === "ghostcrab_workspace_use") return "session";
  if (
    name.includes("_remember") ||
    name.includes("_learn") ||
    name.includes("_upsert") ||
    name.includes("_register") ||
    name.includes("_create") ||
    name.includes("_apply") ||
    name.includes("_seed") ||
    name.includes("_import") ||
    name.includes("_execute")
  ) {
    return "write";
  }
  if (
    name.includes("_project") ||
    name.includes("_ddl_") ||
    name.includes("_propose")
  ) {
    return "model";
  }
  if (name.includes("modeling_guidance") || name.includes("onboarding_schemas")) {
    return "guide";
  }
  return "read";
}

function tablesFor(name, subsystem) {
  if (subsystem === "session") return "— (routing only)";
  if (subsystem === "workspace") {
    if (name.startsWith("ghostcrab_ddl_")) return "pending DDL metadata";
    return "workspace registry";
  }
  if (subsystem === "loadout") return "bootstrap recipes / schemas seed";
  if (subsystem === "pragma") {
    if (name === "ghostcrab_projection_get") return "graph_entity (ProjectionResult)";
    if (name === "ghostcrab_project") return "projections";
    if (name === "ghostcrab_pack") return "projections + agent_facts";
    return "— (diagnostic)";
  }
  if (subsystem === "graph") {
    if (name === "ghostcrab_collection_reindex") return "documents_raw, search_fts, graph";
    if (name.includes("gap_rules")) return "gap_rules store";
    return "entities_raw, relations_raw, graph_entity, graph_relation; facet_assignments_raw (docs)";
  }
  if (name.startsWith("ghostcrab_schema_") || name === "ghostcrab_onboarding_schemas") {
    return "schema registry (agent_facts shapes; not LinkML ontology_*)";
  }
  if (name.startsWith("ghostcrab_facet_")) return "facet catalog metadata";
  return "agent_facts (+ facet_tables FTS when indexed)";
}

const GCP_GROUPS = [
  {
    group: "Start / diagnostics",
    rows: [
      ["gcp", "brain up | up | start", "control-plane", "MCP stdio + backend", "write", "—", "gcp-commands.md"],
      ["gcp", "smoke | status | tools list | tools verify", "control-plane", "—", "read", "—", "gcp-commands.md"],
      ["gcp", "maintenance ddl-approve | ddl-execute", "workspace", "pending DDL", "write", "human approval", "gcp-commands.md"]
    ]
  },
  {
    group: "Workspace",
    rows: [
      ["gcp", "brain workspace create | list", "workspace", "workspace registry", "write", "—", "gcp-commands.md"],
      ["gcp", "init (legacy)", "workspace", "workspace registry", "write", "—", "gcp-commands.md"]
    ]
  },
  {
    group: "Schema registry (not LinkML OWL)",
    rows: [
      ["gcp", "brain schema list | pull | show | remove", "facets", "local schema packs", "read/write", "—", "skillset-demo-import.md"],
      ["gcp", "ontologies … (legacy)", "facets", "local schema packs", "read/write", "—", "gcp-commands.md"]
    ]
  },
  {
    group: "Ontology LinkML / OWL2",
    rows: [
      ["gcp", "brain ontology compile", "ontology", "ontology_* (after --import-db)", "write", "stop MCP", "06-voies-import, ontology/README"],
      ["gcp", "brain ontology import | export", "ontology", "ontology_* / N-Triples", "write", "stop MCP", "ontology/linkml-owl2-pipeline.md"],
      ["gcp", "brain ontology export-linkml", "ontology", "YAML slice export", "read", "—", "ontology/linkml-owl2-pipeline.md"]
    ]
  },
  {
    group: "Structured import",
    rows: [
      ["gcp", "brain structured-import validate | infer | dry-run | profile", "control-plane", "—", "read", "—", "structured-import.md"],
      ["gcp", "brain structured-import register-semantics", "ontology", "table_semantics, source_mappings", "write", "stop MCP", "structured-import.md"],
      ["gcp", "brain structured-import apply | project", "facets+graph", "agent_facts, entities_raw, relations_raw", "write", "stop MCP", "structured-import.md"],
      ["gcp", "brain structured-import reindex", "graph+facets", "graph_entity, facet_postings, FTS", "write", "stop MCP", "structured-import.md"],
      ["gcp", "brain structured-import ddl-propose | ddl-execute | load-ws", "workspace", "ws_* staging", "write", "stop MCP", "structured-import.md"]
    ]
  },
  {
    group: "Document import",
    rows: [
      ["gcp", "brain document document-normalize | document-profile", "control-plane", "files on disk", "write", "optional no DB", "document-import.md"],
      ["gcp", "brain document document-ingest | document-qualify", "ontology+graph", "documents_raw, facet_assignments_raw", "write", "stop MCP", "document-import.md"],
      ["gcp", "brain document qualification-vocab-list", "ontology", "ontology_* taxonomies", "read", "—", "document-import.md"]
    ]
  },
  {
    group: "Backup / demo / IDE",
    rows: [
      ["gcp", "brain backup | export | load", "workspace", "SQLite file / bundles", "write", "stop MCP", "skillset-demo-import.md"],
      ["gcp", "brain docs structured|document|import", "control-plane", "—", "read", "—", "docs/setup/"],
      ["gcp", "brain setup cursor|codex|claude|generic", "control-plane", "IDE MCP config", "write", "—", "gcp-client-setup.md"],
      ["gcp", "agent skills … | equip", "control-plane", "skills registry", "read/write", "—", "skillset-demo-import.md"],
      ["gcp", "env … | authorize | bootstrap | path …", "control-plane", "—", "read/write", "—", "gcp-client-setup.md"]
    ]
  }
];

function mcpTable() {
  const lines = [
    "| Tool | Basic | Subsystem | Access | Tables / impact |",
    "|------|-------|-----------|--------|-----------------|"
  ];
  for (const name of EXPECTED_TOOL_NAMES.sort()) {
    const sub = classifySubsystem(name);
    const acc = classifyAccess(name);
    const basic = BASIC.has(name) ? "yes" : "no";
    lines.push(
      `| \`${name}\` | ${basic} | ${sub} | ${acc} | ${tablesFor(name, sub)} |`
    );
  }
  return lines.join("\n");
}

function gcpTables() {
  const parts = [];
  for (const { group, rows } of GCP_GROUPS) {
    parts.push(`### ${group}\n`);
    parts.push(
      "| Surface | Command | Layer | Impact | Access | Prerequisites | Runbook |"
    );
    parts.push("|---------|---------|-------|--------|--------|---------------|-----------|");
    for (const r of rows) {
      parts.push(`| ${r.join(" | ")} |`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

const md = `# GhostCrab operator catalog (Personal)

> Generated by \`node scripts/export-operator-catalog.mjs\` — do not hand-edit the MCP tools table; re-run the script after tool changes.

Glossary: [explanation/glossary.md](../explanation/glossary.md). JTBD overview: [gcp-commands.md](gcp-commands.md).

**Rule:** \`remember\`, \`upsert\`, \`learn\`, \`project\`, \`pack\`, \`search\`, etc. are **MCP-only** (no \`gcp\` subcommands). Use \`gcp brain up\` then MCP tools for product operations.

---

## Impact matrix columns

| Column | Meaning |
|--------|---------|
| **Layer** | session, facets, graph, ontology (LinkML/OWL2), pragma, workspace, loadout, control-plane |
| **Access** | read, write, model, guide, session |
| **Impact** | SQLite tables or artefacts touched |

---

## A — \`gcp\` commands

${gcpTables()}

---

## B — MCP tools (${EXPECTED_TOOL_NAMES.length} registered)

${mcpTable()}

---

## See also

- [structured-import.md](../setup/structured-import.md)
- [document-import.md](../setup/document-import.md)
- [ontology/README.md](../explanation/ontology/README.md)
- [StarterKit EDITIONS.md](https://gitlab.com/webigniter/starter-kit-ghostcrab-perso/-/blob/main/starterkit/EDITIONS.md)
`;

writeFileSync(outPath, md);
console.log(`Wrote ${outPath} (${EXPECTED_TOOL_NAMES.length} MCP tools)`);
