/**
 * gcp brain — MindBrain / SQLite axis: start backend + MCP, workspaces, knowledge schema (ontologies).
 *
 * JTBD: prepare the “brain” (storage + structure), not the agent-facing UX.
 */

import { readConfig } from "../lib/cli-config.mjs";

export async function cmdBrain(args) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "--help" || sub === "-h") {
    printBrainHelp();
    return;
  }

  switch (sub) {
    case "up": {
      const { runServe } = await import("./serve.mjs");
      await runServe(rest);
      break;
    }
    case "workspace": {
      await cmdBrainWorkspace(rest);
      break;
    }
    case "schema": {
      const { cmdOntologies } = await import("./ontologies.mjs");
      await cmdOntologies(rest);
      break;
    }
    case "load": {
      const { cmdLoad } = await import("./load.mjs");
      await cmdLoad(rest);
      break;
    }
    case "db-who": {
      const { runBrainDbWho } = await import("./brain-db-who.mjs");
      await runBrainDbWho(rest);
      break;
    }
    case "document": {
      const { cmdBrainDocument } = await import("./brain-document.mjs");
      await cmdBrainDocument(rest);
      break;
    }
    case "setup":
    case "setup_cursor":
    case "setup_codex":
    case "setup_claude":
    case "setup_claudecode": {
      const aliasFirst = {
        setup_cursor: "cursor",
        setup_codex: "codex",
        setup_claude: "claude",
        setup_claudecode: "claude"
      };
      const r = sub === "setup" ? rest : [aliasFirst[sub], ...rest];
      await cmdBrainSetup(r);
      break;
    }
    default:
      console.error(
        `gcp brain: unknown subcommand "${sub}". Run "gcp brain --help".`
      );
      process.exit(1);
  }
}

/**
 * @param {string[]} args
 */
async function cmdBrainSetup(args) {
  const p = parseSetupArgs(args);
  if (p === "help" || p.error) {
    if (p !== "help" && p.error) {
      console.error(p.error);
      process.exit(1);
    }
    printSetupHelp();
    return;
  }

  const {
    readNpmPackageName,
    runSetupCursor,
    runSetupCodex,
    runSetupClaude,
    EX_ERR,
    PKG_ROOT
  } = await import("../lib/mcp-global-setup.mjs");

  let packageName = p.package;
  if (!packageName) {
    try {
      packageName = readNpmPackageName(PKG_ROOT);
    } catch (e) {
      console.error(
        `gcp brain setup: could not read package name: ${e?.message ?? e}\n` +
          "  Set --package <@scope/ghostcrab-…> to the npm name for dlx."
      );
      process.exit(1);
    }
  }

  const base = {
    packageName,
    runner: p.runner,
    workspace: p.workspace,
    dbPath: p.dbPath,
    serverName: p.serverName,
    extraEnv: p.extraEnv,
    dryRun: p.dryRun,
    cwd: process.cwd()
  };

  if (p.target === "cursor") {
    const out = runSetupCursor({
      ...base,
      force: p.force
    });
    if (out.message) {
      (out.ok ? console.log : console.error)(out.message);
    }
    if (
      out.ok &&
      Array.isArray(out.prunedLegacy) &&
      out.prunedLegacy.length > 0
    ) {
      console.log(
        `  Removed legacy MCP entries that pre-0.2.10 setup wrote (they were the source of\n` +
          `  "spawn gcp ENOENT" / "could not determine executable to run" in Cursor):\n` +
          out.prunedLegacy.map((k) => `    - mcpServers.${k}`).join("\n")
      );
    }
    if (p.dryRun && out.doc) {
      console.log(JSON.stringify(out.doc, null, 2));
    }
    if (!out.ok) process.exit(out.code ?? EX_ERR);
    return;
  }

  if (p.target === "codex") {
    const out = runSetupCodex({ ...base, force: p.force });
    if (out.message) {
      (out.ok ? console.log : console.error)(out.message);
    }
    if (p.dryRun) {
      if (out.shell) console.log(String(out.shell));
      if (out.toml) {
        console.log("--- TOML fallback for ~/.codex/config.toml:\n" + out.toml);
      }
    }
    if (!out.ok) {
      if (out.shell) console.error("Equivalent shell:\n" + out.shell);
      if (out.toml) console.error("\n" + out.toml);
      process.exit(out.code ?? EX_ERR);
    }
    return;
  }

  if (p.target === "claude") {
    const out = runSetupClaude({
      ...base,
      scope: p.scope,
      force: p.force
    });
    if (out.message) {
      (out.ok ? console.log : console.error)(out.message);
    }
    if (p.dryRun && out.shell) {
      console.log(String(out.shell));
    }
    if (!out.ok) {
      if (out.printClaude && out.shell) {
        console.error(String(out.shell));
      }
      process.exit(out.code ?? EX_ERR);
    }
    return;
  }

  printSetupHelp();
  process.exit(1);
}

