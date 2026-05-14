/**
 * gcp init [workspace-name]
 *
 * Initialises a named workspace:
 *   - Registers it in ~/.config/ghostcrab/config.json
 *   - Creates the data directory for the SQLite file
 *   - Prints the MCP client config snippet to copy-paste
 *
 * The SQLite database itself is created by the backend on first `gcp brain up` (or `gcp serve`).
 */

import { mkdirSync, existsSync } from "node:fs";
import {
  readConfig,
  writeConfig,
  getConfigPath,
} from "../lib/cli-config.mjs";
import { getDataDir } from "../lib/data-dir.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maybeInstallIdeSkills } from "../lib/install-ide-skills.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdInit(args) {
  let skipIdeSkills = false;
  let forceIdeSkills = false;
  const pos = [];
  for (const a of args) {
    if (a === "--no-skills") {
      skipIdeSkills = true;
      continue;
    }
    if (a === "--force-skills") {
      forceIdeSkills = true;
      continue;
    }
    pos.push(a);
  }

  const rawName = pos[0] ?? "default";
  const workspaceName = slugifyWorkspace(rawName);

  if (!workspaceName) {
    console.error(
      `gcp init: workspace name "${rawName}" produced an empty slug.\n` +
        `  Use a name that contains at least one letter or digit.`
    );
    process.exit(1);
  }

  if (workspaceName !== rawName) {
    console.log(`  Name normalised: "${rawName}" → "${workspaceName}"`);
  }

  const config = readConfig();
  const dataDir = getDataDir();
  const sqlitePath = join(dataDir, "workspaces", `${workspaceName}.sqlite`);

  // ── Already exists ────────────────────────────────────────────────────────
  if (config.workspaces?.[workspaceName]) {
    const ws = config.workspaces[workspaceName];
    console.log(`Workspace "${workspaceName}" is already initialised.`);
    console.log(`  Config : ${getConfigPath()}`);
    console.log(`  SQLite : ${ws.sqlitePath}`);
    console.log(``);
    printMcpSnippet(workspaceName);
    maybeInstallIdeSkills({
      cwd: process.cwd(),
      pkgRoot,
      skip: skipIdeSkills,
      force: forceIdeSkills,
      context: "init",
    });
    return;
  }

  // ── Register new workspace ────────────────────────────────────────────────
  if (!config.workspaces) config.workspaces = {};
  config.workspaces[workspaceName] = {
    sqlitePath,
  };
  if (!config.defaultWorkspace) {
    config.defaultWorkspace = workspaceName;
  }

  writeConfig(config);

  // Ensure the data directory exists (backend creates the .sqlite file itself)
  const wsDataDir = join(dataDir, "workspaces");
  if (!existsSync(wsDataDir)) {
    mkdirSync(wsDataDir, { recursive: true });
  }

  console.log(`✓ Workspace "${workspaceName}" initialised`);
  console.log(`  Config : ${getConfigPath()}`);
  console.log(`  SQLite : ${sqlitePath}`);
  if (config.defaultWorkspace === workspaceName) {
    console.log(`  Default: yes`);
  }
  console.log(``);
  printMcpSnippet(workspaceName);
  maybeInstallIdeSkills({
    cwd: process.cwd(),
    pkgRoot,
    skip: skipIdeSkills,
    force: forceIdeSkills,
    context: "init",
  });
}

function printMcpSnippet(workspaceName) {
  const args =
    workspaceName === "default"
      ? ["brain", "up"]
      : ["brain", "up", "--workspace", workspaceName];

  const snippet = {
    "ghostcrab-personal-mcp": {
      command: "gcp",
      args,
    },
  };

  console.log(`Add this to your MCP client config:\n`);
  console.log(JSON.stringify(snippet, null, 2));
  console.log(``);
  console.log(
    `The SQLite database will be created automatically on first start.\n` +
      `  Legacy: you can replace "brain", "up" with a single "serve" if you prefer.`
  );
}
