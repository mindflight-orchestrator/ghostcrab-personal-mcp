#!/usr/bin/env node
/**
 * Runs after `npm install` / `pnpm add` (registry or file: tarball).
 * - GHOSTCRAB_SKIP_POSTINSTALL=1 — skip native binary prep + smoke only (host bootstrap still runs unless GHOSTCRAB_SKIP_HOST_BOOTSTRAP=1).
 * - GHOSTCRAB_POSTINSTALL_QUIET=1 — fewer success lines (still warns if the backend is missing).
 * - GHOSTCRAB_SKIP_POSTINSTALL_SMOKE=1 — skip gcp/backend --help verification.
 * - GHOSTCRAB_SKIP_HOST_BOOTSTRAP=1 — skip .env / data/ / doc symlinks in the consumer project.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePrebuildForInstall } from "./prebuild-permissions.mjs";
import { runHostProjectBootstrap } from "./postinstall-host-bootstrap.mjs";
import { runPostinstallSmoke } from "./postinstall-smoke.mjs";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const quiet = process.env.GHOSTCRAB_POSTINSTALL_QUIET === "1";

// Host project .env / data/ / doc symlinks — independent of GHOSTCRAB_SKIP_POSTINSTALL
// (that env only skips native-binary prep + smoke below).
// npm 7+ buffers postinstall output unless --foreground-scripts is used, so the user
// may not see any of these log lines in their terminal. That is why gcp bootstrap exists
// as an explicit fallback — it always prints to stdout.
runHostProjectBootstrap({ pkgRoot, quiet });

const r = preparePrebuildForInstall(pkgRoot, {
  silent: quiet,
  tryQuarantine: true,
  softFail: true
});

if (r.skipped) {
  // GHOSTCRAB_SKIP_POSTINSTALL=1 — intentional no-op
} else if (r.missing) {
  const reg = r.packageName ? `  npm install ${r.packageName}` : "";
  const localTgz = `  npm install ./mindflight-ghostcrab-personal-mcp-${r.platformKey}-<version>.tgz`;
  console.error(
    `[ghostcrab] postinstall: no native backend found for ${r.platformKey}.\n` +
      `  The main package does not ship the Zig binary; install the platform prebuild too:\n` +
      (reg ? `${reg}\n` : "") +
      `${localTgz}\n` +
      `  Beta zip: run  node install-beta.mjs  in the unzipped folder.`
  );
} else if (!r.ok && r.error) {
  console.error(
    `[ghostcrab] postinstall: could not prepare the backend binary. Try:\n` +
      `  gcp authorize\n` +
      `  chmod +x "${r.binPath}"`
  );
} else if (r.warn) {
  console.error(
    `[ghostcrab] postinstall: ${r.warn} — run: gcp authorize or chmod +x "${r.binPath}"`
  );
}

if (
  !r.skipped &&
  !r.missing &&
  r.ok &&
  r.binPath &&
  process.env.GHOSTCRAB_SKIP_POSTINSTALL_SMOKE !== "1"
) {
  runPostinstallSmoke({ pkgRoot, backendPath: r.binPath, quiet });
  if (!quiet) {
    console.error("[ghostcrab] Next steps:");
    console.error("  1. If .env / data/ / README symlinks are missing in your project root, run:");
    console.error("       npx gcp bootstrap");
    console.error("  2. Register the MCP server in your IDE:");
    console.error("       npx gcp brain setup cursor --force");
    console.error("       npx gcp brain setup codex");
    console.error("       npx gcp brain setup claude");
    console.error(
      "[ghostcrab] See INSTALL.md / README_CURSOR_MCP.md / README_CODEX_MCP.md / README_CLAUDE_CODE_MCP.md in the package."
    );
  }
}
