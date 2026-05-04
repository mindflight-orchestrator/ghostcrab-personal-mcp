import { parseArgs } from "node:util";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { CLI_COMMANDS, resolveCommand, type CliCommand } from "./commands.js";
import { initToolContext } from "./context.js";
import { executeTool, EXIT_ERROR, EXIT_UNKNOWN_TOOL } from "./execute.js";
import { HelpRequested, parseCliInput } from "./parse-input.js";
import { buildToolCatalog, listBasicRegisteredTools } from "../tools/catalog.js";
import { registerAllTools } from "../tools/register-all.js";
import { listRegisteredTools } from "../tools/registry.js";

function cliLabelForMcpTool(mcpToolName: string): string | null {
  const entry = CLI_COMMANDS.find((c) => c.mcpToolName === mcpToolName);
  if (!entry) {
    return null;
  }

  return entry.subcommand
    ? `${entry.cliName} ${entry.subcommand}`
    : entry.cliName;
}

export function extractStructuredJson(
  result: CallToolResult
): Record<string, unknown> {
  if (
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {
    return result.structuredContent as Record<string, unknown>;
  }

  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  return JSON.parse(text) as Record<string, unknown>;
}

async function resolveArgs(
  command: CliCommand,
  argv: string[]
): Promise<Record<string, unknown>> {
  if (argv.includes("--stdin-json")) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }

    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (text.length === 0) {
      throw new Error("--stdin-json was set but stdin was empty.");
    }

    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("--stdin-json must contain a JSON object payload.");
    }

    return parsed as Record<string, unknown>;
  }

  return parseCliInput(command, argv);
}

function printSchemaGroupHelp(): void {
  const lines = [
    "Usage: ghostcrab schema <subcommand> [options]",
    "",
    "Schema commands:",
    "  schema list        List registered schemas",
    "  schema inspect     Inspect a schema by ID",
    "  schema register    Register a new schema"
  ];

  console.log(lines.join("\n"));
}

function printGlobalHelp(): void {
  const lines = [
    "Usage: ghostcrab <command> [options]",
    "",
    "Commands:",
    "  serve              Start MCP server on stdio (default)",
    "  tools list         List available tools and their schemas",
    "  maintenance ddl-approve         Approve a pending DDL migration",
    "  maintenance ddl-execute         Execute an approved DDL migration",
    "  maintenance refresh-entity-degree  Refresh graph.entity_degree (requires pg_dgraph)",
    "  maintenance register-pg-facets     Register facets with pg_facets (requires pg_facets + migration 008)",
    "  maintenance merge-facet-deltas     Apply pg_facets merge_deltas on facets (requires pg_facets)"
  ];

  for (const cmd of CLI_COMMANDS) {
    const name = cmd.subcommand
      ? `${cmd.cliName} ${cmd.subcommand}`
      : cmd.cliName;
    lines.push(`  ${name.padEnd(20)} ${cmd.description}`);
  }

  lines.push("", "Global options:");
  lines.push(
    "  --input <json>     Pass full JSON payload (exclusive with flags)"
  );
  lines.push("  --stdin-json       Read JSON payload from stdin");
  lines.push("  --text             Pretty-print JSON output");
  lines.push("  --verbose, -v      Show connection/bootstrap logs on stderr");
  lines.push("  --help, -h         Show help");
  console.log(lines.join("\n"));
}

function printCommandHelp(command: CliCommand): void {
  const name = command.subcommand
    ? `${command.cliName} ${command.subcommand}`
    : command.cliName;
  const lines = [
    `Usage: ghostcrab ${name} [options]`,
    "",
    command.description,
    "",
    "Options:"
  ];

  for (const [flag, config] of Object.entries(command.parseArgsOptions ?? {})) {
    const short = (config as { short?: string }).short;
    const shortStr = short ? `, -${short}` : "";
    const typeStr = (config as { type: string }).type;
    lines.push(`  --${flag}${shortStr}`.padEnd(28) + `(${typeStr})`);
  }

  lines.push("  --input <json>".padEnd(28) + "(string)");
  lines.push("  --stdin-json".padEnd(28) + "(boolean)");
  lines.push("  --text".padEnd(28) + "(boolean)");
  lines.push("  --verbose, -v".padEnd(28) + "(boolean)");
  lines.push("  --help, -h".padEnd(28) + "(boolean)");
  console.log(lines.join("\n"));
}

function printMaintenanceDdlApproveHelp(): void {
  console.log([
    "Usage: ghostcrab maintenance ddl-approve --id <uuid> --by <name>",
    "",
    "Approve a pending DDL migration so it can be executed later."
  ].join("\n"));
}

function printMaintenanceDdlExecuteHelp(): void {
  console.log([
    "Usage: ghostcrab maintenance ddl-execute --id <uuid>",
    "",
    "Execute an approved DDL migration."
  ].join("\n"));
}

