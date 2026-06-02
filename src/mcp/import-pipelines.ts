/**
 * Bulk import pipelines (structured tabular + unstructured documents).
 * Shared by MCP instructions, ghostcrab://readme, ghostcrab_status, and gcp brain docs.
 */

export const IMPORT_DOC_COMMAND = "gcp brain docs";

export interface ImportPipelineDocRef {
  topic: "structured" | "document";
  cli_help: string;
  full_docs_command: string;
  runbook_path: string;
}

export interface ImportPipelineEntry {
  id: "structured" | "document";
  label: string;
  when_to_use: string;
  cli_wrapper: string;
  native_engine: string;
  prerequisites: string[];
  typical_order: string[];
  key_subcommands: string[];
  post_import_mcp: string[];
  docs: ImportPipelineDocRef;
}

export const IMPORT_PIPELINES: readonly ImportPipelineEntry[] = [
  {
    id: "structured",
    label: "Structured / tabular import",
    when_to_use:
      "CSV, JSON, YAML, XLSX, or TOON into facets (agent_facts) and raw graph (entities_raw, relations_raw).",
    cli_wrapper: "gcp brain structured-import",
    native_engine:
      "ghostcrab-document (mindbrain-standalone-tool structured-import-*)",
    prerequisites: [
      "Stop MCP / ghostcrab-backend before DB writes (or pass --force on the CLI wrapper).",
      "Set GHOSTCRAB_SQLITE_PATH or pass --workspace / --db on the wrapper.",
      "Provide model JSON, mapping JSON, and workspace-id."
    ],
    typical_order: [
      "validate → infer (optional) → register-semantics",
      "apply (import_ready or project from source dir) OR Phase D: ddl-propose → ddl-execute → load-ws → apply with data_plane=ws",
      "reindex --scope all → validate-provenance"
    ],
    key_subcommands: [
      "validate",
      "infer",
      "register-semantics",
      "apply",
      "project",
      "load-ws",
      "ddl-propose",
      "ddl-execute",
      "reindex",
      "validate-provenance"
    ],
    post_import_mcp: [
      "ghostcrab_search",
      "ghostcrab_graph_search",
      "ghostcrab_graph_reindex",
      "ghostcrab_combined_search"
    ],
    docs: {
      topic: "structured",
      cli_help: "gcp brain structured-import --help",
      full_docs_command: `${IMPORT_DOC_COMMAND} structured`,
      runbook_path: "docs/setup/structured-import.md"
    }
  },
  {
    id: "document",
    label: "Unstructured document import",
    when_to_use:
      "PDF, HTML, Markdown corpus: normalize, ingest raw documents/chunks, optional LLM profile and controlled qualification.",
    cli_wrapper: "gcp brain document",
    native_engine: "ghostcrab-document (document-*)",
    prerequisites: [
      "Stop MCP / ghostcrab-backend before DB writes (or pass --force).",
      "Optional: pdftotext, pandoc, ocrmypdf; LLM via MB_DOCUMENTS_LLM_* or --base-url/--model/--api-key.",
      "Ontology / collection ids from qualification-vocab-list when qualifying."
    ],
    typical_order: [
      "collection-create / ontology-attach (when needed)",
      "document-normalize → document-ingest",
      "document-profile or document-profile-worker",
      "document-qualify (controlled taxonomies/facets)",
      "ghostcrab_graph_reindex or collection reindex when graph links are required"
    ],
    key_subcommands: [
      "document-normalize",
      "document-ingest",
      "document-profile",
      "document-profile-worker",
      "document-profile-enqueue",
      "qualification-vocab-list",
      "document-qualify",
      "document-business-extract"
    ],
    post_import_mcp: [
      "ghostcrab_collection_search",
      "ghostcrab_entity_chunks",
      "ghostcrab_graph_search",
      "ghostcrab_graph_reindex"
    ],
    docs: {
      topic: "document",
      cli_help: "gcp brain document --help",
      full_docs_command: `${IMPORT_DOC_COMMAND} document`,
      runbook_path: "docs/setup/document-import.md"
    }
  }
] as const;

/** Compact block for MCP server instructions (token-conscious). */
export function buildImportPipelinesInstructionsBlock(): string {
  const lines = [
    "Bulk import (not MCP tools — operator CLI; agents may run these when the user requests import, never to read/query data):",
    ""
  ];
  for (const p of IMPORT_PIPELINES) {
    lines.push(
      `  ${p.label}: ${p.cli_wrapper} — ${p.when_to_use}`,
      `    Order: ${p.typical_order.join(" → ")}`,
      `    Full runbook: ${p.docs.full_docs_command} (also ${p.docs.runbook_path})`,
      ""
    );
  }
  lines.push(
    "After bulk import, use MCP read tools (search, graph_search, reindex via ghostcrab_graph_reindex when needed).",
    `List topics: ${IMPORT_DOC_COMMAND} --list`
  );
  return lines.join("\n").trimEnd();
}

/** Markdown section for ghostcrab://readme. */
export function buildImportPipelinesMarkdownSection(): string {
  const blocks = IMPORT_PIPELINES.map((p) => {
    return [
      `### ${p.label}`,
      "",
      p.when_to_use,
      "",
      `- **CLI:** \`${p.cli_wrapper}\``,
      `- **Engine:** ${p.native_engine}`,
      `- **Typical order:** ${p.typical_order.join(" → ")}`,
      `- **Key subcommands:** ${p.key_subcommands.map((s) => `\`${s}\``).join(", ")}`,
      `- **After import (MCP):** ${p.post_import_mcp.map((t) => `\`${t}\``).join(", ")}`,
      `- **Full runbook:** \`${p.docs.full_docs_command}\``,
      `- **CLI help:** \`${p.docs.cli_help}\``
    ].join("\n");
  });
  return `## Bulk import pipelines (CLI, not MCP)

MCP is the ontology and **query** surface. High-throughput ingestion uses **\`gcp brain\`** wrappers around the native document engine — not MCP streaming.

Agents may orchestrate these CLIs when the user asks to import data. Agents must **not** open SQLite or use CLI/SQL to **read** GhostCrab data (use MCP tools only).

${blocks.join("\n\n")}
`;
}

/** JSON-safe payload for ghostcrab_status. */
export function buildImportPipelinesStatusPayload(): {
  summary: string;
  docs_command: string;
  pipelines: ImportPipelineEntry[];
} {
  return {
    summary:
      "Bulk structured and document import run outside MCP via gcp brain structured-import and gcp brain document.",
    docs_command: IMPORT_DOC_COMMAND,
    pipelines: IMPORT_PIPELINES.map((p) => ({ ...p }))
  };
}
