#!/usr/bin/env node
/**
 * gcp — GhostCrab CLI
 *
 * Two JTBD axes:
 *   brain  — MindBrain / SQLite: start backend, workspaces, knowledge schema
 *   agent  — skills / capabilities for MCP agents
 *   env    — CLI + MCP config file
 *
 * Legacy one-word commands (serve, init, config, …) remain as aliases.
 */

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case "--version":
  case "-v":
  case "version": {
    const { version } = await readPackageInfo();
    console.log(version);
    break;
  }
  case "--info":
  case "info": {
    await printInfo();
    break;
  }
  case "brain": {
    const { cmdBrain } = await import("./commands/brain.mjs");
    await cmdBrain(rest);
    break;
  }
  case "agent": {
    const { cmdAgent } = await import("./commands/agent.mjs");
    await cmdAgent(rest);
    break;
  }
  case "env": {
    const { cmdEnv } = await import("./commands/env.mjs");
    await cmdEnv(rest);
    break;
  }
  case "up":
  case "start": {
    const { runServe } = await import("./commands/serve.mjs");
    await runServe(rest);
    break;
  }
  case "down": {
    const { cmdBrainDown } = await import("./commands/brain-down.mjs");
    await cmdBrainDown(rest);
    break;
  }
  case "smoke":
  case "status":
  case "tools":
  case "workspace":
  case "maintenance": {
    const { runCli } = await import("../dist/cli/runner.js");
    await runCli([cmd, ...rest]);
    break;
  }
  case "serve": {
    const { runServe } = await import("./commands/serve.mjs");
    await runServe(rest);
    break;
  }
  case "init": {
    const { cmdInit } = await import("./commands/init.mjs");
    await cmdInit(rest);
    break;
  }
  case "config": {
    const { cmdConfig } = await import("./commands/config-cmd.mjs");
    await cmdConfig(rest);
    break;
  }
  case "ontologies": {
    const { cmdOntologies } = await import("./commands/ontologies.mjs");
    await cmdOntologies(rest);
    break;
  }
  case "skills": {
    const { cmdSkills } = await import("./commands/skills.mjs");
    await cmdSkills(rest);
    break;
  }
  case "load": {
    const { cmdLoad } = await import("./commands/load.mjs");
    await cmdLoad(rest);
    break;
  }
  case "authorize": {
    const { cmdAuthorize } = await import("./commands/authorize.mjs");
    await cmdAuthorize(rest);
    break;
  }
  case "bootstrap": {
    const { cmdBootstrap } = await import("./commands/bootstrap.mjs");
    await cmdBootstrap(rest);
    break;
  }
  case "path": {
    const { cmdPath } = await import("./commands/path.mjs");
    await cmdPath(rest);
    break;
  }
  case undefined:
  case "--help":
  case "-h":
  case "help":
    printHelp();
    break;
  default:
    console.error(
      `gcp: unknown command "${cmd}". Run "gcp --help" for usage.\n`
    );
    process.exit(1);
}

