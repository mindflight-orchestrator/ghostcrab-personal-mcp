import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const pkgName = /** @type {string} */ (pkg.name);
const platformPackageMap = {
  "linux-x64": "@mindflight/ghostcrab-personal-mcp-linux-x64",
  "linux-arm64": "@mindflight/ghostcrab-personal-mcp-linux-arm64",
  "darwin-x64": "@mindflight/ghostcrab-personal-mcp-darwin-x64",
  "darwin-arm64": "@mindflight/ghostcrab-personal-mcp-darwin-arm64",
  "win32-x64": "@mindflight/ghostcrab-personal-mcp-win32-x64"
};

function currentPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

function pathUnderConsumer(consumer, name) {
  if (!name.startsWith("@")) {
    return join(consumer, "node_modules", name);
  }
  const s = name.indexOf("/");
  return join(consumer, "node_modules", name.slice(0, s), name.slice(s + 1));
}

function run(cmd, args, opts) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...opts
  });
}

function shPnpm(args, opts) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return run(pnpm, args, {
    ...opts,
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(tmpdir(), "ghostcrab-npm-cache"),
      pnpm_config_store_dir: process.env.pnpm_config_store_dir ?? join(tmpdir(), "ghostcrab-pnpm-store"),
      ...(opts?.env ?? {})
    }
  });
}

// Consumer install uses npm intentionally: pnpm 10+ ignores postinstall scripts by default
// ("Ignored build scripts"), which would silently skip the host bootstrap. npm matches the
// real-user flow we want to gate (`npm install @mindflight/ghostcrab-personal-mcp`).
function shNpm(args, opts) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return run(npm, args, {
    ...opts,
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(tmpdir(), "ghostcrab-npm-cache"),
      ...(opts?.env ?? {})
    }
  });
}

if (!process.env.GHOSTCRAB_VERIFY_SKIP_BUILD) {
  const build = shPnpm(["run", "build"], { cwd: repoRoot });
  assert.equal(
    build.status,
    0,
    `pnpm run build failed (exit ${build.status ?? "null"}).\n${build.stderr}`
  );
}

const packDest = mkdtempSync(join(tmpdir(), "ghostcrab-pack-"));
let consumerDir;

