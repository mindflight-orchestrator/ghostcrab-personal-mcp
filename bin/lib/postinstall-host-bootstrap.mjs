/**
 * When this package is installed as a dependency, drop a starter .env, ensure ./data,
 * and symlink shipped docs/skills into the consumer project root (best effort).
 *
 * - GHOSTCRAB_SKIP_HOST_BOOTSTRAP=1 — skip
 *
 * This script is intentionally fail-safe: any unexpected error is caught and logged so a
 * bug here can never silently abort the package's postinstall.
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";

const THIS_PACKAGE_NAME = "@mindflight/ghostcrab-personal-mcp";

/** @type {{ name: string, optional: boolean }[]} */
const DOC_SYMLINKS = [
  { name: "README.md", optional: false },
  { name: "INSTALL.md", optional: false },
  { name: "Licence.md", optional: false },
  { name: "README_CURSOR_MCP.md", optional: true },
  { name: "README_CODEX_MCP.md", optional: true },
  { name: "README_CLAUDE_CODE_MCP.md", optional: true }
];

/**
 * Walks up from the install dir to the nearest package.json.
 * Returns null when the nearest package.json is this package itself
 * (running from the working copy / monorepo root).
 *
 * @param {string} installDir absolute path to this package (…/node_modules/@mindflight/ghostcrab-personal-mcp)
 * @returns {string | null}
 */
export function findConsumerProjectRoot(installDir) {
  let dir = dirname(installDir);
  while (dir !== dirname(dir)) {
    const pkgJson = join(dir, "package.json");
    if (existsSync(pkgJson)) {
      try {
        const j = JSON.parse(readFileSync(pkgJson, "utf8"));
        if (j?.name === THIS_PACKAGE_NAME) {
          return null;
        }
        return dir;
      } catch {
        return null;
      }
    }
    dir = dirname(dir);
  }
  return null;
}

/**
 * @param {string} dest
 * @param {string} target
 * @param {"file" | "dir"} type
 * @returns {"created" | "refreshed" | "kept" | "error"}
 */
function ensureSymlink(dest, target, type = "file") {
  const targetRelative = relative(dirname(dest), target);
  const normalized =
    process.platform === "win32"
      ? targetRelative.split("\\").join("/")
      : targetRelative;
  const linkTarget =
    process.platform === "win32" && type === "dir" ? target : normalized;
  const linkType =
    type === "dir" ? (process.platform === "win32" ? "junction" : "dir") : null;

  if (!existsSync(dest)) {
    try {
      symlinkSync(linkTarget, dest, linkType ?? undefined);
      return "created";
    } catch (e) {
      console.error(
        `[ghostcrab] postinstall: could not symlink ${basename(dest)} -> ${normalized}: ${e instanceof Error ? e.message : e}`
      );
      return "error";
    }
  }
  try {
    const st = lstatSync(dest);
    if (st.isSymbolicLink()) {
      try {
        unlinkSync(dest);
        symlinkSync(linkTarget, dest, linkType ?? undefined);
        return "refreshed";
      } catch (e) {
        console.error(
          `[ghostcrab] postinstall: could not refresh symlink ${basename(dest)}: ${e instanceof Error ? e.message : e}`
        );
        return "error";
      }
    }
    return "kept";
  } catch {
    return "kept";
  }
}

/**
 * @param {{ pkgRoot: string, quiet: boolean }} opts
 */
export function runHostProjectBootstrap(opts) {
  const { pkgRoot, quiet } = opts;

  try {
    if (process.env.GHOSTCRAB_SKIP_HOST_BOOTSTRAP === "1") {
      if (!quiet) {
        console.error(
          "[ghostcrab] postinstall: host bootstrap skipped (GHOSTCRAB_SKIP_HOST_BOOTSTRAP=1)"
        );
      }
      return;
    }

    const consumerRoot = findConsumerProjectRoot(pkgRoot);
    if (!consumerRoot) {
      if (!quiet) {
        console.error(
          "[ghostcrab] postinstall: host bootstrap skipped (no consumer package.json found above this package)"
        );
      }
      return;
    }

    const summary = {
      consumerRoot,
      env: "kept",
      data: "kept",
      links: /** @type {Record<string, string>} */ ({})
    };

    const envDest = join(consumerRoot, ".env");
    const envExample = join(pkgRoot, ".env.example");
    if (!existsSync(envDest)) {
      if (existsSync(envExample)) {
        try {
          copyFileSync(envExample, envDest);
          summary.env = "created";
        } catch (e) {
          summary.env = "error";
          console.error(
            `[ghostcrab] postinstall: could not write .env: ${e instanceof Error ? e.message : e}`
          );
        }
      } else {
        summary.env = "missing-example";
        console.error(
          `[ghostcrab] postinstall: package .env.example missing at ${envExample}`
        );
      }
    }

    const dataDir = join(consumerRoot, "data");
    if (!existsSync(dataDir)) {
      try {
        mkdirSync(dataDir, { recursive: true });
        summary.data = "created";
      } catch (e) {
        summary.data = "error";
        console.error(
          `[ghostcrab] postinstall: could not mkdir data/: ${e instanceof Error ? e.message : e}`
        );
      }
    }

    for (const { name, optional } of DOC_SYMLINKS) {
      const src = join(pkgRoot, name);
      if (!existsSync(src)) {
        if (!optional) {
          console.error(
            `[ghostcrab] postinstall: package file missing for doc link: ${name}`
          );
        }
        summary.links[name] = "no-source";
        continue;
      }
      const dest = join(consumerRoot, name);
      summary.links[name] = ensureSymlink(dest, src, "file");
    }

    const skillsSrc = join(pkgRoot, "ghostcrab-skills");
    if (existsSync(skillsSrc)) {
      summary.links["ghostcrab-skills"] = ensureSymlink(
        join(consumerRoot, "ghostcrab-skills"),
        skillsSrc,
        "dir"
      );
    } else {
      summary.links["ghostcrab-skills"] = "no-source";
      console.error(
        `[ghostcrab] postinstall: package directory missing for skill link: ghostcrab-skills`
      );
    }

    if (!quiet) {
      const linksLine = Object.entries(summary.links)
        .map(([n, s]) => `${n}=${s}`)
        .join(", ");
      console.error(
        `[ghostcrab] postinstall: host bootstrap done\n` +
          `  consumer: ${summary.consumerRoot}\n` +
          `  .env: ${summary.env}, data/: ${summary.data}\n` +
          `  links: ${linksLine}`
      );
    }
  } catch (e) {
    console.error(
      `[ghostcrab] postinstall: host bootstrap crashed (non-fatal): ${e instanceof Error ? (e.stack ?? e.message) : e}`
    );
  }
}
