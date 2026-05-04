/**
 * gcp skills list [--remote]
 * gcp skills pull <owner/name> [--token <tok>] [--registry <url>]
 * gcp skills remove <owner/name>
 * gcp skills show <owner/name>
 */

import { readConfig } from "../lib/cli-config.mjs";
import {
  fetchResource,
  listRegistryResources,
  applyWatermark,
} from "../lib/registry.mjs";
import {
  listLocal,
  saveLocal,
  removeLocal,
  readLocalContent,
  parseResourceId,
  typeDir,
} from "../lib/local-store.mjs";

const TYPE = "skills";

export async function cmdSkills(args) {
  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case "list":
      return skillsList(rest);
    case "pull":
      return skillsPull(rest);
    case "remove":
    case "rm":
      return skillsRemove(rest);
    case "show":
      return skillsShow(rest);
    case undefined:
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(
        `gcp skills: unknown subcommand "${sub}". Run "gcp skills --help".`
      );
      process.exit(1);
  }
}

// ── list ─────────────────────────────────────────────────────────────────────

async function skillsList(args) {
  const remote = args.includes("--remote");

  if (remote) {
    const config = readConfig();
    const token = resolveToken(args, config);
    const registryUrl = resolveRegistryUrl(args, config);
    console.log(`Fetching from ${registryUrl} …\n`);
    try {
      const items = await listRegistryResources({ registryUrl, token, type: TYPE });
      if (items.length === 0) {
        console.log("No skills available in registry.");
        return;
      }
      for (const item of items) {
        const lock = item.access === "private" ? "🔒" : "  ";
        const ver =
          item.version != null && String(item.version).length > 0
            ? ` v${item.version}`
            : "";
        console.log(`${lock} ${item.owner}/${item.name}${ver}  (${item.access})`);
        if (item.description) console.log(`     ${item.description}`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  const items = listLocal(TYPE);
  if (items.length === 0) {
    console.log(
      `No skills installed locally.\n` +
        `  Pull one with: gcp skills pull <owner/name>\n` +
        `  Browse remote: gcp skills list --remote`
    );
    return;
  }
  console.log(`Locally installed skills (${typeDir(TYPE)}):\n`);
  for (const item of items) {
    const lock = item.access === "private" ? "[private]" : "[public] ";
    console.log(
      `  ${lock} ${item.owner}/${item.name}  v${item.version ?? "?"}  pulled ${item.pulledAt ?? "?"}`
    );
  }
}

// ── pull ──────────────────────────────────────────────────────────────────────

async function skillsPull(args) {
  const id = args.find((a) => !a.startsWith("-"));
  if (!id) {
    console.error(`gcp skills pull: resource ID required (e.g. mindflight/coding-assistant)`);
    process.exit(1);
  }

  let owner, name;
  try {
    ({ owner, name } = parseResourceId(id));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const config = readConfig();
  const token = resolveToken(args, config);
  const registryUrl = resolveRegistryUrl(args, config);

  console.log(`Pulling ${owner}/${name} from ${registryUrl} …`);

  let data;
  try {
    data = await fetchResource({ registryUrl, token, type: TYPE, owner, name });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  let { content, version, access, licensee } = data;

  if (access === "private" && licensee) {
    content = applyWatermark(content, {
      resourceId: `${owner}/${name}`,
      licensee,
      pulledAt: new Date().toISOString(),
    });
  }

  const pulledAt = new Date().toISOString();
  saveLocal(TYPE, {
    owner,
    name,
    content,
    manifest: { version, access, licensee: licensee ?? null, pulledAt, registryUrl },
  });

  console.log(`✓ Installed ${owner}/${name} v${version ?? "?"} [${access}]`);
  console.log(`  Location: ${typeDir(TYPE)}/${owner}/${name}/`);
}

// ── remove ───────────────────────────────────────────────────────────────────

async function skillsRemove(args) {
  const id = args.find((a) => !a.startsWith("-"));
  if (!id) {
    console.error(`gcp skills remove: resource ID required`);
    process.exit(1);
  }

  let owner, name;
  try {
    ({ owner, name } = parseResourceId(id));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const removed = removeLocal(TYPE, owner, name);
  if (removed) {
    console.log(`✓ Removed ${owner}/${name}`);
  } else {
    console.error(`"${owner}/${name}" is not installed locally.`);
    process.exit(1);
  }
}

// ── show ──────────────────────────────────────────────────────────────────────

async function skillsShow(args) {
  const id = args.find((a) => !a.startsWith("-"));
  if (!id) {
    console.error(`gcp skills show: resource ID required`);
    process.exit(1);
  }

  let owner, name;
  try {
    ({ owner, name } = parseResourceId(id));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const content = readLocalContent(TYPE, owner, name);
  if (content === null) {
    console.error(
      `"${owner}/${name}" is not installed. Run: gcp skills pull ${owner}/${name}`
    );
    process.exit(1);
  }
  process.stdout.write(content);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function resolveToken(args, config) {
  const idx = args.findIndex((a) => a === "--token" || a === "-t");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return config.registry?.token ?? null;
}

function resolveRegistryUrl(args, config) {
  const idx = args.findIndex((a) => a === "--registry" || a === "-r");
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return config.registry?.url ?? "https://registry.ghostcrab.io";
}

function printHelp() {
  console.log(`
Usage: gcp agent skills <subcommand>   (recommended — “equip agents”)
       gcp skills <subcommand>         (alias)

Subcommands:
  list [--remote]              List local (or remote) skills
  pull <owner/name> [flags]    Download a skill from the registry
  remove <owner/name>          Remove a locally installed skill
  show <owner/name>            Print skill content to stdout

Pull flags:
  --token <tok>     Override registry.token from config
  --registry <url>  Override registry.url from config

Examples:
  gcp skills list
  gcp skills list --remote
  gcp skills pull mindflight/coding-assistant
  gcp skills pull company/internal --token sk_live_xyz
  gcp skills remove mindflight/coding-assistant
`.trim());
}
