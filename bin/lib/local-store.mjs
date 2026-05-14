/**
 * Local storage for pulled ontologies and skills.
 *
 * Layout inside getDataDir():
 *   ontologies/{owner}/{name}/content.yaml
 *   ontologies/{owner}/{name}/manifest.json
 *   skills/{owner}/{name}/content.md
 *   skills/{owner}/{name}/manifest.json
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./data-dir.mjs";

export function typeDir(type) {
  return join(getDataDir(), type); // "ontologies" | "skills"
}

/** List all locally stored resources of a given type. */
export function listLocal(type) {
  const base = typeDir(type);
  if (!existsSync(base)) return [];

  const results = [];
  for (const owner of readdirSync(base)) {
    const ownerDir = join(base, owner);
    try {
      if (!statSync(ownerDir).isDirectory()) continue;
    } catch {
      continue;
    }
    for (const name of readdirSync(ownerDir)) {
      const nameDir = join(ownerDir, name);
      try {
        if (!statSync(nameDir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifestPath = join(ownerDir, name, "manifest.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        results.push({ owner, name, ...manifest });
      } catch {
        results.push({ owner, name, version: "?", access: "?", pulledAt: "?" });
      }
    }
  }
  return results;
}

/** Save a pulled resource to local storage. */
export function saveLocal(type, { owner, name, content, manifest }) {
  const dir = join(typeDir(type), owner, name);
  mkdirSync(dir, { recursive: true });

  const ext = type === "ontologies" ? "yaml" : "md";
  writeFileSync(join(dir, `content.${ext}`), content, "utf8");
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
}

/** Remove a locally stored resource. Returns true if it existed. */
export function removeLocal(type, owner, name) {
  const dir = join(typeDir(type), owner, name);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

/** Read local resource content. Returns null if not found. */
export function readLocalContent(type, owner, name) {
  const ext = type === "ontologies" ? "yaml" : "md";
  const path = join(typeDir(type), owner, name, `content.${ext}`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/** Parse "owner/name" resource ID string. */
export function parseResourceId(id) {
  const parts = id.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid resource ID "${id}". Expected format: owner/name (e.g. mindflight/mindbrain)`
    );
  }
  return { owner: parts[0], name: parts[1] };
}
