import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["examples/node-stdio-client/index.mjs"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GHOSTCRAB_EMBEDDINGS_MODE:
        process.env.GHOSTCRAB_EMBEDDINGS_MODE ?? "disabled"
    },
    encoding: "utf8"
  }
);

if (result.status !== 0) {
  throw new Error(
    `Example client failed with exit=${result.status ?? "null"}.\nSTDERR:\n${result.stderr}`
  );
}

const payload = JSON.parse(result.stdout.trim());

assert.equal(payload.tool_count >= 11, true);
assert.equal(payload.tools.includes("ghostcrab_status"), true);
assert.equal(payload.status.health, "YELLOW");
assert.equal(
  payload.status.next_actions.includes("resolve_constraints_first"),
  true
);
assert.equal(payload.pack.has_blocking_constraint, true);
assert.equal(payload.pack.recommended_next_step, "resolve_constraints_first");

console.error(
  "[ghostcrab-smoke] Example Node client validated against dist/index.js."
);
