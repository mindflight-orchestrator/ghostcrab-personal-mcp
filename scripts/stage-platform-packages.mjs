import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const PLATFORM_PACKAGES = [
  {
    platformKey: "linux-x64",
    packageDir: "packages/prebuild-linux-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-linux-x64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "linux-arm64",
    packageDir: "packages/prebuild-linux-arm64",
    packageName: "@mindflight/ghostcrab-personal-mcp-linux-arm64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "darwin-x64",
    packageDir: "packages/prebuild-darwin-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-darwin-x64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "darwin-arm64",
    packageDir: "packages/prebuild-darwin-arm64",
    packageName: "@mindflight/ghostcrab-personal-mcp-darwin-arm64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "win32-x64",
    packageDir: "packages/prebuild-win32-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-win32-x64",
    binaryName: "ghostcrab-backend.exe",
    documentBinaryName: "ghostcrab-document.exe"
  }
];

function parseArgs(argv) {
  let onlyPlatform = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--platform" && argv[i + 1]) {
      onlyPlatform = argv[i + 1];
      i += 1;
    }
  }
  return { onlyPlatform };
}

function stagePackageMetadata(packageRoot) {
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Missing platform package manifest: ${packageJsonPath}`);
  }

  const rootVersion = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8")
  ).version;
  if (!rootVersion || typeof rootVersion !== "string") {
    throw new Error("Root package.json missing version");
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  packageJson.version = rootVersion;
  packageJson.license = "SEE LICENSE IN Licence.md";
  packageJson.files = Array.from(
    new Set([...(packageJson.files ?? []), "bin", "Licence.md"])
  );
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
}

function stagePackage(entry) {
  const packageRoot = join(repoRoot, entry.packageDir);
  const targetDir = join(packageRoot, "bin");
  mkdirSync(targetDir, { recursive: true });

  stagePackageMetadata(packageRoot);
  copyFileSync(join(repoRoot, "Licence.md"), join(packageRoot, "Licence.md"));

  for (const name of [entry.binaryName, entry.documentBinaryName]) {
    const sourcePath = join(repoRoot, "prebuilds", entry.platformKey, name);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `Missing prebuild for ${entry.platformKey}: ${sourcePath}\n` +
          `Run "pnpm run prebuild:all" first.`
      );
    }
    const targetPath = join(targetDir, name);
    rmSync(targetPath, { force: true });
    copyFileSync(sourcePath, targetPath);
    console.error(
      `[stage-platform-packages] ${entry.packageName} <= prebuilds/${entry.platformKey}/${name}`
    );
  }
}

const { onlyPlatform } = parseArgs(process.argv.slice(2));
const selected = onlyPlatform
  ? PLATFORM_PACKAGES.filter((entry) => entry.platformKey === onlyPlatform)
  : PLATFORM_PACKAGES;

if (selected.length === 0) {
  throw new Error(`Unknown --platform value "${onlyPlatform}"`);
}

for (const entry of selected) {
  stagePackage(entry);
}
