import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Recreate GhostCrab skill reference symlinks after npm install.
 *
 * npm package installation does not reliably preserve authoring-tree symlinks
 * for this layout. Keep the canonical skill files in ghostcrab-skills/skills
 * and expose stable shortcut folders for humans and IDE-specific installers.
 *
 * @param {{ pkgRoot: string, quiet?: boolean }} opts
 * @returns {{ ok: boolean, created: string[], skipped: string[], missing: string[] }}
 */
export function ensureGhostcrabSkillLinks(opts) {
  const pkgRoot = opts.pkgRoot;
  const skillsRoot = join(pkgRoot, "ghostcrab-skills");
  const canonicalRoot = join(skillsRoot, "skills");
  const created = [];
  const skipped = [];
  const missing = [];

  if (!existsSync(skillsRoot) || !existsSync(canonicalRoot)) {
    missing.push(skillsRoot);
    return { ok: false, created, skipped, missing };
  }

  const skillNames = readdirSync(canonicalRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(canonicalRoot, name, "SKILL.md")))
    .sort();

  for (const name of skillNames) {
    linkDir({
      root: skillsRoot,
      dest: join(skillsRoot, "all", name),
      target: join(canonicalRoot, name),
      created,
      skipped,
      missing
    });
    linkDir({
      root: skillsRoot,
      dest: join(skillsRoot, "codex", name),
      target: join(canonicalRoot, name),
      created,
      skipped,
      missing
    });
    linkDir({
      root: skillsRoot,
      dest: join(skillsRoot, "cursor", "skills", name),
      target: join(canonicalRoot, name),
      created,
      skipped,
      missing
    });
    linkDir({
      root: skillsRoot,
      dest: join(skillsRoot, "claude-code", "skills", name),
      target: join(canonicalRoot, name),
      created,
      skipped,
      missing
    });
  }

  const generatedTargets = [
    ["codex", join(pkgRoot, "bin", "ide-skills", "codex", "skills")],
    ["cursor", join(pkgRoot, "bin", "ide-skills", "cursor", "skills")],
    [
      "claude-code",
      join(pkgRoot, "bin", "ide-skills", "claude-code", "skills")
    ]
  ];
  for (const [name, target] of generatedTargets) {
    linkDir({
      root: skillsRoot,
      dest: join(skillsRoot, "generated", name),
      target,
      created,
      skipped,
      missing
    });
  }

  if (!opts.quiet && created.length > 0) {
    console.error(
      `[ghostcrab] postinstall: skill reference links ready (${created.length})`
    );
  }

  return { ok: missing.length === 0, created, skipped, missing };
}

function linkDir({ root, dest, target, created, skipped, missing }) {
  if (!existsSync(target)) {
    missing.push(target);
    return;
  }

  const destDir = dirname(dest);
  mkdirSync(destDir, { recursive: true });
  const rel = relative(destDir, target);

  if (existsSync(dest) || isDanglingSymlink(dest)) {
    try {
      const stat = lstatSync(dest);
      if (stat.isSymbolicLink()) {
        rmSync(dest, { force: true });
      } else {
        skipped.push(dest);
        return;
      }
    } catch {
      skipped.push(dest);
      return;
    }
  }

  try {
    symlinkSync(
      process.platform === "win32" ? target : rel,
      dest,
      process.platform === "win32" ? "junction" : "dir"
    );
    created.push(dest);
  } catch {
    missing.push(dest);
  }
}

function isDanglingSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
