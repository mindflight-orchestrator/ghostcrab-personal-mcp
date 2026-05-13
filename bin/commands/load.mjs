/**
 * gcp load <path/to/profile.jsonl>
 * gcp load --file <path/to/profile.jsonl>
 *
 * Loads a portable demo profile (JSONL: profile / remember / learn_node /
 * learn_edge / projection lines) into the database reached via env
 * (MindBrain backend). Uses the same pipeline as `pnpm run demo:load`.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdLoad(args) {
  if (args[0] === "--help" || args[0] === "-h") {
    console.log(
      `Usage: gcp load <path/to/profile.jsonl>\n` +
        `       gcp load --file <path/to/profile.jsonl>\n\n` +
        `Loads a portable JSONL demo profile into GhostCrab (same format as ghostcrab-skills shared/demo-profiles/*.jsonl).\n` +
        `Requires a built package (dist/cli/demo-load.js). Run: pnpm run build`
    );
    return;
  }

  let file = null;
  if (args[0] === "--file" || args[0] === "-f") {
    file = args[1];
    if (!file) {
      console.error("gcp load: --file requires a path");
      process.exit(1);
    }
  } else if (args[0] && !args[0].startsWith("-")) {
    file = args[0];
  }

  if (!file) {
    console.error(
      "gcp load: missing path — use: gcp load <profile.jsonl> or gcp load --file <profile.jsonl>"
    );
    process.exit(1);
  }

  const resolved = resolve(process.cwd(), file);
  if (!existsSync(resolved)) {
    console.error(`gcp load: file not found: ${resolved}`);
    process.exit(1);
  }

  const demoLoadJs = join(pkgRoot, "dist", "cli", "demo-load.js");
  if (!existsSync(demoLoadJs)) {
    console.error(
      `gcp load: ${demoLoadJs} not found. Run \`pnpm run build\` in the package directory (global install should ship dist/).`
    );
    process.exit(1);
  }

  const { runDemoLoad } = await import(pathToFileURL(demoLoadJs).href);
  await runDemoLoad(["--profile-file", resolved]);
}
