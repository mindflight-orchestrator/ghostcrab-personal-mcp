/**
 * Canonical CLI invocation strings and install-health checks for README flows.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const GCP_PACKAGE_NAME = "@mindflight/ghostcrab-personal-mcp";

/** Unambiguous npm exec form — avoids bare `npx gcp` resolving stale local bins. */
export const GCP_NPX_PREFIX = `npx -y --package=${GCP_PACKAGE_NAME}@latest gcp`;

/**
 * @param {string} [subcommand]
 * @returns {string}
 */
export function formatGcpCommand(subcommand = "") {
  return subcommand ? `${GCP_NPX_PREFIX} ${subcommand}` : GCP_NPX_PREFIX;
}

/**
 * @param {string} pkgRoot
 * @returns {string | null}
 */
function findConsumerRoot(pkgRoot) {
  let dir = dirname(resolve(pkgRoot));
  while (dir !== dirname(dir)) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, "utf8"));
        if (pkg?.name !== GCP_PACKAGE_NAME) return dir;
      } catch {
        return null;
      }
    }
    dir = dirname(dir);
  }
  return null;
}

/**
 * @param {string} pkgRoot
 * @returns {"local" | "global-or-linked" | "source"}
 */
export function detectCliInstallKind(pkgRoot) {
  const normalized = resolve(pkgRoot);
  const inNodeModules = normalized.includes(
    `${join("node_modules", "@mindflight", "ghostcrab-personal-mcp")}`
  );
  if (inNodeModules && findConsumerRoot(normalized)) {
    return "local";
  }
  if (normalized.includes("node_modules")) {
    return "global-or-linked";
  }
  return "source";
}

/**
 * @returns {{ path: string, target: string } | null}
 */
export function readGlobalPackageLink() {
  const root = spawnSync("npm", ["root", "-g"], { encoding: "utf8" });
  if (root.status !== 0) return null;
  const pkgDir = join(root.stdout.trim(), "@mindflight", "ghostcrab-personal-mcp");
  if (!existsSync(pkgDir)) return null;
  try {
    if (lstatSync(pkgDir).isSymbolicLink()) {
      return { path: pkgDir, target: realpathSync(pkgDir) };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {string} pkgRoot
 * @returns {string | null}
 */
function readPackageVersion(pkgRoot) {
  try {
    const pkg = JSON.parse(
      readFileSync(join(pkgRoot, "package.json"), "utf8")
    );
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ pkgRoot: string, cwd?: string }} opts
 * @returns {{
 *   ok: boolean,
 *   issues: string[],
 *   fixes: string[],
 *   recommendedCommand: string,
 *   installKind: ReturnType<typeof detectCliInstallKind>,
 *   runningVersion: string | null
 * }}
 */
export function auditCliInvocation(opts) {
  const pkgRoot = resolve(opts.pkgRoot);
  const cwd = resolve(opts.cwd ?? process.cwd());
  const installKind = detectCliInstallKind(pkgRoot);
  const runningVersion = readPackageVersion(pkgRoot);
  /** @type {string[]} */
  const issues = [];
  /** @type {string[]} */
  const fixes = [];
  const recommendedCommand = GCP_NPX_PREFIX;

  const globalLink = readGlobalPackageLink();
  if (globalLink && detectCliInstallKind(globalLink.target) === "source") {
    issues.push(
      `Global npm install is symlinked to the source tree (${globalLink.target}).`
    );
    fixes.push(
      `From a neutral directory: npm uninstall -g ${GCP_PACKAGE_NAME} && npm install -g ${GCP_PACKAGE_NAME}@latest`
    );
  }

  if (installKind === "source" && cwd === pkgRoot) {
    issues.push(
      "You are running gcp from the GhostCrab git checkout root; bare `npx gcp` can trigger npm reify/SIGTERM here."
    );
    fixes.push(formatGcpCommand("brain setup codex --force"));
    fixes.push("Contributors: node bin/gcp.mjs brain setup codex --force");
  }

  const localPkgRoot = join(
    cwd,
    "node_modules",
    "@mindflight",
    "ghostcrab-personal-mcp"
  );
  if (existsSync(join(localPkgRoot, "package.json")) && runningVersion) {
    const localVersion = readPackageVersion(localPkgRoot);
    if (
      localVersion &&
      localVersion !== runningVersion &&
      resolve(localPkgRoot) !== pkgRoot
    ) {
      issues.push(
        `Stale local copy in node_modules (${localVersion}) differs from the running CLI (${runningVersion}).`
      );
      fixes.push("rm -rf node_modules/@mindflight/ghostcrab-personal-mcp");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    fixes,
    recommendedCommand,
    installKind,
    runningVersion
  };
}

/**
 * @param {{ pkgRoot: string, cwd?: string, subcommand?: string }} opts
 * @returns {string[]}
 */
export function formatCliInvocationWarnings(opts) {
  const audit = auditCliInvocation(opts);
  if (audit.ok) return [];
  /** @type {string[]} */
  const lines = [
    `[ghostcrab] CLI install check${opts.subcommand ? ` (${opts.subcommand})` : ""}:`
  ];
  for (const issue of audit.issues) {
    lines.push(`  - ${issue}`);
  }
  if (opts.subcommand) {
    lines.push(`  Use: ${formatGcpCommand(opts.subcommand)}`);
  } else {
    lines.push(`  Use: ${audit.recommendedCommand}`);
  }
  for (const fix of audit.fixes) {
    lines.push(`  Fix: ${fix}`);
  }
  return lines;
}
