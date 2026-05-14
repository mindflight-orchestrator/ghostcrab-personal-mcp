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
  case "smoke":
  case "status":
  case "tools":
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
  case undefined:
  case "--help":
  case "-h":
  case "help":
    printHelp();
    break;
  default:
    console.error(`gcp: unknown command "${cmd}". Run "gcp --help" for usage.\n`);
    process.exit(1);
}

function printHelp() {
  console.log(`
GhostCrab CLI — durable structured memory for AI agents

Usage: gcp <command> [options]

── JTBD (recommended) ──
  brain up [--workspace <name>]     Start MindBrain (Zig) + MCP on stdio
  smoke                            Read-only backend/tool registration check
  status                           Read-only operational snapshot
  tools list                       List MCP tools and schemas
  maintenance ddl-approve|ddl-execute
                                    Human DDL approval/execution controls
  brain workspace create [name]   Create / register a workspace
  brain workspace list            List workspaces
  brain schema <sub>              Ontologies (knowledge structure in the DB)
  brain load <file.jsonl>         Load a portable JSONL profile
  brain document <cmd> [args]     Corpus normalize/profile/ingest (stop MCP first)
  brain setup <cursor|codex|claude>  User-global MCP (see README_*_MCP.md)
  bootstrap                          Create .env / data/ / README symlinks in cwd
  agent skills <sub>              Registry skills (agent capabilities)
  agent equip <owner/name>        Shortcut for: agent skills pull
  env list | show | get | set     GhostCrab config file (~/.config/ghostcrab/…)
  env path

  gcp up | gcp start              Same as  gcp brain up

── Legacy (same behavior) ──
  serve, init, config, ontologies, skills, load, authorize, bootstrap

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
  gcp brain workspace create and gcp brain up can copy default rules from ghostcrab-skills
  when that tree is available.  --no-skills  /  GHOSTCRAB_SKIP_IDE_SKILLS=1  to skip.

Run  gcp brain --help   /   gcp agent --help   /   gcp env --help   for details.
`.trim());
}
