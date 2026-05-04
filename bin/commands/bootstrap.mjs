/**
 * gcp bootstrap — idempotent project setup
 *
 * Creates .env, data/, and README symlinks in the current directory.
 * Equivalent to what the postinstall script tries to do, but:
 *   - runs explicitly from process.cwd() (no walking heuristics)
 *   - always prints what it does
 *   - safe to re-run: never overwrites an existing .env or real file
 *
 * Usage:  npx gcp bootstrap [--cwd <dir>]
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DOC_SYMLINKS = [
  { name: "README.md", optional: false },
  { name: "INSTALL.md", optional: false },
  { name: "Licence.md", optional: false },
  { name: "README_CURSOR_MCP.md", optional: true },
  { name: "README_CODEX_MCP.md", optional: true },
  { name: "README_CLAUDE_CODE_MCP.md", optional: true },
];

/**
 * @param {string[]} args
 */
export async function cmdBootstrap(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log(`\
gcp bootstrap — create .env, data/, and README symlinks in the current project

Usage: gcp bootstrap [options]

Options:
  --cwd <dir>   Project directory to bootstrap (default: current directory)
  --quiet       Only print warnings and errors
  -h, --help    Show this help

Safe to re-run: never overwrites an existing .env or a real (non-symlink) file.
`.trim());
    return;
  }

  let cwdIdx = args.indexOf("--cwd");
  const projectDir =
    cwdIdx !== -1 && args[cwdIdx + 1] ? args[cwdIdx + 1] : process.cwd();
  const quiet = args.includes("--quiet");

  const log = (msg) => { if (!quiet) console.log(msg); };
  const warn = (msg) => console.error(msg);

  log(`[ghostcrab] bootstrap: project dir  → ${projectDir}`);
  log(`[ghostcrab] bootstrap: package root → ${PKG_ROOT}`);

  // ── .env ────────────────────────────────────────────────────────────────────
  const envDest = join(projectDir, ".env");
  const envSrc = join(PKG_ROOT, ".env.example");
  if (existsSync(envDest)) {
    log("[ghostcrab] bootstrap: .env         already exists — not overwritten");
  } else if (!existsSync(envSrc)) {
    warn(`[ghostcrab] bootstrap: .env.example not found in package at ${envSrc}`);
  } else {
    try {
      copyFileSync(envSrc, envDest);
      log("[ghostcrab] bootstrap: .env         created from .env.example");
    } catch (e) {
      warn(`[ghostcrab] bootstrap: .env         ERROR — ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── data/ ────────────────────────────────────────────────────────────────────
  const dataDir = join(projectDir, "data");
  if (existsSync(dataDir)) {
    log("[ghostcrab] bootstrap: data/        already exists");
  } else {
    try {
      mkdirSync(dataDir, { recursive: true });
      log("[ghostcrab] bootstrap: data/        created");
    } catch (e) {
      warn(`[ghostcrab] bootstrap: data/        ERROR — ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── doc symlinks ─────────────────────────────────────────────────────────────
  for (const { name, optional } of DOC_SYMLINKS) {
    const src = join(PKG_ROOT, name);
    if (!existsSync(src)) {
      if (!optional) warn(`[ghostcrab] bootstrap: ${name}: not found in package — skipped`);
      continue;
    }
    const dest = join(projectDir, name);
    const target = relative(projectDir, src);

    if (existsSync(dest)) {
      let st;
      try { st = lstatSync(dest); } catch { st = null; }
      if (st?.isSymbolicLink()) {
        try {
          unlinkSync(dest);
          symlinkSync(target, dest);
          log(`[ghostcrab] bootstrap: ${name.padEnd(28)} refreshed → ${target}`);
        } catch (e) {
          warn(`[ghostcrab] bootstrap: ${name}: refresh ERROR — ${e instanceof Error ? e.message : e}`);
        }
      } else {
        log(`[ghostcrab] bootstrap: ${name.padEnd(28)} skipped (real file exists — not overwritten)`);
      }
    } else {
      try {
        symlinkSync(target, dest);
        log(`[ghostcrab] bootstrap: ${name.padEnd(28)} → ${target}`);
      } catch (e) {
        warn(`[ghostcrab] bootstrap: ${name}: ERROR — ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  log(`\n[ghostcrab] bootstrap: done.\n  Next: npx gcp brain setup cursor --force`);
}