/**
 * @param {string[]} args
 * @returns {"help" | { error: string } | { target: string, runner: string, package: string | null, workspace: string | null, dbPath: string | null, serverName: string | null, dryRun: boolean, force: boolean, extraEnv: Record<string, string>, scope: "local" | "user" | "project" } }
 */
function parseSetupArgs(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    return "help";
  }
  if (args.length === 0) {
    return { error: "gcp brain setup: missing target (cursor|codex|claude)." };
  }

  const targetRaw = args[0];
  const target =
    targetRaw === "cursor" || targetRaw === "codex" || targetRaw === "claude"
      ? targetRaw
      : null;
  if (!target) {
    return {
      error: `gcp brain setup: invalid target "${targetRaw}". Use: cursor, codex, or claude.`
    };
  }

  const rest = args.slice(1);
  const out = {
    target,
    runner: "auto",
    package: null,
    workspace: null,
    dbPath: null,
    serverName: null,
    dryRun: false,
    force: false,
    extraEnv: /** @type {Record<string, string>} */ ({}),
    scope: /** @type {"local" | "user" | "project"} */ ("user")
  };

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--help" || a === "-h") {
      return "help";
    }
    if (a === "--workspace" && rest[i + 1]) {
      out.workspace = rest[++i];
      continue;
    }
    if (a === "--db" && rest[i + 1]) {
      out.dbPath = rest[++i];
      continue;
    }
    if ((a === "--name" || a === "--server-name") && rest[i + 1]) {
      out.serverName = rest[++i];
      continue;
    }
    if (a === "--runner" && rest[i + 1]) {
      out.runner = rest[++i];
      continue;
    }
    if (a === "--package" && rest[i + 1]) {
      out.package = rest[++i];
      continue;
    }
    if (a === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (a === "--force" || a === "--replace") {
      out.force = true;
      continue;
    }
    if (a === "--env" && rest[i + 1]) {
      const s = rest[++i];
      const eq = s.indexOf("=");
      if (eq < 1) {
        return {
          error: `gcp brain setup: --env expects KEY=value, got "${s}"`
        };
      }
      out.extraEnv[s.slice(0, eq).trim()] = s.slice(eq + 1);
      continue;
    }
    if (a === "--scope" && rest[i + 1]) {
      const scope = rest[++i];
      if (scope !== "local" && scope !== "user" && scope !== "project") {
        return {
          error: `gcp brain setup: --scope must be local, user, or project (got ${scope})`
        };
      }
      out.scope = scope;
      continue;
    }
    return { error: `gcp brain setup: unexpected argument "${a}"` };
  }

  if (!["gcp", "pnpm", "npx", "node", "auto"].includes(out.runner)) {
    return {
      error: `gcp brain setup: --runner must be auto, gcp, pnpm, npx, or node (got ${out.runner})`
    };
  }

  if (out.scope !== "user" && out.target !== "claude") {
    return { error: "gcp brain setup: --scope is only for claude" };
  }

  return out;
}

