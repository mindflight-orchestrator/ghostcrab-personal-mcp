import { spawnSync } from "node:child_process";

const mindbrainUrl =
  process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";

const sharedEnv = {
  ...process.env,
  GHOSTCRAB_MINDBRAIN_URL: mindbrainUrl,
  GHOSTCRAB_EMBEDDINGS_MODE: process.env.GHOSTCRAB_EMBEDDINGS_MODE ?? "disabled"
};

runCommand(npmCommand(), ["run", "lint"], { env: sharedEnv });
runCommand(npmCommand(), ["run", "build"], { env: sharedEnv });
runCommand(npmCommand(), ["run", "test"], { env: sharedEnv });
runCommand(npmCommand(), ["run", "verify:pack"], { env: sharedEnv });
assertBackendHealthy(mindbrainUrl);
runCommand(npmCommand(), ["run", "migrate"], { env: sharedEnv });
runCommand(npmCommand(), ["run", "test:integration"], { env: sharedEnv });
runCommand(npmCommand(), ["run", "smoke:mcp"], { env: sharedEnv });
runCommand(npmCommand(), ["run", "smoke:mcp:incomplete-graph"], {
  env: sharedEnv
});
runCommand(npmCommand(), ["run", "smoke:mcp:memory-workflow"], {
  env: sharedEnv
});
runCommand(npmCommand(), ["run", "smoke:mcp:long-running"], {
  env: sharedEnv
});
runCommand(npmCommand(), ["run", "smoke:mcp:embeddings-fake"], {
  env: {
    ...sharedEnv,
    GHOSTCRAB_EMBEDDINGS_MODE: "fake"
  }
});
runCommand(npmCommand(), ["run", "smoke:example-client"], { env: sharedEnv });

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: options.env ?? process.env
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `Command failed (${command} ${args.join(" ")}), exit=${result.status ?? "null"}`
    );
  }
}

function assertBackendHealthy(baseUrl) {
  const healthUrl = new URL("/health", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
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
