/**
 * Install GhostCrab IDE skill bundles from bin/ide-skills (primary) or ghostcrab-skills (dev fallback).
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { detectIde } from "./ide-detect.mjs";
import {
  mergeClaudeSettingsFragment,
  mergeClaudeSettingsPermissions,
  resolveClaudeSettingsPath
} from "./mcp-permissions-adapters.mjs";

const LOG_PREFIX = "[ghostcrab]";

/** @typedef {"cursor" | "claude-code" | "codex"} IdeSkillsTarget */

/**
 * @param {string} pkgRoot
 * @returns {string | null}
 */
export function resolveIdeSkillsBundleRoot(pkgRoot) {
  const env = process.env.GHOSTCRAB_SKILLS_ROOT;
  if (env && existsSync(join(env, "shared"))) {
    return env;
  }
  const bundled = join(pkgRoot, "bin", "ide-skills");
  if (existsSync(bundled) && existsSync(join(bundled, "shared"))) {
    return bundled;
  }
  const nested = join(pkgRoot, "ghostcrab-skills");
  if (existsSync(nested) && existsSync(join(nested, "shared"))) {
    return nested;
  }
  return null;
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 */
function installSharedDocs(bundleRoot, cwd) {
  const srcShared = join(bundleRoot, "shared");
  const destShared = join(cwd, ".ghostcrab", "skills", "shared");
  mkdirSync(destShared, { recursive: true });
  for (const name of [
    "ONBOARDING_CONTRACT.md",
    "QUERY_PATTERNS.md",
    "TRANSITION_LOGGING.md",
    "SCHEMA_DESIGN.md",
    "APP_PATTERNS.md",
    "CAPABILITIES.md",
    "SERVER_INSTRUCTIONS.md"
  ]) {
    const src = join(srcShared, name);
    if (existsSync(src)) {
      cpSync(src, join(destShared, name));
    }
  }
  return destShared;
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 * @param {boolean} force
 */
function installCursorBundle(bundleRoot, cwd, force) {
  const results = [];
  installSharedDocs(bundleRoot, cwd);

  const srcRule = join(bundleRoot, "cursor", "rules", "ghostcrab-memory.mdc");
  if (!existsSync(srcRule)) {
    const legacy = join(bundleRoot, "cursor", "rules", "ghostcrab-memory.mdc");
    if (!existsSync(legacy)) {
      return { ok: false, message: `Missing cursor rule at ${srcRule}` };
    }
  }
  const destRule = join(cwd, ".cursor", "rules", "ghostcrab-memory.mdc");
  if (!force && existsSync(destRule)) {
    return {
      ok: true,
      skipped: true,
      message: `${LOG_PREFIX} IDE skills: cursor rule already exists — ${destRule}`,
      paths: []
    };
  }
  mkdirSync(dirname(destRule), { recursive: true });
  cpSync(srcRule, destRule);
  results.push(destRule);
  return { ok: true, paths: results };
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 * @param {boolean} force
 * @param {{ permissionsAllow?: string[] }} [perm]
 */
function installClaudeBundle(bundleRoot, cwd, force, perm = {}) {
  const results = [];
  installSharedDocs(bundleRoot, cwd);

  const selfMem = join(bundleRoot, "claude-code", "self-memory");
  const srcClaude = join(selfMem, "CLAUDE.md");

  if (!existsSync(srcClaude)) {
    return {
      ok: false,
      message: `Missing Claude CLAUDE.md under ${selfMem}`
    };
  }

  const destClaude = join(cwd, ".ghostcrab", "claude-self-memory.md");
  if (force || !existsSync(destClaude)) {
    mkdirSync(dirname(destClaude), { recursive: true });
    cpSync(srcClaude, destClaude);
    results.push(destClaude);
  }

  const fragmentPath = join(selfMem, "settings.fragment.json");
  const settingsPath = resolveClaudeSettingsPath("project", cwd);
  let existing = null;
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      return { ok: false, message: `Could not parse ${settingsPath}` };
    }
  }

  let merged = existing;
  if (existsSync(fragmentPath)) {
    const fragment = JSON.parse(readFileSync(fragmentPath, "utf8"));
    merged = mergeClaudeSettingsFragment(merged, fragment);
  }
  if (perm.permissionsAllow?.length) {
    merged = mergeClaudeSettingsPermissions(
      merged,
      { allow: perm.permissionsAllow },
      { force }
    );
  }

  if (
    merged &&
    (force ||
      !existsSync(settingsPath) ||
      existsSync(fragmentPath) ||
      perm.permissionsAllow?.length)
  ) {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    results.push(settingsPath);
  }

  return { ok: true, paths: results };
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 * @param {boolean} force
 */
function installCodexBundle(bundleRoot, cwd, force) {
  const srcMem = join(bundleRoot, "codex", "ghostcrab-memory");
  const srcShared = join(bundleRoot, "shared");
  const destMem = join(cwd, ".codex", "skills", "ghostcrab-memory");
  const destShared = join(cwd, ".codex", "skills", "ghostcrab-shared");

  if (!existsSync(srcMem)) {
    return { ok: false, message: `Missing codex bundle at ${srcMem}` };
  }

  const skillMd = join(destMem, "SKILL.md");
  if (!force && existsSync(skillMd)) {
    return {
      ok: true,
      skipped: true,
      message: `${LOG_PREFIX} IDE skills: Codex skill already present — ${destMem}`,
      paths: []
    };
  }

  mkdirSync(dirname(destMem), { recursive: true });
  cpSync(srcMem, destMem, { recursive: true });
  mkdirSync(destShared, { recursive: true });
  if (existsSync(srcShared)) {
    cpSync(srcShared, destShared, { recursive: true });
  }
  patchCodexSkillLinks(destMem);
  return { ok: true, paths: [destMem, destShared] };
}

/**
 * @param {string} destMem
 */
function patchCodexSkillLinks(destMem) {
  const skillPath = join(destMem, "SKILL.md");
  if (!existsSync(skillPath)) return;
  let text = readFileSync(skillPath, "utf8");
  text = text.replaceAll("../../shared/", "../ghostcrab-shared/");
  text = text.replaceAll("./skills/shared/", "../ghostcrab-shared/");
  writeFileSync(skillPath, text, "utf8");
}

/**
 * @param {object} opts
 * @param {IdeSkillsTarget} opts.target
 * @param {string} opts.cwd
 * @param {string} opts.pkgRoot
 * @param {boolean} [opts.skip]
 * @param {boolean} [opts.force]
 * @param {'init' | 'serve' | 'setup'} [opts.context]
 * @param {string[]} [opts.permissionsAllow] Claude project settings allow rules
 */
export function installIdeSkillsBundleForTarget(opts) {
  const {
    target,
    cwd,
    pkgRoot,
    skip = false,
    force = false,
    context = "setup",
    permissionsAllow
  } = opts;

  if (skip || process.env.GHOSTCRAB_SKIP_IDE_SKILLS === "1") {
    return { ok: true, skipped: true, paths: [] };
  }

  const bundleRoot = resolveIdeSkillsBundleRoot(pkgRoot);
  if (!bundleRoot) {
    const msg = `${LOG_PREFIX} IDE skills: no bundle found (bin/ide-skills or ghostcrab-skills). Set GHOSTCRAB_SKILLS_ROOT.`;
    log(context, msg);
    return { ok: false, message: msg };
  }

  /** @type {{ ok: boolean, paths?: string[], skipped?: boolean, message?: string }} */
  let result;
  if (target === "cursor") {
    result = installCursorBundle(bundleRoot, cwd, force);
  } else if (target === "claude-code") {
    result = installClaudeBundle(bundleRoot, cwd, force, {
      permissionsAllow
    });
  } else if (target === "codex") {
    result = installCodexBundle(bundleRoot, cwd, force);
  } else {
    return { ok: false, message: `Unknown IDE skills target: ${target}` };
  }

  if (!result.ok) {
    log(context, `${LOG_PREFIX} IDE skills: ${result.message}`);
    return result;
  }

  if (result.skipped) {
    if (result.message) log(context, result.message);
    return { ok: true, skipped: true, paths: [] };
  }

  const paths = result.paths ?? [];
  if (paths.length > 0) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: installed ${target} bundle → ${paths.join(", ")}`
    );
    if (target === "claude-code") {
      log(
        context,
        `${LOG_PREFIX} Merge .ghostcrab/claude-self-memory.md into your project CLAUDE.md if needed.`
      );
    }
  }

  return { ok: true, paths };
}

/**
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {string} opts.pkgRoot
 * @param {boolean} [opts.skip]
 * @param {boolean} [opts.force]
 * @param {'init' | 'serve'} [opts.context]
 */
export function maybeInstallIdeSkills(opts) {
  const { cwd, pkgRoot, skip = false, force = false, context = "init" } = opts;

  if (skip || process.env.GHOSTCRAB_SKIP_IDE_SKILLS === "1") {
    return;
  }

  const { id: ide, reason } = detectIde(cwd);
  if (!ide) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: could not detect IDE (${reason}). Set GHOSTCRAB_IDE=cursor|claude-code|codex.`
    );
    return;
  }

  installIdeSkillsBundleForTarget({
    target: ide,
    cwd,
    pkgRoot,
    skip: false,
    force,
    context
  });
}

/** @param {'init' | 'serve' | 'setup'} context @param {string} message */
function log(context, message) {
  if (context === "serve") {
    process.stderr.write(`${message}\n`);
  } else {
    console.log(message);
  }
}

/** @param {"cursor" | "claude" | "codex"} setupTarget */
export function setupTargetToIdeSkillsTarget(setupTarget) {
  if (setupTarget === "claude") return "claude-code";
  return setupTarget;
}
