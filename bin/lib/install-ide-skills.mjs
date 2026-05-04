/**
 * Install default ghostcrab-skills integration files for the detected IDE.
 *
 * Skills tree resolution:
 *   1. GHOSTCRAB_SKILLS_ROOT (directory containing cursor/, claude-code/, codex/, shared/)
 *   2. <pkgRoot>/ghostcrab-skills (bundled in the published npm package and full git checkout)
 *
 * Skip entirely: GHOSTCRAB_SKIP_IDE_SKILLS=1
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectIde } from "./ide-detect.mjs";

const LOG_PREFIX = "[ghostcrab]";

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

  const skillsRoot = resolveSkillsRoot(pkgRoot);
  if (!skillsRoot) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: no ghostcrab-skills tree found. Set GHOSTCRAB_SKILLS_ROOT or place ghostcrab-skills next to the package.`
    );
    return;
  }

  const { id: ide, reason } = detectIde(cwd);
  if (!ide) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: could not detect IDE (${reason}). Set GHOSTCRAB_IDE=cursor|claude-code|codex to install stubs.`
    );
    return;
  }

  const results = [];

  if (ide === "cursor") {
    const src = join(skillsRoot, "cursor/rules/ghostcrab-memory.mdc");
    const dest = join(cwd, ".cursor/rules/ghostcrab-memory.mdc");
    if (!existsSync(src)) {
      log(context, `${LOG_PREFIX} IDE skills: missing ${src}`);
      return;
    }
    if (!force && existsSync(dest)) {
      log(context, `${LOG_PREFIX} IDE skills: cursor rule already exists — ${dest}`);
      return;
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    results.push(dest);
  } else if (ide === "claude-code") {
    const src = join(skillsRoot, "claude-code/self-memory/CLAUDE.md");
    const dest = join(cwd, ".ghostcrab/claude-self-memory.md");
    if (!existsSync(src)) {
      log(context, `${LOG_PREFIX} IDE skills: missing ${src}`);
      return;
    }
    if (!force && existsSync(dest)) {
      log(context, `${LOG_PREFIX} IDE skills: Claude fragment already exists — ${dest}`);
      return;
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    results.push(dest);
  } else if (ide === "codex") {
    const srcMem = join(skillsRoot, "codex/ghostcrab-memory");
    const srcShared = join(skillsRoot, "shared");
    const destMem = join(cwd, ".codex/skills/ghostcrab-memory");
    const destShared = join(cwd, ".codex/skills/ghostcrab-shared");
    if (!existsSync(srcMem) || !existsSync(srcShared)) {
      log(
        context,
        `${LOG_PREFIX} IDE skills: missing codex/ghostcrab-memory or shared/ under ${skillsRoot}`
      );
      return;
    }
    const skillMd = join(destMem, "SKILL.md");
    if (!force && existsSync(skillMd)) {
      log(context, `${LOG_PREFIX} IDE skills: Codex skill already present — ${destMem}`);
      return;
    }
    mkdirSync(dirname(destMem), { recursive: true });
    cpSync(srcMem, destMem, { recursive: true });
    cpSync(srcShared, destShared, { recursive: true });
    patchCodexSkillLinks(destMem);
    results.push(destMem, destShared);
  }

  if (results.length > 0) {
    log(
      context,
      `${LOG_PREFIX} IDE skills: installed for ${ide} (${reason}) → ${results.join(", ")}`
    );
    if (ide === "claude-code") {
      log(
        context,
        `${LOG_PREFIX} Merge .ghostcrab/claude-self-memory.md into your project CLAUDE.md if you use Claude Code rules there.`
      );
    }
  }
}

/**
 * @param {string} pkgRoot
 * @returns {string | null}
 */
function resolveSkillsRoot(pkgRoot) {
  const env = process.env.GHOSTCRAB_SKILLS_ROOT;
  if (env && existsSync(env)) {
    return env;
  }
  const nested = join(pkgRoot, "ghostcrab-skills");
  if (existsSync(nested) && existsSync(join(nested, "shared"))) {
    return nested;
  }
  return null;
}

/**
 * SKILL.md links ../../shared/ — under .codex/skills/ghostcrab-memory use ../ghostcrab-shared/
 * @param {string} destMem
 */
function patchCodexSkillLinks(destMem) {
  const skillPath = join(destMem, "SKILL.md");
  if (!existsSync(skillPath)) return;
  let text = readFileSync(skillPath, "utf8");
  text = text.replaceAll("../../shared/", "../ghostcrab-shared/");
  writeFileSync(skillPath, text, "utf8");
}

/**
 * @param {'init' | 'serve'} context
 * @param {string} message
 */
function log(context, message) {
  if (context === "serve") {
    process.stderr.write(`${message}\n`);
  } else {
    console.log(message);
  }
}
