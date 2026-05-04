import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const distPackDir = join(repoRoot, "dist-pack");
const tempNpmCache = join(tmpdir(), "ghostcrab-npm-cache");

const PLATFORM_PACKAGES = [
  {
    platformKey: "linux-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-linux-x64",
    packageDir: join(repoRoot, "packages/prebuild-linux-x64")
  },
  {
    platformKey: "linux-arm64",
    packageName: "@mindflight/ghostcrab-personal-mcp-linux-arm64",
    packageDir: join(repoRoot, "packages/prebuild-linux-arm64")
  },
  {
    platformKey: "darwin-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-darwin-x64",
    packageDir: join(repoRoot, "packages/prebuild-darwin-x64")
  },
  {
    platformKey: "darwin-arm64",
    packageName: "@mindflight/ghostcrab-personal-mcp-darwin-arm64",
    packageDir: join(repoRoot, "packages/prebuild-darwin-arm64")
  },
  {
    platformKey: "win32-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-win32-x64",
    packageDir: join(repoRoot, "packages/prebuild-win32-x64")
  }
];

const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function packFilename(name, version) {
  return `${name.replace(/^@/, "").replace(/\//g, "-")}-${version}.tgz`;
}

function runPack(cwd) {
  const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const result = spawnSync(
    pnpm,
    ["pack", "--pack-destination", distPackDir],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: process.env.npm_config_cache ?? tempNpmCache
      }
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `pnpm pack failed in ${cwd} (exit ${result.status ?? "null"}).\n` +
        `${result.stderr}\n${result.stdout}`
    );
  }

  const filename = join(distPackDir, packFilename(packageJson.name, packageJson.version));
  if (!packageJson.name || !packageJson.version) {
    throw new Error(`Invalid package metadata in ${cwd}/package.json`);
  }
  if (!existsSync(filename)) {
    throw new Error(`pnpm pack did not produce expected tarball: ${filename}`);
  }

  return {
    filename: basename(filename),
    packageName: packageJson.name,
    version: packageJson.version
  };
}

mkdirSync(tempNpmCache, { recursive: true });
rmSync(distPackDir, { recursive: true, force: true });
mkdirSync(distPackDir, { recursive: true });

const stage = spawnSync(process.execPath, [join(repoRoot, "scripts/stage-platform-packages.mjs")], {
  cwd: repoRoot,
  encoding: "utf8",
  env: process.env
});

if (stage.status !== 0) {
  throw new Error(
    `stage-platform-packages failed (exit ${stage.status ?? "null"}).\n` +
      `${stage.stderr}\n${stage.stdout}`
  );
}

const manifest = {
  generatedAt: new Date().toISOString(),
  root: null,
  platforms: {}
};

for (const entry of PLATFORM_PACKAGES) {
  const packed = runPack(entry.packageDir);
  manifest.platforms[entry.platformKey] = {
    packageName: entry.packageName,
    version: packed.version,
    filename: packed.filename
  };
}

const rootPacked = runPack(repoRoot);
manifest.root = {
  packageName: rootPackage.name,
  version: rootPacked.version,
  filename: rootPacked.filename
};

writeFileSync(join(distPackDir, "pack-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.error(`[pack-local] Wrote ${PLATFORM_PACKAGES.length + 1} tarballs to ${distPackDir}`);
