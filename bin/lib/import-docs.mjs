/**
 * Resolve and print full import runbooks from docs/setup/.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PKG_ROOT = join(__dirname, "..", "..");

/** @type {Record<string, { title: string, path: string }>} */
export const IMPORT_DOC_TOPICS = {
  structured: {
    title: "Structured import (tabular)",
    path: "docs/setup/structured-import.md"
  },
  document: {
    title: "Document import (PDF/HTML/MD corpus)",
    path: "docs/setup/document-import.md"
  }
};

/**
 * @param {string} topic
 * @returns {string}
 */
export function readImportDoc(topic) {
  const entry = IMPORT_DOC_TOPICS[topic];
  if (!entry) {
    throw new Error(`Unknown import doc topic: ${topic}`);
  }
  const abs = join(PKG_ROOT, entry.path);
  if (!existsSync(abs)) {
    throw new Error(`Runbook not found: ${abs}`);
  }
  return readFileSync(abs, "utf8");
}

export function printImportDocsList() {
  console.log(
    `
gcp brain docs — full import runbooks (Markdown from the installed package)

Topics:
  structured   Tabular CSV/JSON/YAML/XLSX/TOON (gcp brain structured-import)
  document     PDF/HTML corpus (gcp brain document)
  import       Print both runbooks (structured, then document)

Usage:
  gcp brain docs [--list]
  gcp brain docs structured
  gcp brain docs document
  gcp brain docs import

Quick CLI help (subcommands only):
  gcp brain structured-import --help
  gcp brain document --help
`.trim()
  );
}

/**
 * @param {string[]} args
 */
export async function cmdBrainDocs(args) {
  if (
    !args.length ||
    args[0] === "--help" ||
    args[0] === "-h" ||
    args[0] === "help"
  ) {
    printImportDocsList();
    return;
  }

  if (args[0] === "--list" || args[0] === "list") {
    for (const [key, entry] of Object.entries(IMPORT_DOC_TOPICS)) {
      console.log(`${key.padEnd(12)} ${entry.title}\n  ${entry.path}`);
    }
    return;
  }

  const topic = args[0];
  if (topic === "import" || topic === "all") {
    for (const key of ["structured", "document"]) {
      const entry = IMPORT_DOC_TOPICS[key];
      console.log(`# ${entry.title}\n`);
      console.log(readImportDoc(key));
      if (key !== "document") {
        console.log("\n---\n");
      }
    }
    return;
  }

  if (!IMPORT_DOC_TOPICS[topic]) {
    console.error(
      `gcp brain docs: unknown topic "${topic}". Run "gcp brain docs --list".`
    );
    process.exit(1);
  }

  console.log(readImportDoc(topic));
}
