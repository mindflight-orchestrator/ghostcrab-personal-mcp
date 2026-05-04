/**
 * Config file: $GHOSTCRAB_CONFIG_DIR/config.json
 *
 * Schema:
 * {
 *   "registry": { "url": "https://...", "token": null },
 *   "workspaces": {
 *     "default": { "sqlitePath": "/abs/path/ghostcrab.sqlite" }
 *   },
 *   "defaultWorkspace": "default"
 * }
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./data-dir.mjs";

const CONFIG_FILE = "config.json";

export const DEFAULT_CONFIG = {
  registry: {
    url: "https://registry.ghostcrab.io",
    token: null,
  },
  workspaces: {},
  defaultWorkspace: null,
};

export function getConfigPath() {
  return join(getConfigDir(), CONFIG_FILE);
}

export function readConfig() {
  const path = getConfigPath();
  if (!existsSync(path)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = readFileSync(path, "utf8");
    return { ...structuredClone(DEFAULT_CONFIG), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function writeConfig(config) {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    getConfigPath(),
    JSON.stringify(config, null, 2) + "\n",
    "utf8"
  );
}

/** Get a nested value by dot-path, e.g. "registry.url" */
export function getConfigValue(config, keyPath) {
  return keyPath.split(".").reduce((obj, key) => obj?.[key], config);
}

/** Set a nested value by dot-path, mutates config in place */
export function setConfigValue(config, keyPath, value) {
  const parts = keyPath.split(".");
  let cur = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  const leaf = parts.at(-1);
  if (value === "null") cur[leaf] = null;
  else if (value === "true") cur[leaf] = true;
  else if (value === "false") cur[leaf] = false;
  else cur[leaf] = value;
}

/** Flatten config object into dot-path entries for display */
export function flattenConfig(obj, prefix = "") {
  const entries = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      entries.push(...flattenConfig(v, full));
    } else {
      entries.push([full, v]);
    }
  }
  return entries;
}
