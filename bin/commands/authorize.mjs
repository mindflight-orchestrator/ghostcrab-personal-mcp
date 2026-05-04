/**
 * gcp authorize — chmod +x and (on macOS) clear quarantine on the installed backend.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preparePrebuildForInstall } from "../lib/prebuild-permissions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdAuthorize(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `
Usage: gcp authorize

Ensures the installed native binaries for *this* OS/arch can run:
  • ghostcrab-backend — HTTP server used by MCP
  • ghostcrab-document — optional; used by  gcp brain document  (same chmod / quarantine rules)
  • Linux / macOS: sets the executable bit if npm/pnpm dropped it
  • macOS (Intel or Apple Silicon): removes com.apple.quarantine when present
  • Windows: use file "Unblock" if SmartScreen blocks a .exe

Install hooks:
  The same steps run automatically in "postinstall" after install, unless you set:
    GHOSTCRAB_SKIP_POSTINSTALL=1
  Success lines only: set GHOSTCRAB_POSTINSTALL_QUIET=1 (missing-backend warnings still print).
  Skip gcp/backend smoke: GHOSTCRAB_SKIP_POSTINSTALL_SMOKE=1

Works the same for:
  pnpm add @scope/pkg
  pnpm add file:../package.tgz
  npm install
`.trim()
    );
    return;
  }

  const r = preparePrebuildForInstall(pkgRoot, {
    verbose: true,
    tryQuarantine: true,
    ignorePostinstallEnv: true
  });

  if (r.missing) {
    return;
  }

  if (!r.ok) {
    process.exit(1);
  }
}
