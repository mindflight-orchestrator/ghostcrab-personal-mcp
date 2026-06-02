import { spawnSync } from "node:child_process";
import { formatSpawnFailure, spawnNpm } from "./lib/spawn-npm.mjs";

const mindbrainUrl =
  process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";

const sharedEnv = {
  ...process.env,
  GHOSTCRAB_MINDBRAIN_URL: mindbrainUrl,
  GHOSTCRAB_EMBEDDINGS_MODE: process.env.GHOSTCRAB_EMBEDDINGS_MODE ?? "disabled"
};

runCommand(["run", "lint"], { env: sharedEnv });
runCommand(["run", "build"], { env: sharedEnv });
runCommand(["run", "test"], { env: sharedEnv });
runCommand(["run", "verify:pack"], { env: sharedEnv });
assertBackendHealthy(mindbrainUrl);
runCommand(["run", "migrate"], { env: sharedEnv });
runCommand(["run", "test:integration"], { env: sharedEnv });
runCommand(["run", "verify:mcp-tools"], { env: sharedEnv });
runCommand(["run", "smoke:mcp"], { env: sharedEnv });
runCommand(["run", "smoke:mcp:incomplete-graph"], {
  env: sharedEnv
});
runCommand(["run", "smoke:mcp:memory-workflow"], {
  env: sharedEnv
});
runCommand(["run", "smoke:mcp:long-running"], {
  env: sharedEnv
});
runCommand(["run", "smoke:mcp:embeddings-fake"], {
  env: {
    ...sharedEnv,
    GHOSTCRAB_EMBEDDINGS_MODE: "fake"
  }
});
runCommand(["run", "smoke:example-client"], { env: sharedEnv });

function runCommand(args, options = {}) {
  const result = spawnNpm(args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: options.env ?? process.env
  });

  if ((result.status !== 0 || result.error) && !options.allowFailure) {
    throw new Error(
      `Command failed (npm ${args.join(" ")}), ${formatSpawnFailure(result)}`
    );
  }
}

function assertBackendHealthy(baseUrl) {
  const healthUrl = new URL(
    "/health",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  );
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
const url = process.argv[1];
const response = await fetch(url).catch((error) => {
  throw new Error("cannot reach MindBrain backend at " + url + ": " + error.message);
});
if (!response.ok) {
  throw new Error("MindBrain backend health check failed at " + url + ": " + response.status);
}
`,
      healthUrl.toString()
    ],
    {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `MindBrain backend is not healthy at ${healthUrl.toString()}. Start ghostcrab-backend or set GHOSTCRAB_MINDBRAIN_URL.`
    );
  }
}
