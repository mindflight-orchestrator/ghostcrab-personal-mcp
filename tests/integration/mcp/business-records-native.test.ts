/** Mandatory real MCP -> HTTP -> SQLite coverage; each script owns its fixture. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const exec = promisify(execFile);
for (const script of ["verify-record-crud.mjs", "verify-business-graph.mjs"]) {
  it.skipIf(!process.env.MINDBRAIN_TEST_BINARY)(
    `native business contract: ${script}`,
    async () => {
      const { stdout } = await exec(
        process.execPath,
        [resolve("scripts", script)],
        {
          env: {
            ...process.env,
            GHOSTCRAB_CRUD_TEST_BINARY: process.env.MINDBRAIN_TEST_BINARY
          },
          timeout: 60_000,
          maxBuffer: 2 * 1024 * 1024
        }
      );
      expect(JSON.parse(stdout).status).toBe("passed");
    }
  );
}
