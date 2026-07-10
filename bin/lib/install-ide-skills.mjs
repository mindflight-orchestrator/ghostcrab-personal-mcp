/**
 * Install GhostCrab IDE skill bundles from bin/ide-skills (primary) or ghostcrab-skills (dev fallback).
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { detectIde } from "./ide-detect.mjs";
import {
  mergeClaudeSettingsFragment,
  mergeClaudeSettingsPermissions,
  resolveClaudeSettingsPath
} from "./mcp-permissions-adapters.mjs";

const LOG_PREFIX = "[ghostcrab]";

/** @typedef {"cursor" | "claude-code" | "codex" | "generic"} IdeSkillsTarget */
/** @typedef {"user" | "project"} IdeSkillsScope */

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

/** @param {string} bundleRoot */
function readBundleSkillNames(bundleRoot) {
  const manifestPath = join(bundleRoot, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (Array.isArray(manifest.skill_names) && manifest.skill_names.length) {
        return manifest.skill_names.filter((n) => typeof n === "string");
      }
    } catch {
      // Fall back to directory discovery.
    }
  }
  const codexSkills = join(bundleRoot, "codex", "skills");
  if (existsSync(codexSkills)) {
    return readdirSync(codexSkills, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  }
  const legacyCodex = join(bundleRoot, "codex");
  if (existsSync(legacyCodex)) {
    return readdirSync(legacyCodex, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  }
  return [];
}

/** @param {string} bundleRoot */
function codexBundleSkillsRoot(bundleRoot) {
  const root = join(bundleRoot, "codex", "skills");
  return existsSync(root) ? root : join(bundleRoot, "codex");
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 */
function installSharedDocs(bundleRoot, cwd) {
  const srcShared = join(bundleRoot, "shared");
  const destShared = join(cwd, ".ghostcrab", "skills", "shared");
  if (existsSync(srcShared)) {
    mkdirSync(dirname(destShared), { recursive: true });
    cpSync(srcShared, destShared, { recursive: true });
  }
  return destShared;
}

/**
 * @param {string} cwd
 * @param {IdeSkillsTarget} target
 * @param {IdeSkillsScope} scope
 */
function resolveInstallRoots(cwd, target, scope) {
  const home = homedir();
  if (scope === "user") {
    if (target === "cursor") {
      return { skillRoot: join(home, ".cursor", "skills") };
    }
    if (target === "claude-code") {
      return { skillRoot: join(home, ".claude", "skills") };
    }
    if (target === "codex") {
      return { skillRoot: join(home, ".codex", "skills") };
    }
    return { skillRoot: join(home, ".agents", "skills") };
  }
  if (target === "cursor") {
    return { skillRoot: join(cwd, ".cursor", "skills") };
  }
  if (target === "claude-code") {
    return { skillRoot: join(cwd, ".claude", "skills") };
  }
  if (target === "codex") {
    return { skillRoot: join(cwd, ".codex", "skills") };
  }
  return { skillRoot: join(cwd, ".agents", "skills") };
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {boolean} force
 * @param {string[]} paths
 * @param {string[]} skipped
 */
function copyManagedTree(src, dest, force, paths, skipped) {
  if (!existsSync(src)) {
    return false;
  }
  if (existsSync(dest)) {
    if (!force) {
      skipped.push(dest);
      return true;
    }
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  paths.push(dest);
  return true;
}

/**
 * @param {string} srcShared
 * @param {string} destShared
 * @param {string[]} paths
 */
function copySkillRootShared(srcShared, destShared, paths) {
  if (!existsSync(srcShared)) return;
  rmSync(destShared, { recursive: true, force: true });
  mkdirSync(dirname(destShared), { recursive: true });
  cpSync(srcShared, destShared, { recursive: true });
  paths.push(destShared);
}

/**
 * @param {string} cwd
 * @param {string[]} skills
 * @param {string[]} paths
 */
function pruneLegacyCursorRules(cwd, skills, paths) {
  const rulesRoot = join(cwd, ".cursor", "rules");
  for (const name of skills) {
    const legacyRule = join(rulesRoot, `${name}.mdc`);
    if (!existsSync(legacyRule)) continue;
    rmSync(legacyRule, { force: true });
    paths.push(legacyRule);
  }
}

/** @param {string} dir */
function patchSkillLinks(dir) {
  if (!existsSync(dir)) return;
  for (const rel of collectTextFiles(dir)) {
    const path = join(dir, rel);
    let text = readFileSync(path, "utf8");
    const before = text;
    text = text.replaceAll("../../shared/", "../ghostcrab-shared/");
    text = text.replaceAll("../shared/", "../ghostcrab-shared/");
    text = text.replaceAll("./shared/", "../ghostcrab-shared/");
    text = text.replaceAll("ghostcrab-skills/shared/", "../ghostcrab-shared/");
    text = text.replaceAll("../../ghostcrab-shared/", "../ghostcrab-shared/");
    if (text !== before) writeFileSync(path, text, "utf8");
  }
}

/** @param {string} skillDir */
function ensureCodexManualInvocation(skillDir) {
  const agentsDir = join(skillDir, "agents");
  const openaiPath = join(agentsDir, "openai.yaml");
  mkdirSync(agentsDir, { recursive: true });
  if (!existsSync(openaiPath)) {
    writeFileSync(
      openaiPath,
      "policy:\n  allow_implicit_invocation: false\n",
      "utf8"
    );
    return;
  }
  const text = readFileSync(openaiPath, "utf8");
  if (text.includes("allow_implicit_invocation")) return;
  const sep = text.endsWith("\n") ? "" : "\n";
  writeFileSync(
    openaiPath,
    `${text}${sep}policy:\n  allow_implicit_invocation: false\n`,
    "utf8"
  );
}

/** @param {string} dir @param {string} [prefix] */
function collectTextFiles(dir, prefix = "") {
  /** @type {string[]} */
  const files = [];
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      files.push(...collectTextFiles(full, rel));
    } else if (/\.(md|mdc|txt|yaml|yml|json)$/i.test(name)) {
      files.push(rel);
    }
  }
  return files;
}

/**
 * @param {string} cwd
 * @param {IdeSkillsTarget} target
 * @param {string} installedSkillRoot
 * @param {string} sharedRoot
 * @param {string[]} skills
 * @param {string} bundleRoot
 * @param {string[]} paths
 */
function writeInstallReference({
  cwd,
  target,
  scope,
  installedSkillRoot,
  sharedRoot,
  skills,
  bundleRoot,
  paths
}) {
  const refRoot = join(cwd, ".ghostcrab", "skills");
  mkdirSync(refRoot, { recursive: true });
  const manifestPath = join(refRoot, "installed.json");
  const targetManifestPath = join(refRoot, `installed-${target}.json`);
  const readmePath = join(refRoot, "README.md");
  const shortcutPath = join(refRoot, "current");
  const shortcutFallbackPath = join(refRoot, "current.txt");
  const relSkillRoot = relative(cwd, installedSkillRoot) || ".";
  const relSharedRoot = relative(cwd, sharedRoot) || ".";

  const doc = {
    target,
    scope,
    sourceBundleRoot: bundleRoot,
    installedSkillRoot,
    sharedRoot,
    skills,
    generatedAt: new Date().toISOString()
  };
  writeFileSync(manifestPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  writeFileSync(
    targetManifestPath,
    `${JSON.stringify(doc, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    readmePath,
    `# GhostCrab installed skills

Target: ${target}
Scope: ${scope}

- Skill root: \`${relSkillRoot}\`
- Shared reference docs: \`${relSharedRoot}\`
- Current shortcut: \`.ghostcrab/skills/current\` or \`.ghostcrab/skills/current.txt\`

Installed skills:
${skills.map((s) => `- ${s}`).join("\n")}
`,
    "utf8"
  );
  paths.push(manifestPath, targetManifestPath, readmePath);

  try {
    if (existsSync(shortcutPath) || lstatExists(shortcutPath)) {
      rmSync(shortcutPath, { recursive: true, force: true });
    }
    symlinkSync(relative(refRoot, installedSkillRoot), shortcutPath, "dir");
    paths.push(shortcutPath);
  } catch {
    writeFileSync(shortcutFallbackPath, `${installedSkillRoot}\n`, "utf8");
    paths.push(shortcutFallbackPath);
  }
}

/** @param {string} path */
function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 * @param {boolean} force
 * @param {IdeSkillsScope} scope
 */
function installCursorBundle(bundleRoot, cwd, force, scope) {
  const paths = [];
  const skipped = [];
  const skills = readBundleSkillNames(bundleRoot);
  const srcShared = join(bundleRoot, "shared");
  const sharedRoot = installSharedDocs(bundleRoot, cwd);
  if (force) pruneLegacyCursorRules(cwd, skills, paths);

  const preferredCursorSkills = join(bundleRoot, "cursor", "skills");
  const srcSkills = existsSync(preferredCursorSkills)
    ? preferredCursorSkills
    : codexBundleSkillsRoot(bundleRoot);
  const { skillRoot: destSkills } = resolveInstallRoots(cwd, "cursor", scope);
  if (existsSync(srcSkills)) {
    for (const name of skills) {
      const beforeCopy = paths.length;
      copyManagedTree(
        join(srcSkills, name),
        join(destSkills, name),
        force,
        paths,
        skipped
      );
      if (paths.length > beforeCopy) patchSkillLinks(join(destSkills, name));
    }
    copySkillRootShared(srcShared, join(destSkills, "ghostcrab-shared"), paths);
  }

  writeInstallReference({
    cwd,
    target: "cursor",
    scope,
    installedSkillRoot: destSkills,
    sharedRoot,
    skills,
    bundleRoot,
    paths
  });
  return { ok: true, paths, skippedPaths: skipped };
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 * @param {boolean} force
 * @param {IdeSkillsScope} scope
 * @param {{ permissionsAllow?: string[] }} [perm]
 */
function installClaudeBundle(bundleRoot, cwd, force, scope, perm = {}) {
  const paths = [];
  const skipped = [];
  const skills = readBundleSkillNames(bundleRoot);
  const srcShared = join(bundleRoot, "shared");
  const sharedRoot = installSharedDocs(bundleRoot, cwd);

  const selfMem = join(bundleRoot, "claude-code", "self-memory");
  const srcClaude = existsSync(join(selfMem, "CLAUDE.install.md"))
    ? join(selfMem, "CLAUDE.install.md")
    : join(selfMem, "CLAUDE.md");
  if (!existsSync(srcClaude)) {
    return {
      ok: false,
      message: `Missing Claude self-memory starter under ${selfMem}`
    };
  }

  const destClaude = join(cwd, ".ghostcrab", "claude-self-memory.md");
  copyManagedTree(srcClaude, destClaude, force, paths, skipped);

  const srcSkills = join(bundleRoot, "claude-code", "skills");
  const { skillRoot: destSkills } = resolveInstallRoots(
    cwd,
    "claude-code",
    scope
  );
  if (!existsSync(srcSkills)) {
    return { ok: false, message: `Missing Claude skills at ${srcSkills}` };
  }
  for (const name of skills) {
    const beforeCopy = paths.length;
    copyManagedTree(
      join(srcSkills, name),
      join(destSkills, name),
      force,
      paths,
      skipped
    );
    if (paths.length > beforeCopy) patchSkillLinks(join(destSkills, name));
  }
  copySkillRootShared(srcShared, join(destSkills, "ghostcrab-shared"), paths);

  const fragmentPath = join(selfMem, "settings.fragment.json");
  const settingsPath = resolveClaudeSettingsPath(scope, cwd);
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
    paths.push(settingsPath);
  }

  writeInstallReference({
    cwd,
    target: "claude-code",
    scope,
    installedSkillRoot: destSkills,
    sharedRoot,
    skills,
    bundleRoot,
    paths
  });
  return { ok: true, paths, skippedPaths: skipped };
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 * @param {boolean} force
 * @param {IdeSkillsScope} scope
 */
function installCodexBundle(bundleRoot, cwd, force, scope) {
  const paths = [];
  const skipped = [];
  const skills = readBundleSkillNames(bundleRoot);
  const srcSkills = codexBundleSkillsRoot(bundleRoot);
  const srcShared = join(bundleRoot, "shared");
  const { skillRoot: destSkills } = resolveInstallRoots(cwd, "codex", scope);
  const destShared = join(destSkills, "ghostcrab-shared");
  const sharedRoot = installSharedDocs(bundleRoot, cwd);

  if (!existsSync(srcSkills)) {
    return { ok: false, message: `Missing codex bundle at ${srcSkills}` };
  }

  for (const name of skills) {
    const beforeCopy = paths.length;
    copyManagedTree(
      join(srcSkills, name),
      join(destSkills, name),
      force,
      paths,
      skipped
    );
    if (paths.length > beforeCopy) {
      const destSkill = join(destSkills, name);
      patchSkillLinks(destSkill);
      ensureCodexManualInvocation(destSkill);
    }
  }
  copySkillRootShared(srcShared, destShared, paths);
  writeInstallReference({
    cwd,
    target: "codex",
    scope,
    installedSkillRoot: destSkills,
    sharedRoot,
    skills,
    bundleRoot,
    paths
  });
  return { ok: true, paths, skippedPaths: skipped };
}

/**
 * @param {string} bundleRoot
 * @param {string} cwd
 * @param {boolean} force
 * @param {IdeSkillsScope} scope
 */
function installGenericBundle(bundleRoot, cwd, force, scope) {
  const paths = [];
  const skipped = [];
  const skills = readBundleSkillNames(bundleRoot);
  const srcSkills = codexBundleSkillsRoot(bundleRoot);
  const srcShared = join(bundleRoot, "shared");
  const { skillRoot: destSkills } = resolveInstallRoots(cwd, "generic", scope);
  const destShared = join(destSkills, "ghostcrab-shared");
  const sharedRoot = installSharedDocs(bundleRoot, cwd);

  if (!existsSync(srcSkills)) {
    return {
      ok: false,
      message: `Missing generic skills bundle at ${srcSkills}`
    };
  }

  for (const name of skills) {
    const beforeCopy = paths.length;
    copyManagedTree(
      join(srcSkills, name),
      join(destSkills, name),
      force,
      paths,
      skipped
    );
    if (paths.length > beforeCopy) {
      const destSkill = join(destSkills, name);
      patchSkillLinks(destSkill);
      ensureCodexManualInvocation(destSkill);
    }
  }
  copySkillRootShared(srcShared, destShared, paths);
  writeInstallReference({
    cwd,
    target: "generic",
    scope,
    installedSkillRoot: destSkills,
    sharedRoot,
    skills,
    bundleRoot,
    paths
  });
  return { ok: true, paths, skippedPaths: skipped };
}

/**
 * @param {object} opts
 * @param {IdeSkillsTarget} opts.target
 * @param {string} opts.cwd
 * @param {string} opts.pkgRoot
 * @param {boolean} [opts.skip]
 * @param {boolean} [opts.force] Overwrite existing managed skill directories (default: true).
 * @param {'init' | 'serve' | 'setup'} [opts.context]
 * @param {IdeSkillsScope} [opts.scope]
 * @param {string[]} [opts.permissionsAllow] Claude project settings allow rules
 */
export function installIdeSkillsBundleForTarget(opts) {
  const {
    target,
    cwd,
    pkgRoot,
    skip = false,
    force = true,
    context = "setup",
    scope = context === "setup" ? "user" : "project",
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

  /** @type {{ ok: boolean, paths?: string[], skippedPaths?: string[], skipped?: boolean, message?: string }} */
  let result;
  if (target === "cursor") {
    result = installCursorBundle(bundleRoot, cwd, force, scope);
  } else if (target === "claude-code") {
    result = installClaudeBundle(bundleRoot, cwd, force, scope, {
      permissionsAllow
    });
  } else if (target === "codex") {
    result = installCodexBundle(bundleRoot, cwd, force, scope);
  } else if (target === "generic") {
    result = installGenericBundle(bundleRoot, cwd, force, scope);
  } else {
    return { ok: false, message: `Unknown IDE skills target: ${target}` };
  }

  if (!result.ok) {
    log(context, `${LOG_PREFIX} IDE skills: ${result.message}`);
    return result;
  }

  const paths = result.paths ?? [];
  const skippedPaths = result.skippedPaths ?? [];
  if (paths.length > 0) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: installed ${target} bundle -> ${paths.join(", ")}`
    );
    if (target === "claude-code") {
      log(
        context,
        `${LOG_PREFIX} Merge .ghostcrab/claude-self-memory.md into your project CLAUDE.md if needed.`
      );
    }
  }
  if (skippedPaths.length > 0) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: preserved existing files (${target}) -> ${skippedPaths.join(", ")}`
    );
  }

  return {
    ok: true,
    paths,
    skipped: paths.length === 0 && skippedPaths.length > 0,
    skippedPaths
  };
}

/**
 * @param {object} opts
 * @param {IdeSkillsTarget} opts.target
 * @param {string} opts.cwd
 * @param {string} opts.pkgRoot
 * @param {IdeSkillsScope} [opts.scope]
 */
export function describeIdeSkillsBundleForTarget(opts) {
  const bundleRoot = resolveIdeSkillsBundleRoot(opts.pkgRoot);
  if (!bundleRoot) {
    return {
      ok: false,
      message:
        "no bundle found (bin/ide-skills or ghostcrab-skills). Set GHOSTCRAB_SKILLS_ROOT."
    };
  }
  const skills = readBundleSkillNames(bundleRoot);
  const sharedRoot = join(opts.cwd, ".ghostcrab", "skills", "shared");
  const scope = opts.scope ?? "user";
  let installedSkillRoot;
  if (
    opts.target === "cursor" ||
    opts.target === "claude-code" ||
    opts.target === "codex" ||
    opts.target === "generic"
  ) {
    installedSkillRoot = resolveInstallRoots(
      opts.cwd,
      opts.target,
      scope
    ).skillRoot;
  } else {
    return { ok: false, message: `Unknown IDE skills target: ${opts.target}` };
  }
  return {
    ok: true,
    bundleRoot,
    skills,
    installedSkillRoot,
    sharedRoot,
    referenceManifest: join(opts.cwd, ".ghostcrab", "skills", "installed.json"),
    targetReferenceManifest: join(
      opts.cwd,
      ".ghostcrab",
      "skills",
      `installed-${opts.target}.json`
    ),
    currentShortcut: join(opts.cwd, ".ghostcrab", "skills", "current")
  };
}

/**
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {string} opts.pkgRoot
 * @param {boolean} [opts.skip]
 * @param {boolean} [opts.force] Overwrite existing managed skill directories (default: true).
 * @param {'init' | 'serve'} [opts.context]
 */
export function maybeInstallIdeSkills(opts) {
  const { cwd, pkgRoot, skip = false, force = true, context = "init" } = opts;

  if (skip || process.env.GHOSTCRAB_SKIP_IDE_SKILLS === "1") {
    return;
  }

  const { id: ide, reason } = detectIde(cwd);
  if (!ide) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: could not detect IDE (${reason}). Set GHOSTCRAB_IDE=cursor|claude-code|codex|generic.`
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

/** @param {"cursor" | "claude" | "codex" | "generic"} setupTarget */
export function setupTargetToIdeSkillsTarget(setupTarget) {
  if (setupTarget === "claude") return "claude-code";
  return setupTarget;
}