function printHelp() {
  console.log(
    `
GhostCrab CLI — durable structured memory for AI agents

Usage: gcp <command> [options]

Info:
  --version | version              Print installed GhostCrab package version
  --info | info                    Print install paths and offline defaults

── JTBD (recommended) ──
  brain up [--workspace <id>]       Start MindBrain (Zig) + MCP on stdio
  brain down [--all]                Stop the MindBrain backend (current DB or all)
  smoke                            Read-only backend/tool registration check
  status                           Read-only operational snapshot
  tools list                       List MCP tools (recommended + full catalog metadata)
  tools verify                     Verify full MCP catalog list + call smoke
  maintenance ddl-approve|ddl-execute
                                    Human DDL approval/execution controls
  brain workspace create [name]   Create / register a workspace
  brain workspace list            List workspaces
  brain schema <sub>              Ontologies (knowledge structure in the DB)
  brain ontology import|export    Import/export OWL2 N-Triples
  brain backup [opts]             Export workspace/collection/taxonomy backup
  brain export [opts]             Alias for brain backup
  brain load <file>               Load JSONL profile or restore backup bundle (--overwrite --confirm to replace)
  brain document <cmd> [args]     Corpus normalize/profile/ingest (stop MCP first)
  brain structured-import <cmd>   Tabular CSV/JSON import (stop MCP first)
  brain docs [topic]              Full import runbooks (structured | document | import)
  brain setup <cursor|codex|claude|generic>
                                    User-global MCP + IDE skills (generic prints snippets)
  bootstrap                          Create .env / data/ / README symlinks in cwd
  path install|print|doctor          Cross-platform PATH shim (~/.ghostcrab/bin)
  agent skills <sub>              Registry skills (agent capabilities)
  agent equip <owner/name>        Shortcut for: agent skills pull
  env list | show | get | set     GhostCrab config file (~/.ghostcrab/…)
  env path

  gcp up | gcp start              Same as  gcp brain up
  gcp down                        Same as  gcp brain down

── Legacy (same behavior) ──
  serve, init, config, ontologies, skills, load, authorize, bootstrap, path

Quick start (new names):
  gcp brain workspace create my-app
  gcp brain up --workspace my-app

Registry:
  gcp env set registry.token <tok>
  gcp brain schema pull mindflight/mindbrain
  gcp agent skills pull mindflight/some-skill

MCP client example:
  { "command": "gcp", "args": ["brain", "up", "--workspace", "my-app"] }
  { "command": "gcp", "args": ["up"] }   # default workspace; same as: "serve"

IDE skills (Cursor / Claude Code / Codex):
  gcp init can copy default rules from ghostcrab-skills when that tree is available.
  gcp brain up --install-skills does the same explicitly during server startup.

Run  gcp brain --help   /   gcp agent --help   /   gcp env --help   for details.
`.trim()
  );
}

async function printInfo() {
  const { existsSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { getConfigPath, readConfig } = await import("./lib/cli-config.mjs");
  const { resolveGhostcrabSqlite } =
    await import("./lib/resolve-ghostcrab-sqlite.mjs");

  const cliPath = fileURLToPath(import.meta.url);
  const { packageJsonPath, packageRoot, version, name } =
    await readPackageInfo();
  const sqlite = resolveGhostcrabSqlite({
    workspaceNameFromCli: null,
    sqlitePathFromCli: null,
    defaultFromCli: false
  });
  const configPath = getConfigPath();
  const config = readConfig();
  const mindbrainUrl =
    process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";

  const lines = [
    "GhostCrab CLI info",
    `  Package: ${name}@${version}`,
    `  Package root: ${packageRoot}`,
    `  Package manifest: ${packageJsonPath}`,
    `  CLI script: ${cliPath}`,
    `  Invoked as: ${process.argv[1] ?? cliPath}`,
    `  Current dir: ${process.cwd()}`,
    `  Node: ${process.version}`,
    `  Platform: ${process.platform}-${process.arch}`,
    "",
    "Defaults",
    `  SQLite database: ${sqlite.sqlitePathResolved}`,
    `  SQLite source: ${sqlite.sqlitePathSource}`,
    `  SQLite exists: ${existsSync(sqlite.sqlitePathResolved) ? "yes" : "no"}`,
    `  Data dir: ${dirname(sqlite.sqlitePathResolved)}`,
    `  MindBrain URL: ${mindbrainUrl}`,
    `  Backend addr env: ${process.env.GHOSTCRAB_BACKEND_ADDR ?? "(unset)"}`,
    "",
    "User config",
    `  Config file: ${configPath}`,
    `  Config exists: ${existsSync(configPath) ? "yes" : "no"}`,
    `  Default workspace: ${config.defaultWorkspace ?? "(none)"}`,
    `  Workspaces: ${Object.keys(config.workspaces ?? {}).length}`
  ];

  console.log(lines.join("\n"));
}

async function readPackageInfo() {
  const { readFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const packageJsonPath = fileURLToPath(packageJsonUrl);
  const raw = await readFile(packageJsonUrl, "utf8");
  const pkg = JSON.parse(raw);

  return {
    name: typeof pkg.name === "string" ? pkg.name : "unknown",
    version: typeof pkg.version === "string" ? pkg.version : "unknown",
    packageJsonPath,
    packageRoot: dirname(packageJsonPath)
  };
}
