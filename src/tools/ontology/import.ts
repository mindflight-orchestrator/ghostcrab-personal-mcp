import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { resolveGhostcrabConfig } from "../../config/env.js";
import { runNativeMindbrainEngine } from "../../db/native-engine.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..", "..");

const SourceFormatInput = z.enum(["linkml", "ntriples"]);

export const OntologyImportInput = z.object({
  workspace_id: z.string().trim().min(1).optional(),
  ontology_id: z.string().trim().min(1),
  input_path: z.string().trim().min(1),
  source_format: SourceFormatInput.default("linkml"),
  output_path: z.string().trim().min(1).optional(),
  ntriples_path: z.string().trim().min(1).optional(),
  profile: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  materialize_graph: z.boolean().default(false),
  force: z.boolean().default(false)
});

export const ontologyImportTool: ToolHandler = {
  definition: {
    name: "ghostcrab_ontology_import",
    description:
      "Write. Import a real ontology into MindBrain native ontology tables from LinkML YAML or OWL/RDF N-Triples. This is the MCP counterpart to gcp brain ontology compile/import; do not use remember, learn, schema_register, or graph_gap_rules_import for ontology source files. Defaults to LinkML because that is the Personal ontology authoring path.",
    inputSchema: {
      type: "object",
      required: ["ontology_id", "input_path"],
      properties: {
        workspace_id: {
          type: "string",
          description:
            "Target workspace id. Defaults to the current MCP session workspace."
        },
        ontology_id: {
          type: "string",
          description:
            "Stable ontology id to write, for example serenity-production::core."
        },
        input_path: {
          type: "string",
          description:
            "Local path readable by the MCP server. For source_format=linkml, pass ontology/core.yaml. For ntriples, pass an .nt file."
        },
        source_format: {
          type: "string",
          enum: ["linkml", "ntriples"],
          default: "linkml",
          description:
            "Input format. linkml compiles YAML directly into native ontology tables; ntriples imports OWL/RDF N-Triples."
        },
        output_path: {
          type: "string",
          description:
            "Optional LinkML compile bundle output path. Applies only to source_format=linkml."
        },
        ntriples_path: {
          type: "string",
          description:
            "Optional generated N-Triples output path. Applies only to source_format=linkml."
        },
        profile: {
          type: "string",
          description:
            "Optional LinkML compile profile, for example syndic. Applies only to source_format=linkml."
        },
        name: {
          type: "string",
          description:
            "Optional ontology display name. Applies only to source_format=ntriples."
        },
        materialize_graph: {
          type: "boolean",
          default: false,
          description:
            "For N-Triples imports, also materialize object triples into graph entities/relations. Keep false for pure ontology registration."
        },
        force: {
          type: "boolean",
          default: false,
          description:
            "Allow import even when MindBrain reports an active writer session. Prefer false; set true only after checking writer status."
        }
      }
    }
  },
  async handler(args, context) {
    const input = OntologyImportInput.parse(args);
    const workspaceId = input.workspace_id ?? context.session.workspace_id;
    if (!workspaceId) {
      return createToolErrorResult(
        "ghostcrab_ontology_import",
        "workspace_id is required when the MCP session has no active workspace.",
        "missing_workspace"
      );
    }
    if (!existsSync(input.input_path)) {
      return createToolErrorResult(
        "ghostcrab_ontology_import",
        `Ontology input file not found: ${input.input_path}`,
        "input_not_found"
      );
    }
    if (input.source_format === "ntriples") {
      if (input.output_path || input.ntriples_path || input.profile) {
        return createToolErrorResult(
          "ghostcrab_ontology_import",
          "output_path, ntriples_path, and profile apply only to source_format=linkml.",
          "invalid_arguments"
        );
      }
    } else if (input.name || input.materialize_graph) {
      return createToolErrorResult(
        "ghostcrab_ontology_import",
        "name and materialize_graph apply only to source_format=ntriples.",
        "invalid_arguments"
      );
    }

    const config = resolveGhostcrabConfig();
    const writerStatus = await fetchWriterStatus(
      config.mindbrainUrl,
      config.mindbrainHttpTimeoutMs
    );
    if (
      !input.force &&
      writerStatus &&
      writerStatus.active_session_id !== null &&
      writerStatus.active_session_id !== undefined
    ) {
      return createToolErrorResult(
        "ghostcrab_ontology_import",
        "MindBrain reports an active writer session. Retry after the writer is idle, or set force:true only if you accept SQLite lock risk.",
        "active_writer",
        { writer_status: writerStatus }
      );
    }

    const engineArgs = buildOntologyImportArgs({
      ...input,
      workspace_id: workspaceId,
      sqlite_path: config.sqlitePath
    });
    const result = runNativeMindbrainEngine(engineArgs, { pkgRoot });
    if (!result.ok) {
      return createToolErrorResult(
        "ghostcrab_ontology_import",
        result.stderr.trim() || "Native MindBrain ontology import failed.",
        "native_import_failed",
        {
          status: result.status,
          stdout: result.stdout.trim(),
          engine_source: result.engineSource ?? null
        }
      );
    }

    return createToolSuccessResult("ghostcrab_ontology_import", {
      imported: true,
      workspace_id: workspaceId,
      ontology_id: input.ontology_id,
      source_format: input.source_format,
      input_path: input.input_path,
      sqlite_path: config.sqlitePath,
      backend: "mindbrain/native-ontology-import",
      engine_source: result.engineSource ?? null,
      stdout: result.stdout.trim()
    });
  }
};

function buildOntologyImportArgs(input: z.infer<typeof OntologyImportInput> & {
  workspace_id: string;
  sqlite_path: string;
}): string[] {
  if (input.source_format === "linkml") {
    const args = [
      "ontology-compile-linkml",
      "--workspace-id",
      input.workspace_id,
      "--ontology-id",
      input.ontology_id,
      "--input",
      input.input_path,
      "--db",
      input.sqlite_path
    ];
    if (input.profile) args.push("--profile", input.profile);
    if (input.output_path) args.push("--output", input.output_path);
    if (input.ntriples_path) args.push("--ntriples", input.ntriples_path);
    return args;
  }

  const args = [
    "ontology-import",
    "--db",
    input.sqlite_path,
    "--workspace-id",
    input.workspace_id,
    "--ontology-id",
    input.ontology_id,
    "--input",
    input.input_path
  ];
  if (input.name) args.push("--name", input.name);
  if (input.materialize_graph) args.push("--materialize-graph");
  return args;
}

async function fetchWriterStatus(
  mindbrainUrl: string,
  timeoutMs: number
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(
      new URL("/api/mindbrain/sql/write-status", mindbrainUrl),
      { signal: AbortSignal.timeout(Math.min(timeoutMs, 2000)) }
    );
    if (!response.ok) return null;
    const json = await response.json();
    return typeof json === "object" && json !== null
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

registerTool(ontologyImportTool);
