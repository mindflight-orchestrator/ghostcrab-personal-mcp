/**
 * gcp skills list [--remote]
 * gcp skills pull <owner/name> [--token <tok>] [--registry <url>]
 * gcp skills install --dir <path> [--id owner/name]
 * gcp skills remove <owner/name>
 * gcp skills show <owner/name>
 */

import { readConfig } from "../lib/cli-config.mjs";
import {
  fetchResource,
  listRegistryResources,
  applyWatermark,
} from "../lib/registry.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join as pathJoin, resolve } from "node:path";

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
    case "install":
      return skillsInstall(rest);
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

// ── install (local directory → same layout as registry pull) ───────────────────

/**
 * @param {string[]} args
 */
function skillsInstall(args) {
  let dirRaw = null;
  let idRaw = null;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if ((a === "--dir" || a === "-d") && args[i + 1]) {
      dirRaw = args[i + 1];
      i += 1;
      continue;
    }
    if ((a === "--id" || a === "-i") && args[i + 1]) {
      idRaw = args[i + 1];
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`
Usage: gcp agent skills install --dir <path> [--id owner/name]

  Copy a vendored skill folder into the local GhostCrab skill store (same on-disk
  layout as  gcp agent skills pull ). Content file resolution order:

    1. content.md
    2. SKILL.md
    3. first *.md in the directory (sorted)

  Optional manifest.json in the folder may include:
    { "owner", "name", "version", "access" }

  When owner/name are not in manifest.json, pass  --id owner/name .

Examples:
  gcp agent skills install --dir ./vendor/mindflight/my-skill
  gcp agent skills install --dir ./vendor/mindflight/my-skill --id mindflight/my-skill
`.trim());
      return;
    }
  }

  if (!dirRaw) {
    console.error(
      'gcp skills install: missing --dir <path>  (see: gcp agent skills install --help)'
    );
    process.exit(1);
  }

  const dirAbs = resolve(process.cwd(), dirRaw);
  if (!existsSync(dirAbs)) {
    console.error(`gcp skills install: directory not found: ${dirAbs}`);
    process.exit(1);
  }

  /** @type {{ owner?: string, name?: string, version?: string, access?: string } | null} */
  let fileManifest = null;
  const manifestPath = pathJoin(dirAbs, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      fileManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (err) {
      console.error(
        `gcp skills install: invalid JSON in ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  }

  let owner = idRaw ? null : fileManifest?.owner ?? null;
  let name = idRaw ? null : fileManifest?.name ?? null;

  if (idRaw) {
    try {
      ({ owner, name } = parseResourceId(idRaw));
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  if (!owner || !name) {
    console.error(
      `gcp skills install: need owner/name — add them to manifest.json in\n  ${dirAbs}\n` +
        "  or pass: --id owner/name"
    );
    process.exit(1);
  }

  let contentPath = null;
  for (const candidate of ["content.md", "SKILL.md"]) {
    const p = pathJoin(dirAbs, candidate);
    if (existsSync(p)) {
      contentPath = p;
      break;
    }
  }
  if (!contentPath) {
    const md = readdirSync(dirAbs)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .sort();
    if (md.length > 0) {
      contentPath = pathJoin(dirAbs, md[0]);
    }
  }

  if (!contentPath) {
    console.error(
      `gcp skills install: no content.md, SKILL.md, or other .md in\n  ${dirAbs}`
    );
    process.exit(1);
  }

  const content = readFileSync(contentPath, "utf8");
  const version = fileManifest?.version ?? "0.0.0";
  const access = fileManifest?.access ?? "public";
  const pulledAt = new Date().toISOString();

  saveLocal(TYPE, {
    owner,
    name,
    content,
    manifest: {
      version,
      access,
      licensee: null,
      pulledAt,
      sourceDir: dirAbs,
      installedVia: "local-dir",
    },
  });

  console.log(`✓ Installed ${owner}/${name} v${version} [${access}] (local dir)`);
  console.log(`  Source : ${dirAbs}`);
  console.log(`  Store  : ${typeDir(TYPE)}/${owner}/${name}/`);
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
  install --dir <path> [flags] Copy a vendored folder into the local skill store
  remove <owner/name>          Remove a locally installed skill
  show <owner/name>            Print skill content to stdout

Install flags:
  --id <owner/name>   When manifest.json in the folder omits owner/name

Pull flags:
  --token <tok>     Override registry.token from config
  --registry <url>  Override registry.url from config

Examples:
  gcp skills list
  gcp skills list --remote
  gcp skills pull mindflight/coding-assistant
  gcp skills pull company/internal --token sk_live_xyz
  gcp agent skills install --dir ./vendor/demo/hello-world
  gcp skills remove mindflight/coding-assistant
`.trim());
}
