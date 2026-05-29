import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadToolManifestFromDist() {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
import { registerAllTools } from "./dist/tools/register-all.js";
import {
  EXPECTED_TOOL_NAMES,
  diffToolNames,
  getExpectedToolManifest
} from "./dist/tools/tool-manifest.js";
import { listRegisteredTools } from "./dist/tools/registry.js";

registerAllTools();
const registered = listRegisteredTools().map((tool) => tool.name).sort();
const diff = diffToolNames(registered);
process.stdout.write(JSON.stringify({
  manifest: getExpectedToolManifest(),
  registered,
  expected_names: EXPECTED_TOOL_NAMES,
  missing: diff.missing,
  extra: diff.extra
}));
`
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to load tool manifest from dist build.\n${result.stderr}\n${result.stdout}`
    );
  }

  return JSON.parse(result.stdout);
}
