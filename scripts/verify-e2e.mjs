import { spawnSync } from "node:child_process";

const pgPort = process.env.PG_PORT ?? (process.env.CI ? "5432" : "55432");
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgres://ghostcrab:ghostcrab@localhost:${pgPort}/ghostcrab`;
const postgresStack = process.env.GHOSTCRAB_POSTGRES_STACK ?? "native";
const composeFile =
  postgresStack === "fallback"
    ? "docker/docker-compose.yml"
    : "docker/docker-compose.native.yml";
const containerName =
  postgresStack === "fallback"
    ? "ghostcrab_postgres"
    : "ghostcrab_postgres_native";

const sharedEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  PG_PORT: pgPort,
  GHOSTCRAB_EMBEDDINGS_MODE: process.env.GHOSTCRAB_EMBEDDINGS_MODE ?? "disabled"
};

try {
  runCommand(npmCommand(), ["run", "lint"], { env: sharedEnv });
  runCommand(npmCommand(), ["run", "build"], { env: sharedEnv });
  runCommand(npmCommand(), ["run", "test"], { env: sharedEnv });
  runCommand(npmCommand(), ["run", "verify:pack"], { env: sharedEnv });

  runCommand(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "up",
      "-d",
      "--build",
      "postgres"
    ],
    { env: sharedEnv }
  );

  waitForHealthyContainer(containerName);

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
} finally {
  runCommand(
    "docker",
    ["compose", "-f", composeFile, "down", "-v"],
    { env: sharedEnv, allowFailure: true }
  );
}

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

function waitForHealthyContainer(containerName) {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = spawnSync(
      "docker",
      [
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}",
        containerName
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: process.env
      }
    );

    const healthState = result.stdout.trim();

    if (healthState === "healthy") {
      return;
    }

    sleep(2000);
  }

  throw new Error(`Container ${containerName} did not become healthy in time.`);
}

function sleep(milliseconds) {
  const result = spawnSync(
    process.execPath,
    ["-e", `setTimeout(() => {}, ${milliseconds})`],
    {
      stdio: "ignore"
    }
  );

  if (result.status !== 0) {
    throw new Error("Sleep helper failed.");
  }
}