export async function runCli(argv: string[]): Promise<void> {
  const [firstArg] = argv;

  if (firstArg === "maintenance" && argv[1] === "ddl-approve") {
    registerAllTools();

    if (argv.includes("--help") || argv.includes("-h")) {
      printMaintenanceDdlApproveHelp();
      process.exit(0);
      return;
    }

    const { values } = parseArgs({
      args: argv.slice(2),
      options: {
        id: { type: "string" },
        by: { type: "string" }
      },
      strict: true
    });

    const migrationId = values.id;
    const approvedBy = values.by;

    if (!migrationId || !approvedBy) {
      console.error("maintenance ddl-approve requires --id and --by");
      process.exit(EXIT_ERROR);
      return;
    }

    const { toolContext, cleanup } = await initToolContext({
      verbose: argv.includes("--verbose") || argv.includes("-v")
    });

    try {
      if (toolContext.database.kind === "sqlite") {
        const pendingRows = await toolContext.database.query<{
          id: string;
          status: string;
          workspace_id: string;
          approved_by: string | null;
          approved_at: string | null;
        }>(
          `SELECT id, status, workspace_id, approved_by, approved_at
           FROM pending_migrations
           WHERE id = ? AND status = 'pending'`,
          [migrationId]
        );

        if (pendingRows.length > 0) {
          await toolContext.database.query(
            `UPDATE pending_migrations
             SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [approvedBy, migrationId]
          );
        }

        const rows = await toolContext.database.query<{
          id: string;
          status: string;
          workspace_id: string;
          approved_by: string | null;
          approved_at: string | null;
        }>(
          `SELECT id, status, workspace_id, approved_by, approved_at
           FROM pending_migrations
           WHERE id = ? AND status = 'approved'`,
          [migrationId]
        );

        if (rows.length === 0) {
          const existing = await toolContext.database.query<{
            id: string;
            status: string;
          }>(
            `SELECT id, status
             FROM pending_migrations
             WHERE id = ?`,
            [migrationId]
          );

          if (existing.length === 0) {
            process.stdout.write(
              `${JSON.stringify({
                ok: false,
                error: {
                  code: "migration_not_found",
                  message: `Migration '${migrationId}' not found.`
                }
              })}\n`
            );
            await cleanup();
            process.exit(EXIT_ERROR);
            return;
          }

          process.stdout.write(
            `${JSON.stringify({
              ok: false,
              error: {
                code: "migration_not_pending",
                message: `Migration '${migrationId}' has status '${existing[0].status}'. Only 'pending' migrations can be approved.`,
                details: { current_status: existing[0].status }
              }
            })}\n`
          );
          await cleanup();
          process.exit(EXIT_ERROR);
          return;
        }

        process.stdout.write(
          `${JSON.stringify({
            ok: true,
            migration_id: rows[0].id,
            workspace_id: rows[0].workspace_id,
            status: rows[0].status,
            approved_by: rows[0].approved_by,
            approved_at: rows[0].approved_at
          })}\n`
        );
        await cleanup();
        process.exit(0);
        return;
      }

      const rows = await toolContext.database.query<{
        id: string;
        status: string;
        workspace_id: string;
        approved_by: string | null;
        approved_at: string | null;
      }>(
        `UPDATE mindbrain.pending_migrations
         SET status = 'approved', approved_by = $2, approved_at = now()
         WHERE id = $1 AND status = 'pending'
         RETURNING id, status, workspace_id, approved_by, approved_at`,
        [migrationId, approvedBy]
      );

      if (rows.length === 0) {
        const existing = await toolContext.database.query<{
          id: string;
          status: string;
        }>(
          `SELECT id, status
           FROM mindbrain.pending_migrations
           WHERE id = $1`,
          [migrationId]
        );

        if (existing.length === 0) {
          process.stdout.write(
            `${JSON.stringify({
              ok: false,
              error: {
                code: "migration_not_found",
                message: `Migration '${migrationId}' not found.`
              }
            })}\n`
          );
          await cleanup();
          process.exit(EXIT_ERROR);
          return;
        }

        process.stdout.write(
          `${JSON.stringify({
            ok: false,
            error: {
              code: "migration_not_pending",
              message: `Migration '${migrationId}' has status '${existing[0].status}'. Only 'pending' migrations can be approved.`,
              details: { current_status: existing[0].status }
            }
          })}\n`
        );
        await cleanup();
        process.exit(EXIT_ERROR);
        return;
      }

      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          migration_id: rows[0].id,
          workspace_id: rows[0].workspace_id,
          status: rows[0].status,
          approved_by: rows[0].approved_by,
          approved_at: rows[0].approved_at
        })}\n`
      );
      await cleanup();
      process.exit(0);
    } catch (error) {
      await cleanup();
      console.error(
        `Fatal: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
    return;
  }

  if (firstArg === "maintenance" && argv[1] === "ddl-execute") {
    registerAllTools();

    if (argv.includes("--help") || argv.includes("-h")) {
      printMaintenanceDdlExecuteHelp();
      process.exit(0);
      return;
    }

    const { values } = parseArgs({
      args: argv.slice(2),
      options: {
        id: { type: "string" }
      },
      strict: true
    });

    const migrationId = values.id;
    if (!migrationId) {
      console.error("maintenance ddl-execute requires --id");
      process.exit(EXIT_ERROR);
      return;
    }

    const { toolContext, cleanup } = await initToolContext({
      verbose: argv.includes("--verbose") || argv.includes("-v")
    });

    try {
      const { result, exitCode } = await executeTool(
        "ghostcrab_ddl_execute",
        { migration_id: migrationId },
        toolContext
      );
      process.stdout.write(`${JSON.stringify(extractStructuredJson(result))}\n`);
      await cleanup();
      process.exit(exitCode);
    } catch (error) {
      await cleanup();
      console.error(
        `Fatal: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
    return;
  }

  if (firstArg === "maintenance" && argv[1] === "refresh-entity-degree") {
    registerAllTools();
    const { initToolContext } = await import("./context.js");
    const { refreshEntityDegreeWithReport } = await import(
      "../db/maintenance.js"
    );
    const { toolContext, cleanup } = await initToolContext({
      verbose: argv.includes("--verbose") || argv.includes("-v")
    });
    try {
      const report = await refreshEntityDegreeWithReport(
        toolContext.database,
        toolContext.extensions
      );
      process.stdout.write(`${JSON.stringify(report)}\n`);
      await cleanup();
      process.exit(report.ok ? 0 : 1);
    } catch (error) {
      await cleanup();
      console.error(
        `Fatal: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
    return;
  }

  if (firstArg === "maintenance" && argv[1] === "register-pg-facets") {
    registerAllTools();
    const { initToolContext } = await import("./context.js");
    const { registerPgFacetsWithReport } = await import(
      "../db/facets-registration.js"
    );
    const { toolContext, cleanup } = await initToolContext({
      verbose: argv.includes("--verbose") || argv.includes("-v")
    });
    try {
      const report = await registerPgFacetsWithReport(
        toolContext.database,
        toolContext.extensions
      );
      process.stdout.write(`${JSON.stringify(report)}\n`);
      await cleanup();
      process.exit(report.ok ? 0 : 1);
    } catch (error) {
      await cleanup();
      console.error(
        `Fatal: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
    return;
  }

  if (firstArg === "maintenance" && argv[1] === "merge-facet-deltas") {
    registerAllTools();
    const { initToolContext } = await import("./context.js");
    const { mergeFacetDeltasWithReport } = await import(
      "../db/facets-maintenance.js"
    );
    const { toolContext, cleanup } = await initToolContext({
      verbose: argv.includes("--verbose") || argv.includes("-v")
    });
    try {
      const report = await mergeFacetDeltasWithReport(
        toolContext.database,
        toolContext.extensions
      );
      process.stdout.write(`${JSON.stringify(report)}\n`);
      await cleanup();
      process.exit(report.ok ? 0 : 1);
    } catch (error) {
      await cleanup();
      console.error(
        `Fatal: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
    return;
  }

  if (firstArg === "tools" && argv[1] === "list") {
    registerAllTools();
    const tools = listRegisteredTools();
    const basicTools = listBasicRegisteredTools(tools);
    const toolCatalog = buildToolCatalog(tools);
    const output = {
      ok: true,
      listed_by_default: basicTools.map((t) => t.name),
      full_catalog_size: tools.length,
      tools: basicTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        cli_command: cliLabelForMcpTool(t.name)
      })),
      hidden_tools: toolCatalog
        .filter((tool) => tool.visibility === "extended")
        .map((tool) => ({
          name: tool.name,
          access: tool.access,
          subsystem: tool.subsystem
        }))
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exit(0);
    return;
  }

  if (firstArg === "--help" || firstArg === "-h") {
    printGlobalHelp();
    process.exit(0);
    return;
  }

  if (firstArg === "schema" && (argv[1] === "--help" || argv[1] === "-h")) {
    printSchemaGroupHelp();
    process.exit(0);
    return;
  }

  const command = resolveCommand(argv);
  if (!command) {
    if (firstArg === "schema") {
      console.error(
        "Unknown schema subcommand. Run ghostcrab schema --help for usage."
      );
      process.exit(EXIT_UNKNOWN_TOOL);
      return;
    }

    console.error(
      `Unknown command: ${firstArg ?? ""}. Run ghostcrab --help for usage.`
    );
    process.exit(EXIT_UNKNOWN_TOOL);
    return;
  }

  let args: Record<string, unknown>;

  try {
    args = await resolveArgs(command, argv);
  } catch (err) {
    if (err instanceof HelpRequested) {
      printCommandHelp(err.command);
      process.exit(0);
      return;
    }

    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT_ERROR);
    return;
  }

  const verbose = argv.includes("--verbose") || argv.includes("-v");
  const textMode = argv.includes("--text");

  registerAllTools();
  const { toolContext, cleanup } = await initToolContext({ verbose });

  try {
    const { result, exitCode } = await executeTool(
      command.mcpToolName,
      args,
      toolContext
    );
    const json = extractStructuredJson(result);
    const payload = textMode
      ? `${JSON.stringify(json, null, 2)}\n`
      : `${JSON.stringify(json)}\n`;
    process.stdout.write(payload);
    await cleanup();
    process.exit(exitCode);
    return;
  } catch (err) {
    console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    await cleanup();
    process.exit(EXIT_ERROR);
    return;
  }
}
