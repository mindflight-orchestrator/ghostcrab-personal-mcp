/**
 * gcp config …  (legacy)  —  same as  gcp env …
 *
 * Keys use dot notation: registry.url, registry.token, defaultWorkspace, etc.
 */

import {
  readConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
  flattenConfig,
  getConfigPath,
} from "../lib/cli-config.mjs";

let configLabel = "gcp config";

export async function cmdConfig(args, options = {}) {
  configLabel = options.label ?? "gcp config";
  const sub = args[0];

  switch (sub) {
    case "list":
    case "show":
      return configList();
    case "get":
      return configGet(args[1]);
    case "set":
      return configSet(args[1], args[2]);
    case "path":
      console.log(getConfigPath());
      return;
    case undefined:
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(
        `${configLabel}: unknown subcommand "${sub}". Run "${configLabel} --help".`
      );
      process.exit(1);
  }
}

function configList() {
  const config = readConfig();
  const entries = flattenConfig(config);
  if (entries.length === 0) {
    console.log("(no config)");
    return;
  }
  const maxKey = Math.max(...entries.map(([k]) => k.length));
  for (const [k, v] of entries) {
    const display =
      k === "registry.token" && v
        ? "****** (set, hidden)"
        : v === null
          ? "(not set)"
          : String(v);
    console.log(`${k.padEnd(maxKey)}  ${display}`);
  }
}

function configGet(key) {
  if (!key) {
    console.error(`${configLabel} get: key required`);
    process.exit(1);
  }
  const config = readConfig();
  const value = getConfigValue(config, key);
  if (value === undefined) {
    console.error(`${configLabel} get: key "${key}" not found`);
    process.exit(1);
  }
  if (key === "registry.token" && value) {
    console.log("(set, hidden)");
  } else {
    console.log(value === null ? "(not set)" : String(value));
  }
}

function configSet(key, value) {
  if (!key) {
    console.error(`${configLabel} set: key required`);
    process.exit(1);
  }
  if (value === undefined) {
    console.error(`${configLabel} set: value required`);
    process.exit(1);
  }
  const config = readConfig();
  setConfigValue(config, key, value);
  writeConfig(config);

  const display =
    key === "registry.token" ? "(set, hidden)" : String(value);
  console.log(`${key} = ${display}`);
  console.log(`Saved to ${getConfigPath()}`);
}

function printHelp() {
  const isEnv = configLabel === "gcp env";
  const also = isEnv
    ? `  (legacy: gcp config … — same subcommands)\n`
    : `  (preferred: gcp env … — same subcommands)\n`;
  console.log(
    `
Usage: ${configLabel} <subcommand>
${also}
Subcommands:
  list, show         List all config values  (${isEnv ? "show" : "list"} is an alias of the other)
  get <key>          Print a single value (dot notation)
  set <key> <val>    Set a value
  path               Print path to config file

Common keys:
  registry.url        Registry server URL   (default: https://registry.ghostcrab.io)
  registry.token      API token for private resources
  defaultWorkspace    Name of the workspace used when --workspace is omitted

Examples:
  ${configLabel} set registry.token sk_live_xyz
  ${configLabel} set registry.url https://my-internal-registry.example.com
  ${configLabel} set defaultWorkspace work
  ${configLabel} list
`.trim()
  );
}