function printSetupHelp() {
  console.log(
    `
Usage: gcp brain setup <cursor|codex|claude> [options]

  Register the GhostCrab MCP server in user-scoped config (not project-local rules).

  --runner <auto|gcp|pnpm|npx|node>
                                default: auto. auto picks (in order):
                                  - node + absolute path to a local install
                                    (./node_modules/<pkg>/bin/gcp.mjs walking up)
                                  - absolute path to a global gcp on PATH
                                  - npx -y --package=<pkg>@latest gcp brain up
  --package <npm-name>          default: this package (see package.json "name")
  --workspace <name>            optional gcp --workspace
  --db <path>                   add gcp brain up --db <path> to the MCP launch
  --name, --server-name <name>  MCP server key (default: ghostcrab-personal-mcp)
  --env KEY=value              repeat for extra MCP process env
  --dry-run                    do not run CLIs or write files; print the result
  --force, --replace           replace existing entry where supported
  --scope local|user|project   (claude only; default: user)

Aliases:  gcp brain setup_cursor | setup_codex | setup_claude | setup_claudecode

Per-IDE details:  README_CURSOR_MCP.md, README_CODEX_MCP.md, README_CLAUDE_CODE_MCP.md
`.trim()
  );
}

async function cmdBrainWorkspace(args) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(
      `
Usage: gcp brain workspace <subcommand>

Subcommands:
  create [name]     Create / register a workspace (default name: default)
                      Same flags as gcp init: --no-skills, --force-skills
  list                List registered workspaces and SQLite paths

Aliases:  gcp init [name]  →  gcp brain workspace create [name]
`.trim()
    );
    return;
  }

  if (sub === "create" || sub === "init") {
    const { cmdInit } = await import("./init.mjs");
    await cmdInit(rest);
    return;
  }

  if (sub === "list" || sub === "ls") {
    cmdWorkspaceList();
    return;
  }

  console.error(
    `gcp brain workspace: unknown subcommand "${sub}". Run "gcp brain workspace --help".`
  );
  process.exit(1);
}

function cmdWorkspaceList() {
  const config = readConfig();
  const ws = config.workspaces ?? {};
  const names = Object.keys(ws);
  if (names.length === 0) {
    console.log(
      "(no workspaces yet — run: gcp brain workspace create <name>)\n" +
        "  Alias: gcp init <name>"
    );
    return;
  }
  const sorted = names.sort();
  const max = Math.max(...sorted.map((n) => n.length));
  for (const n of sorted) {
    const def = config.defaultWorkspace === n ? "  (default)" : "";
    const p = ws[n]?.sqlitePath ?? "?";
    console.log(`${n.padEnd(max)}${def}\n  ${p}`);
  }
}

function printBrainHelp() {
  console.log(
    `
Usage: gcp brain <subcommand>

MindBrain (storage + structure) — start the Zig backend, isolate memory, install schema packs.

Subcommands:
  up [--workspace <name>] [--no-skills]   Start MindBrain backend + MCP on stdio
  workspace create [name]                 Register a workspace & data paths
  workspace list                          List workspaces
  schema <list|pull|remove|show>           Ontologies / knowledge structure in the DB
  db-who [--path] [--workspace]            Which processes have the SQLite file open (lsof)
  document [--workspace] [--force] <cmd>   Corpus import / normalize / profile (stop MCP first)
  load <file.jsonl>                       Load a portable JSONL profile into the DB
  setup <cursor|codex|claude> [opts]     User-global MCP: ~/.cursor/mcp.json, codex mcp add, or claude mcp add

Examples:
  gcp brain up --workspace my-app
  gcp brain workspace create my-app
  gcp brain schema pull mindflight/mindbrain
  gcp brain document document-profile-worker --base-url https://api.openai.com/v1 --model gpt-4.1-mini --limit 2
  gcp brain load ./profile.jsonl
  gcp brain setup cursor --dry-run
  gcp brain setup claude --runner pnpm

Shorthand:  gcp up   and   gcp start   mean the same as   gcp brain up
Legacy:     gcp serve  (same as gcp brain up)
`.trim()
  );
}