try {
  const pack = run(process.execPath, [join(repoRoot, "scripts/pack-local.mjs")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(tmpdir(), "ghostcrab-npm-cache")
    }
  });
  assert.equal(
    pack.status,
    0,
    `pack-local failed (exit ${pack.status ?? "null"}).\n${pack.stderr}\n${pack.stdout}`
  );

  const manifest = JSON.parse(readFileSync(join(repoRoot, "dist-pack", "pack-manifest.json"), "utf8"));
  const tarball = join(repoRoot, "dist-pack", manifest.root.filename);
  assert.ok(manifest.root?.filename, "pack-manifest missing root tarball");

  const platformKey = currentPlatformKey();
  const platformPackageName = platformPackageMap[platformKey];
  const platformTarballName = manifest.platforms?.[platformKey]?.filename;
  assert.ok(platformPackageName, `Unsupported verify-local-install platform ${platformKey}`);
  assert.ok(platformTarballName, `Missing platform tarball for ${platformKey} in pack-manifest`);
  const platformTarball = join(repoRoot, "dist-pack", platformTarballName);

  const outDir = process.env.GHOSTCRAB_PACK_OUTPUT_DIR;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const dest = join(outDir, tarball.split(/[/\\]/).pop());
    copyFileSync(tarball, dest);
    copyFileSync(platformTarball, join(outDir, platformTarball.split(/[/\\]/).pop()));
    console.error(`[verify-local-install] Copied pack to ${dest}`);
  }

  consumerDir = mkdtempSync(join(tmpdir(), "ghostcrab-install-"));
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "ghostcrab-local-install-smoke",
        version: "0.0.0",
        private: true
      },
      null,
      2
    )
  );

  // Install root + platform tarball in a single command. Two-step npm installs of file: tarballs
  // confuse the resolver ("Invalid Version") because the first step writes an optionalDependencies
  // pin pointing at a registry version that does not match the local file: spec.
  const add = shNpm(
    [
      "install",
      "--no-audit",
      "--no-fund",
      `file:${tarball}`,
      `file:${platformTarball}`
    ],
    { cwd: consumerDir }
  );
  assert.equal(
    add.status,
    0,
    `npm install file:${tarball} + ${platformTarball} failed (exit ${add.status ?? "null"}).\n${add.stderr}\n${add.stdout}`
  );

  const gcp = run(
    process.execPath,
    [join(pathUnderConsumer(consumerDir, pkgName), "bin", "gcp.mjs"), "--help"],
    { cwd: consumerDir }
  );
  assert.equal(
    gcp.status,
    0,
    `gcp --help failed (exit ${gcp.status ?? "null"}).\n${gcp.stderr}\n${gcp.stdout}`
  );
  assert.match(
    gcp.stdout ?? "",
    /GhostCrab CLI/,
    "Expected gcp --help to print GhostCrab banner"
  );

  const authz = run(
    process.execPath,
    [join(pathUnderConsumer(consumerDir, pkgName), "bin", "gcp.mjs"), "authorize"],
    { cwd: consumerDir }
  );
  assert.equal(
    authz.status,
    0,
    `gcp authorize failed (exit ${authz.status ?? "null"}).\n${authz.stderr}\n${authz.stdout}`
  );

  // ── Host bootstrap assertions: .env, data/, doc symlinks must exist after install ──
  const installedPkgDir = pathUnderConsumer(consumerDir, pkgName);
  const envExamplePath = join(installedPkgDir, ".env.example");
  assert.equal(
    existsSync(envExamplePath),
    true,
    `.env.example missing from installed package at ${envExamplePath}`
  );
  const envExampleBytes = readFileSync(envExamplePath, "utf8");

  const consumerEnv = join(consumerDir, ".env");
  assert.equal(
    existsSync(consumerEnv),
    true,
    `[host-bootstrap] consumer .env was not created at ${consumerEnv}`
  );
  const consumerEnvStat = lstatSync(consumerEnv);
  assert.equal(
    consumerEnvStat.isFile(),
    true,
    `[host-bootstrap] consumer .env is not a regular file (stat: ${JSON.stringify({ symlink: consumerEnvStat.isSymbolicLink(), file: consumerEnvStat.isFile() })})`
  );
  assert.equal(
    readFileSync(consumerEnv, "utf8"),
    envExampleBytes,
    "[host-bootstrap] consumer .env content does not match the package .env.example"
  );

  const consumerData = join(consumerDir, "data");
  assert.equal(
    existsSync(consumerData),
    true,
    `[host-bootstrap] consumer data/ directory was not created at ${consumerData}`
  );
  assert.equal(
    lstatSync(consumerData).isDirectory(),
    true,
    "[host-bootstrap] consumer data/ exists but is not a directory"
  );

  const expectedDocLinks = [
    "README.md",
    "INSTALL.md",
    "Licence.md",
    "README_CURSOR_MCP.md",
    "README_CODEX_MCP.md",
    "README_CLAUDE_CODE_MCP.md"
  ];
  const installedPkgRealPath = realpathSync(installedPkgDir);
  for (const docName of expectedDocLinks) {
    const docPath = join(consumerDir, docName);
    assert.equal(
      existsSync(docPath),
      true,
      `[host-bootstrap] expected doc symlink missing: ${docPath}`
    );
    const st = lstatSync(docPath);
    assert.equal(
      st.isSymbolicLink(),
      true,
      `[host-bootstrap] expected ${docName} to be a symlink (stat: dir=${st.isDirectory()} file=${st.isFile()} link=${st.isSymbolicLink()})`
    );
    const resolved = realpathSync(docPath);
    assert.equal(
      resolved.startsWith(installedPkgRealPath),
      true,
      `[host-bootstrap] symlink ${docName} resolves to ${resolved} which is outside ${installedPkgRealPath}`
    );
  }

  // ── Re-install must NOT overwrite a user-edited .env ──
  const userEnvSentinel = "# ghostcrab verify-local-install user edit sentinel\nFOO=user_edit\n";
  writeFileSync(consumerEnv, userEnvSentinel, "utf8");
  const reinstall = shNpm(
    ["install", "--no-audit", "--no-fund", `file:${tarball}`],
    { cwd: consumerDir }
  );
  assert.equal(
    reinstall.status,
    0,
    `npm install (re-install) failed (exit ${reinstall.status ?? "null"}).\n${reinstall.stderr}\n${reinstall.stdout}`
  );
  assert.equal(
    readFileSync(consumerEnv, "utf8"),
    userEnvSentinel,
    "[host-bootstrap] consumer .env was overwritten by a re-install (must be left alone when present)"
  );

  // ── gcp brain setup cursor must produce a working mcp.json shape and prune legacy keys.
  // Regression gate for the user-reported "spawn gcp ENOENT" / "could not determine
  // executable to run" failures: assert the new entry uses the new server key and an
  // absolute path to bin/gcp.mjs, and that any pre-0.2.10 `ghostcrab` block we wrote is
  // automatically removed.
  const fakeCursorDir = mkdtempSync(join(tmpdir(), "ghostcrab-cursor-"));
  const fakeCursorMcp = join(fakeCursorDir, "mcp.json");
  const installedGcpMjs = join(installedPkgRealPath, "bin", "gcp.mjs");
  writeFileSync(
    fakeCursorMcp,
    JSON.stringify(
      {
        mcpServers: {
          ghostcrab: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@mindflight/ghostcrab-personal-mcp@latest", "gcp", "brain", "up"],
            env: {
              GHOSTCRAB_DATABASE_KIND: "sqlite",
              GHOSTCRAB_EMBEDDINGS_MODE: "disabled",
            },
          },
          unrelated: {
            type: "stdio",
            command: "/bin/true",
            args: [],
            env: { OTHER: "1" },
          },
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const setupRun = run(
    process.execPath,
    [installedGcpMjs, "brain", "setup", "cursor", "--force"],
    { cwd: consumerDir, env: { ...process.env, HOME: fakeCursorDir, USERPROFILE: fakeCursorDir } }
  );
  assert.equal(
    setupRun.status,
    0,
    `gcp brain setup cursor failed (exit ${setupRun.status ?? "null"}).\n${setupRun.stderr}\n${setupRun.stdout}`
  );

  // The fake HOME points the generator at <fakeCursorDir>/.cursor/mcp.json — but our seed
  // file lives directly at <fakeCursorDir>/mcp.json so the generator does not see it. Re-run
  // the assertion against the file the generator actually wrote, plus a second pass that
  // seeds the legacy block at the right path so we exercise pruning end-to-end.
  const generatedCursorMcp = join(fakeCursorDir, ".cursor", "mcp.json");
  assert.equal(
    existsSync(generatedCursorMcp),
    true,
    `[mcp-setup] generator did not write ${generatedCursorMcp}`
  );
  const generatedDoc = JSON.parse(readFileSync(generatedCursorMcp, "utf8"));
  const newEntry = generatedDoc?.mcpServers?.["ghostcrab-personal-mcp"];
  assert.ok(
    newEntry && typeof newEntry === "object",
    `[mcp-setup] mcp.json missing mcpServers["ghostcrab-personal-mcp"]:\n${JSON.stringify(generatedDoc, null, 2)}`
  );
  // The command must be an absolute path to a node binary (process.execPath of whatever
  // node ran "gcp brain setup cursor"). It must NOT be bare "node" — Cursor's spawner
  // resolves bare "node" to its own bundled runtime, not the user's system node.
  assert.ok(
    newEntry.command && newEntry.command !== "node" && isAbsolute(newEntry.command),
    `[mcp-setup] expected command to be an absolute path to node (not bare "node"), got ${JSON.stringify(newEntry.command)}`
  );
  assert.ok(
    Array.isArray(newEntry.args) && newEntry.args[0] === installedGcpMjs,
    `[mcp-setup] expected args[0] to be the absolute path ${installedGcpMjs}, got ${JSON.stringify(newEntry.args)}`
  );
  assert.equal(
    generatedDoc?.mcpServers?.ghostcrab,
    undefined,
    "[mcp-setup] generator must not write the legacy 'ghostcrab' key"
  );

  // Pruning round-trip: seed the legacy block at the correct path, re-run with --force,
  // and assert the legacy entry is removed while unrelated servers are preserved.
  writeFileSync(
    generatedCursorMcp,
    JSON.stringify(
      {
        mcpServers: {
          ghostcrab: {
            type: "stdio",
            command: "npx",
            args: ["-y", "@mindflight/ghostcrab-personal-mcp@latest", "gcp", "brain", "up"],
            env: {
              GHOSTCRAB_DATABASE_KIND: "sqlite",
              GHOSTCRAB_EMBEDDINGS_MODE: "disabled",
            },
          },
          unrelated: {
            type: "stdio",
            command: "/bin/true",
            args: [],
            env: { OTHER: "1" },
          },
          "ghostcrab-personal-mcp": newEntry,
        },
      },
      null,
      2
    ),
    "utf8"
  );
  const setupPrune = run(
    process.execPath,
    [installedGcpMjs, "brain", "setup", "cursor", "--force"],
    { cwd: consumerDir, env: { ...process.env, HOME: fakeCursorDir, USERPROFILE: fakeCursorDir } }
  );
  assert.equal(
    setupPrune.status,
    0,
    `gcp brain setup cursor (prune pass) failed (exit ${setupPrune.status ?? "null"}).\n${setupPrune.stderr}\n${setupPrune.stdout}`
  );
  const prunedDoc = JSON.parse(readFileSync(generatedCursorMcp, "utf8"));
  assert.equal(
    prunedDoc?.mcpServers?.ghostcrab,
    undefined,
    `[mcp-setup] legacy 'ghostcrab' entry was not pruned. Result:\n${JSON.stringify(prunedDoc, null, 2)}`
  );
  assert.ok(
    prunedDoc?.mcpServers?.unrelated,
    "[mcp-setup] pruning removed an unrelated user-authored MCP server"
  );

  rmSync(fakeCursorDir, { recursive: true, force: true });

  console.error(
    `[verify-local-install] OK — installer + ${platformPackageName}, gcp --help, gcp authorize, host bootstrap (.env / data/ / doc symlinks), and gcp brain setup cursor (new key + absolute node path + legacy pruning) all succeeded.`
  );
} finally {
  rmSync(packDest, { recursive: true, force: true });
  if (consumerDir) {
    rmSync(consumerDir, { recursive: true, force: true });
  }
}
