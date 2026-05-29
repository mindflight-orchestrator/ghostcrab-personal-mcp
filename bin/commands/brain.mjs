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
    case "ontology": {
      const { cmdBrainOntology } = await import("./brain-ontology.mjs");
      await cmdBrainOntology(rest);
      break;
    }
    case "load": {
      const { cmdLoad } = await import("./load.mjs");
      await cmdLoad(rest);
      break;
    }
    case "backup":
    case "export": {
      const { cmdBrainBackup } = await import("./brain-backup.mjs");
      await cmdBrainBackup(rest);
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
    case "permissions": {
      await cmdBrainPermissions(rest);
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

  // Always inject an absolute --db path into the MCP launch args so the MCP
  // host (Cursor, Codex, Claude Code…) uses the correct database regardless of
  // its working directory.  The user's explicit --db wins; otherwise we resolve
  // the same path that `gcp brain up` would pick at setup time (workspace
  // config → defaultWorkspace → cwd/data/ghostcrab.sqlite).
  let effectiveDbPath = p.dbPath;
  if (!effectiveDbPath) {
    const { resolveGhostcrabSqlite } =
      await import("../lib/resolve-ghostcrab-sqlite.mjs");
    const resolved = resolveGhostcrabSqlite({
      workspaceNameFromCli: p.workspace ?? null,
      sqlitePathFromCli: null
    });
    effectiveDbPath = resolved.sqlitePathResolved;
  }

  const base = {
    packageName,
    runner: p.runner,
    workspace: p.workspace,
    dbPath: effectiveDbPath,
    serverName: p.serverName ?? "ghostcrab-personal-mcp",
    extraEnv: p.extraEnv,
    dryRun: p.dryRun,
    cwd: process.cwd()
  };

  const postOpts = {
    target: p.target,
    cwd: process.cwd(),
    pkgRoot: PKG_ROOT,
    serverName: base.serverName,
    permissionsPreset: p.permissionsPreset,
    permissionsScope: p.permissionsScope,
    skipPermissions: p.noPermissions,
    skipSkills: p.noSkills,
    force: p.force,
    dryRun: p.dryRun,
    allowTools: p.allowTools,
    askTools: p.askTools
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
    if (out.ok) {
      const { runSetupPostInstall } = await import("../lib/mcp-setup-post.mjs");
      const post = await runSetupPostInstall(postOpts);
      if (!post.ok) {
        console.error(post.message ?? "Post-setup failed.");
        process.exit(1);
      }
      for (const m of post.messages ?? []) console.log(m);
    }
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
    if (out.ok) {
      const { runSetupPostInstall } = await import("../lib/mcp-setup-post.mjs");
      const post = await runSetupPostInstall(postOpts);
      if (!post.ok) {
        console.error(post.message ?? "Post-setup failed.");
        process.exit(1);
      }
      for (const m of post.messages ?? []) console.log(m);
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
    if (out.ok) {
      const { runSetupPostInstall } = await import("../lib/mcp-setup-post.mjs");
      const post = await runSetupPostInstall({
        ...postOpts,
        permissionsScope: p.permissionsScope
      });
      if (!post.ok) {
        console.error(post.message ?? "Post-setup failed.");
        process.exit(1);
      }
      for (const m of post.messages ?? []) console.log(m);
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
    scope: /** @type {"local" | "user" | "project"} */ ("user"),
    permissionsPreset: "basic",
    permissionsScope: /** @type {"user" | "project"} */ ("user"),
    noPermissions: false,
    noSkills: false,
    allowTools: /** @type {string[]} */ ([]),
    askTools: /** @type {string[]} */ ([])
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
    if (a === "--permissions" && rest[i + 1]) {
      out.permissionsPreset = rest[++i];
      continue;
    }
    if (a === "--no-permissions") {
      out.noPermissions = true;
      out.permissionsPreset = "none";
      continue;
    }
    if (a === "--permissions-scope" && rest[i + 1]) {
      const ps = rest[++i];
      if (ps !== "user" && ps !== "project") {
        return {
          error: `gcp brain setup: --permissions-scope must be user or project (got ${ps})`
        };
      }
      out.permissionsScope = ps;
      continue;
    }
    if (a === "--no-skills") {
      out.noSkills = true;
      continue;
    }
    if (a === "--force-skills") {
      out.force = true;
      continue;
    }
    if (a === "--permissions-tool" && rest[i + 1]) {
      out.allowTools.push(rest[++i]);
      out.permissionsPreset = "custom";
      continue;
    }
    if (a === "--permissions-ask-tool" && rest[i + 1]) {
      out.askTools.push(rest[++i]);
      out.permissionsPreset = "custom";
      continue;
    }
    return { error: `gcp brain setup: unexpected argument "${a}"` };
  }

  const validPresets = [
    "none",
    "all",
    "basic",
    "read",
    "balanced",
    "custom"
  ];
  if (!validPresets.includes(out.permissionsPreset)) {
    return {
      error: `gcp brain setup: --permissions must be one of ${validPresets.join(", ")} (got ${out.permissionsPreset})`
    };
  }

  if (out.allowTools.length > 0 || out.askTools.length > 0) {
    out.permissionsPreset = "custom";
  }

  if (out.scope === "project" && !rest.some((a, i) => a === "--permissions-scope" && rest[i + 1])) {
    out.permissionsScope = "project";
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
  --permissions <preset>       MCP auto-approve preset (default: basic)
  --no-permissions             skip MCP permission rules (same as --permissions none)
  --permissions-scope user|project
                               Claude settings scope (default: user)
  --no-skills                  skip IDE skill bundle install
  --force-skills               overwrite existing skill files (alias: --force)
  --permissions-tool <name>    repeat for custom preset allow list
  --permissions-ask-tool <name> repeat for custom preset ask list (Claude)

Aliases:  gcp brain setup_cursor | setup_codex | setup_claude | setup_claudecode

Per-IDE details:  README_CURSOR_MCP.md, README_CODEX_MCP.md, README_CLAUDE_CODE_MCP.md
`.trim()
  );
}

/**
 * @param {string[]} args
 */
async function cmdBrainPermissions(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    console.log(
      `
Usage: gcp brain permissions <print|apply> [options]

  --preset none|all|basic|read|balanced|custom   default: basic
  --client claude|cursor|all                     default: all for apply
  --server-name <name>                           default: ghostcrab-personal-mcp
  --permissions-scope user|project               Claude only (default: user)
  --permissions-tool <name>                      repeat (custom preset)
  --force                                        replace ghostcrab rules in target file
  --dry-run

Examples:
  gcp brain permissions print --preset basic --client all
  gcp brain permissions apply --preset balanced --client cursor --force
`.trim()
    );
    return;
  }

  const { runPermissionsPrint, runPermissionsApply } =
    await import("../lib/mcp-setup-post.mjs");

  let preset = "basic";
  let client = sub === "print" ? "all" : "all";
  let serverName = "ghostcrab-personal-mcp";
  let permissionsScope = "user";
  let force = false;
  let dryRun = false;
  /** @type {string[]} */
  const allowTools = [];

  const rest = args.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--preset" && rest[i + 1]) {
      preset = rest[++i];
      continue;
    }
    if (a === "--client" && rest[i + 1]) {
      client = rest[++i];
      continue;
    }
    if ((a === "--name" || a === "--server-name") && rest[i + 1]) {
      serverName = rest[++i];
      continue;
    }
    if (a === "--permissions-scope" && rest[i + 1]) {
      permissionsScope = rest[++i];
      continue;
    }
    if (a === "--permissions-tool" && rest[i + 1]) {
      allowTools.push(rest[++i]);
      preset = "custom";
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    console.error(`gcp brain permissions: unknown argument "${a}"`);
    process.exit(1);
  }

  if (sub === "print") {
    const r = await runPermissionsPrint({
      preset,
      client,
      serverName,
      cwd: process.cwd(),
      permissionsScope,
      dryRun,
      allowTools
    });
    if (!r.ok) process.exit(1);
    return;
  }

  if (sub === "apply") {
    const r = await runPermissionsApply({
      preset,
      client,
      serverName,
      cwd: process.cwd(),
      permissionsScope,
      force,
      dryRun,
      allowTools
    });
    if (!r.ok) {
      console.error(r.message ?? "permissions apply failed");
      process.exit(1);
    }
    for (const m of r.messages ?? []) console.log(m);
    return;
  }

  console.error(`gcp brain permissions: unknown subcommand "${sub}"`);
  process.exit(1);
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
  reset --id <id> --confirm
                      Wipe workspace-scoped MindBrain data (MCP mirror)
  delete --id <id> --confirm [--mode hard|soft]
                      Remove or archive a workspace after data wipe

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

  if (sub === "reset" || sub === "delete") {
    const { runCli } = await import("../../dist/cli/runner.js");
    await runCli(["workspace", sub, ...rest]);
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
  up [--workspace <name>] [--install-skills]
                                           Start MindBrain backend + MCP on stdio
  workspace create [name]                 Register a workspace & data paths
  workspace list                          List workspaces
  schema <list|pull|remove|show>           Ontologies / knowledge structure in the DB
  ontology import|export [opts]           Import/export OWL2 N-Triples into MindBrain
  db-who [--path] [--workspace]            Which processes have the SQLite file open (lsof)
  document [--workspace] [--db] [--force] <cmd>
                                           Corpus import / normalize / profile (stop MCP first)
  backup [opts]                           Export workspace, collection, or taxonomy backup bundle
  export [opts]                           Alias for backup
  load <file.jsonl|backup.json>           Load JSONL profile or restore backup bundle
  setup <cursor|codex|claude> [opts]     User-global MCP: ~/.cursor/mcp.json, codex mcp add, or claude mcp add
  permissions <print|apply> [opts]       MCP tool permission presets (Claude / Cursor)

Examples:
  gcp brain up --workspace my-app
  gcp brain workspace create my-app
  gcp brain schema pull mindflight/mindbrain
  gcp brain ontology import --workspace-id my_ws --ontology-id my_ws::owl --input ./ontology.nt --materialize-graph
  gcp brain ontology export --ontology-id my_ws::owl --format ntriples -o ./ontology.nt
  gcp brain backup --workspace-id my_ws --output ./backup.json
  gcp brain backup --workspace-id my_ws --scope taxonomies --output ./taxonomies.json
  gcp brain export --workspace-id my_ws --scope collection --collection-id my_ws::docs -o ./docs.json
  gcp brain document document-profile-worker --base-url https://api.openai.com/v1 --model gpt-4.1-mini --limit 2
  gcp brain load ./profile.jsonl
  gcp brain load ./backup.json --dry-run
  gcp brain setup cursor --dry-run
  gcp brain setup claude --runner pnpm

Shorthand:  gcp up   and   gcp start   mean the same as   gcp brain up
Legacy:     gcp serve  (same as gcp brain up)
`.trim()
  );
}
