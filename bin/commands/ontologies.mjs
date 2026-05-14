/**
 * gcp ontologies list [--remote]
 * gcp ontologies pull <owner/name> [--token <tok>] [--registry <url>]
 * gcp ontologies remove <owner/name>
 * gcp ontologies show <owner/name>
 */

import { readConfig } from "../lib/cli-config.mjs";
import {
  fetchResource,
  listRegistryResources,
  applyWatermark,
  resolveRegistryToken,
  resolveRegistryUrl,
} from "../lib/registry.mjs";
import {
  listLocal,
  saveLocal,
  removeLocal,
  readLocalContent,
  parseResourceId,
  typeDir,
} from "../lib/local-store.mjs";

const TYPE = "ontologies";

export async function cmdOntologies(args) {
  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case "list":
      return ontologiesList(rest);
    case "pull":
      return ontologiesPull(rest);
    case "remove":
    case "rm":
      return ontologiesRemove(rest);
    case "show":
      return ontologiesShow(rest);
    case undefined:
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(
        `gcp ontologies: unknown subcommand "${sub}". Run "gcp ontologies --help".`
      );
      process.exit(1);
  }
}

// ── list ─────────────────────────────────────────────────────────────────────

async function ontologiesList(args) {
  const remote = args.includes("--remote");

  if (remote) {
    const config = readConfig();
    const token = resolveRegistryToken(args, config);
    const registryUrl = resolveRegistryUrl(args, config);
    console.log(`Fetching from ${registryUrl} …\n`);
    try {
      const items = await listRegistryResources({ registryUrl, token, type: TYPE });
      if (items.length === 0) {
        console.log("No ontologies available in registry.");
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

  // Local listing
  const items = listLocal(TYPE);
  if (items.length === 0) {
    console.log(
      `No ontologies installed locally.\n` +
        `  Pull one with: gcp ontologies pull <owner/name>\n` +
        `  Browse remote: gcp ontologies list --remote`
    );
    return;
  }
  console.log(`Locally installed ontologies (${typeDir(TYPE)}):\n`);
  for (const item of items) {
    const lock = item.access === "private" ? "[private]" : "[public] ";
    console.log(
      `  ${lock} ${item.owner}/${item.name}  v${item.version ?? "?"}  pulled ${item.pulledAt ?? "?"}`
    );
  }
}

// ── pull ──────────────────────────────────────────────────────────────────────

async function ontologiesPull(args) {
  const id = args.find((a) => !a.startsWith("-"));
  if (!id) {
    console.error(`gcp ontologies pull: resource ID required (e.g. mindflight/mindbrain)`);
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
  const token = resolveRegistryToken(args, config);
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

  // Apply watermark for private resources
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

async function ontologiesRemove(args) {
  const id = args.find((a) => !a.startsWith("-"));
  if (!id) {
    console.error(`gcp ontologies remove: resource ID required`);
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

async function ontologiesShow(args) {
  const id = args.find((a) => !a.startsWith("-"));
  if (!id) {
    console.error(`gcp ontologies show: resource ID required`);
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
      `"${owner}/${name}" is not installed. Run: gcp ontologies pull ${owner}/${name}`
    );
    process.exit(1);
  }
  process.stdout.write(content);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
Usage: gcp brain schema <subcommand>   (recommended — “structure in the DB”)
       gcp ontologies <subcommand>     (alias)

Subcommands:
  list [--remote]              List local (or remote) ontologies
  pull <owner/name> [flags]    Download an ontology from the registry
  remove <owner/name>          Remove a locally installed ontology
  show <owner/name>            Print ontology content to stdout

Pull flags:
  --token <tok>     Override registry.token from config
  --registry <url>  Override registry.url from config

Examples:
  gcp ontologies list
  gcp ontologies list --remote
  gcp ontologies pull mindflight/mindbrain
  gcp ontologies pull company/internal --token sk_live_xyz
  gcp ontologies remove mindflight/mindbrain
`.trim());
}
