#!/usr/bin/env node
/**
 * Regenerate docs/reference/operator-catalog.md from tool-manifest + static gcp groups.
 * Run: node scripts/export-operator-catalog.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadToolManifestFromDist } from "./load-tool-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readSurfaceVersion() {
  const src = readFileSync(join(root, "src/version.ts"), "utf8");
  const match = src.match(/GHOSTCRAB_MCP_SURFACE_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(
      "GHOSTCRAB_MCP_SURFACE_VERSION not found in src/version.ts"
    );
  }
  return match[1];
}

const surfaceVersion = readSurfaceVersion();
const generatedAt = new Date().toISOString();
const outPath = join(root, "docs/reference/operator-catalog.md");
const mcpOutPath = join(root, "docs/reference/mcp-tools.md");

const { manifest, catalog } = loadToolManifestFromDist();

function tablesFor(name, subsystem) {
  if (subsystem === "session") return "— (routing only)";
  if (subsystem === "workspace") {
    if (name.startsWith("ghostcrab_ddl_")) return "pending DDL metadata";
    return "workspace registry";
  }
  if (subsystem === "loadout") return "bootstrap recipes / schemas seed";
  if (subsystem === "pragma") {
    if (name === "ghostcrab_artifact_get") {
      return "mindbrain_answer_artifacts";
    }
    if (name === "ghostcrab_live_refresh") {
      return "mindbrain_answer_artifacts, mindbrain_answer_events";
    }
    if (name === "ghostcrab_projection_get")
      return "graph_entity (ProjectionResult)";
    if (name === "ghostcrab_projections_list") {
      return "mindbrain_answer_artifacts, graph_entity (ProjectionResult)";
    }
    if (name === "ghostcrab_project") return "projections";
    if (name === "ghostcrab_pack") return "projections + agent_facts";
    return "— (diagnostic)";
  }
  if (subsystem === "graph") {
    if (name === "ghostcrab_collection_reindex")
      return "documents_raw, search_fts, graph";
    if (name.includes("gap_rules")) return "gap_rules store";
    if (name === "ghostcrab_graph_rule_evaluations_run") {
      return "graph_rule_evaluations, graph_rule_events; optional quality_remediation_action";
    }
    if (name === "ghostcrab_graph_rule_evaluations")
      return "graph_rule_evaluations";
    if (name === "ghostcrab_graph_rule_events") return "graph_rule_events";
    return "entities_raw, relations_raw, graph_entity, graph_relation; facet_assignments_raw (docs)";
  }
  if (subsystem === "ontology") {
    if (name === "ghostcrab_ontology_import") {
      return "ontology_* native tables; optional graph materialization for N-Triples";
    }
    return "ontology_*";
  }
  if (
    name.startsWith("ghostcrab_schema_") ||
    name === "ghostcrab_onboarding_schemas"
  ) {
    return "schema registry (agent_facts shapes; not LinkML ontology_*)";
  }
  if (name.startsWith("ghostcrab_facet_")) return "facet catalog metadata";
  return "agent_facts (+ facet_tables FTS when indexed)";
}

const GCP_GROUPS = [
  {
    group: "Start / diagnostics",
    rows: [
      [
        "gcp",
        "brain up | up | start",
        "control-plane",
        "MCP stdio + backend",
        "write",
        "—",
        "gcp-commands.md"
      ],
      [
        "gcp",
        "smoke | status | tools list | tools verify",
        "control-plane",
        "package/runtime/tool catalog",
        "read",
        "—",
        "gcp-commands.md"
      ],
      [
        "gcp",
        "brain db-who",
        "control-plane",
        "SQLite file holders via lsof",
        "read",
        "lsof on host",
        "gcp-commands.md"
      ],
      [
        "gcp",
        "maintenance ddl-approve | ddl-execute",
        "workspace",
        "pending DDL",
        "write",
        "human approval",
        "gcp-commands.md"
      ]
    ]
  },
  {
    group: "Workspace",
    rows: [
      [
        "gcp",
        "brain workspace create | list",
        "workspace",
        "workspace registry",
        "write/read",
        "—",
        "gcp-commands.md"
      ],
      [
        "ghostcrab",
        "workspace reset | delete",
        "workspace",
        "workspace-scoped data",
        "write",
        "explicit workspace id",
        "gcp-commands.md"
      ],
      [
        "gcp",
        "init (legacy)",
        "workspace",
        "workspace registry",
        "write",
        "—",
        "gcp-commands.md"
      ]
    ]
  },
  {
    group: "Schema registry (not LinkML OWL)",
    rows: [
      [
        "gcp",
        "brain schema list | pull | show | remove",
        "facets",
        "local schema packs",
        "read/write",
        "—",
        "skillset-demo-import.md"
      ],
      [
        "gcp",
        "ontologies … (legacy)",
        "facets",
        "local schema packs",
        "read/write",
        "—",
        "gcp-commands.md"
      ]
    ]
  },
  {
    group: "Ontology LinkML / OWL2",
    rows: [
      [
        "gcp",
        "brain ontology compile",
        "ontology",
        "ontology_* (after --import-db)",
        "write",
        "stop MCP",
        "06-voies-import, ontology/README"
      ],
      [
        "gcp",
        "brain ontology import | export",
        "ontology",
        "ontology_* / N-Triples",
        "write",
        "stop MCP",
        "ontology/linkml-owl2-pipeline.md"
      ],
      [
        "gcp",
        "brain ontology export-linkml",
        "ontology",
        "YAML slice export",
        "read",
        "—",
        "ontology/linkml-owl2-pipeline.md"
      ]
    ]
  },
  {
    group: "Structured import",
    rows: [
      [
        "gcp",
        "brain structured-import validate | infer | dry-run | profile",
        "control-plane",
        "—",
        "read",
        "—",
        "structured-import.md"
      ],
      [
        "gcp",
        "brain structured-import register-semantics",
        "ontology",
        "table_semantics, source_mappings",
        "write",
        "stop MCP",
        "structured-import.md"
      ],
      [
        "gcp",
        "brain structured-import apply | project",
        "facets+graph",
        "agent_facts, entities_raw, relations_raw",
        "write",
        "stop MCP",
        "structured-import.md"
      ],
      [
        "gcp",
        "brain structured-import reindex",
        "graph+facets",
        "graph_entity, facet_postings, FTS",
        "write",
        "stop MCP",
        "structured-import.md"
      ],
      [
        "gcp",
        "brain structured-import ddl-propose | ddl-execute | load-ws",
        "workspace",
        "ws_* staging",
        "write",
        "stop MCP",
        "structured-import.md"
      ]
    ]
  },
  {
    group: "Document import",
    rows: [
      [
        "gcp",
        "brain document document-normalize | document-profile",
        "control-plane",
        "files on disk",
        "write",
        "optional no DB",
        "document-import.md"
      ],
      [
        "gcp",
        "brain document document-ingest | document-qualify",
        "ontology+graph",
        "documents_raw, facet_assignments_raw",
        "write",
        "stop MCP",
        "document-import.md"
      ],
      [
        "gcp",
        "brain document qualification-vocab-list",
        "ontology",
        "ontology_* taxonomies",
        "read",
        "—",
        "document-import.md"
      ]
    ]
  },
  {
    group: "Answer artifacts",
    rows: [
      [
        "gcp",
        "brain artifact list | get",
        "pragma",
        "mindbrain_answer_artifacts",
        "read",
        "backend running",
        "gcp-commands.md"
      ],
      [
        "gcp",
        "brain artifact refresh | events",
        "pragma",
        "mindbrain_answer_artifacts, mindbrain_answer_events",
        "write/read",
        "backend running; refresh requires one exact live_answer_view id; no wildcards",
        "gcp-commands.md"
      ],
      [
        "gcp",
        "brain artifact migrate --dry-run | --repair",
        "pragma",
        "mindbrain_answer_artifacts (offline backfill)",
        "write",
        "stop MCP",
        "gcp-commands.md"
      ]
    ]
  },
  {
    group: "Backup / demo / IDE",
    rows: [
      [
        "gcp",
        "brain backup | export | load",
        "workspace",
        "SQLite file / bundles",
        "write",
        "stop MCP",
        "skillset-demo-import.md"
      ],
      [
        "gcp",
        "brain docs structured|document|import",
        "control-plane",
        "—",
        "read",
        "—",
        "docs/setup/"
      ],
      [
        "gcp",
        "brain setup cursor|codex|claude|generic",
        "control-plane",
        "IDE MCP config",
        "write",
        "—",
        "gcp-client-setup.md"
      ],
      [
        "gcp",
        "brain permissions print|apply",
        "control-plane",
        "Cursor/Claude MCP allow rules",
        "read/write",
        "—",
        "gcp-client-setup.md"
      ],
      [
        "gcp",
        "agent skills … | equip",
        "control-plane",
        "skills registry",
        "read/write",
        "—",
        "skillset-demo-import.md"
      ],
      [
        "gcp",
        "env … | authorize | bootstrap",
        "control-plane",
        ".ghostcrab config, native binary permissions, host project files",
        "read/write",
        "—",
        "gcp-client-setup.md"
      ],
      [
        "gcp",
        "path install|print|doctor",
        "control-plane",
        "~/.ghostcrab/bin PATH shim",
        "read/write",
        "—",
        "gcp-client-setup.md"
      ]
    ]
  }
];

function mcpTable() {
  const lines = [
    "| Tool | Basic | Subsystem | Access | Tables / impact |",
    "|------|-------|-----------|--------|-----------------|"
  ];
  for (const entry of catalog) {
    const sub = entry.subsystem;
    const acc = entry.access;
    const basic = entry.visibility === "basic" ? "yes" : "no";
    lines.push(
      `| \`${entry.name}\` | ${basic} | ${sub} | ${acc} | ${tablesFor(entry.name, sub)} |`
    );
  }
  return lines.join("\n");
}

function requiredText(entry) {
  return entry.required_arguments.length > 0
    ? entry.required_arguments.map((name) => `\`${name}\``).join(", ")
    : "none";
}

function argumentTable(entry) {
  if (entry.arguments.length === 0) {
    return "_No input arguments._";
  }

  const lines = [
    "| Argument | Required | Type | Description |",
    "|----------|----------|------|-------------|"
  ];
  for (const argument of entry.arguments) {
    lines.push(
      `| \`${mdCell(argument.name)}\` | ${argument.required ? "yes" : "no"} | \`${mdCell(argument.type)}\` | ${mdCell(argument.description || "-")} |`
    );
  }
  return lines.join("\n");
}

const TOOL_EXTENDED_DOCS = {
  ghostcrab_projections_list: "projections-discovery.md"
};

function mcpToolsReference() {
  const sections = catalog.map((entry) => {
    const extendedDoc = TOOL_EXTENDED_DOCS[entry.name];
    const extendedSection = extendedDoc
      ? `\nExtended guide: [${extendedDoc}](${extendedDoc}).\n`
      : "";

    return `### \`${entry.name}\`

${entry.description || "_No description._"}
${extendedSection}
| Field | Value |
|-------|-------|
| Visibility | ${entry.visibility} |
| Subsystem | ${entry.subsystem} |
| Access | ${entry.access} |
| Required arguments | ${requiredText(entry)} |

${argumentTable(entry)}
`;
  });

  return `# GhostCrab MCP Tools Reference

> Generated by \`node scripts/export-operator-catalog.mjs\` from the compiled MCP registry. Do not hand-edit tool entries.

GhostCrab exposes ${manifest.total} registered MCP tools, all returned by MCP \`tools/list\` and directly callable by name. A curated subset of ${manifest.basic} is flagged as recommended defaults (\`title: GhostCrab recommended default\`); the other ${manifest.extended} are extended tools. Use \`gcp tools list\`, \`gcp tools verify\`, and \`ghostcrab_tool_search\` for discovery metadata and domain filtering.

All successful tool calls use the additive envelope:

\`\`\`json
{
  "ok": true,
  "tool": "ghostcrab_status",
  "surface_version": "${surfaceVersion}",
  "generated_at": "${generatedAt}"
}
\`\`\`

Tool-specific fields are added next to that envelope. Structured failures use the same envelope with \`ok: false\` and \`error.code\`.

## Tools

${sections.join("\n")}
`;
}

function gcpTables() {
  const parts = [];
  for (const { group, rows } of GCP_GROUPS) {
    parts.push(`### ${group}\n`);
    parts.push(
      "| Surface | Command | Layer | Impact | Access | Prerequisites | Runbook |"
    );
    parts.push(
      "|---------|---------|-------|--------|--------|---------------|-----------|"
    );
    for (const r of rows) {
      parts.push(`| ${r.map(mdCell).join(" | ")} |`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

function mdCell(value) {
  return String(value).replaceAll("|", "\\|");
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

## B — MCP tools (${manifest.total} registered)

${mcpTable()}

---

## See also

- [projections-discovery.md](projections-discovery.md)
- [structured-import.md](../setup/structured-import.md)
- [document-import.md](../setup/document-import.md)
- [mcp-tools.md](mcp-tools.md)
- [ontology/README.md](../explanation/ontology/README.md)
- [StarterKit EDITIONS.md](https://gitlab.com/webigniter/starter-kit-ghostcrab-perso/-/blob/main/starterkit/EDITIONS.md)
`;

writeFileSync(outPath, `${md.trimEnd()}\n`);
writeFileSync(mcpOutPath, `${mcpToolsReference().trimEnd()}\n`);
console.log(`Wrote ${outPath} (${manifest.total} MCP tools)`);
console.log(`Wrote ${mcpOutPath} (${manifest.total} MCP tools)`);
