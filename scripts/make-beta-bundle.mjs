import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const distPackDir = join(repoRoot, "dist-pack");
const manifestPath = join(distPackDir, "pack-manifest.json");
const bundleDir = join(distPackDir, "beta-bundle");
const betaReadme = join(
  repoRoot,
  "docs",
  "installers",
  "beta-bundle",
  "BETA_TESTERS.md"
);
const installScriptSrc = join(repoRoot, "scripts", "beta-bundle-install.mjs");
const installPs1Src = join(repoRoot, "scripts", "beta-bundle-install.ps1");
const spawnNpmLibSrc = join(repoRoot, "scripts", "lib", "spawn-npm.mjs");
const ideSmokeScriptSrc = join(
  repoRoot,
  "scripts",
  "smoke-beta-ide-install.mjs"
);
const installMdSrc = join(repoRoot, "INSTALL.md");
const licenceSrc = join(repoRoot, "Licence.md");
const makefileSrc = join(
  repoRoot,
  "docs",
  "installers",
  "beta-bundle",
  "Makefile"
);
const makefileReadmeSrc = join(
  repoRoot,
  "docs",
  "installers",
  "beta-bundle",
  "README.md"
);

if (!existsSync(manifestPath)) {
  throw new Error(`Missing ${manifestPath}. Run "pnpm run pack:local" first.`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.root?.version;
if (!version) {
  throw new Error(`Invalid pack manifest at ${manifestPath}`);
}

rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(bundleDir, { recursive: true });

const filesToCopy = [
  manifest.root.filename,
  ...Object.values(manifest.platforms).map((entry) => entry.filename)
];
for (const relativeName of filesToCopy) {
  const src = join(distPackDir, relativeName);
  if (!existsSync(src)) {
    throw new Error(`Missing tarball listed in pack-manifest: ${src}`);
  }
  copyFileSync(src, join(bundleDir, basename(src)));
}

copyFileSync(manifestPath, join(bundleDir, "pack-manifest.json"));
writeFileSync(
  join(bundleDir, "package.json"),
  JSON.stringify(
    {
      name: "ghostcrab-beta-bundle",
      version,
      private: true
    },
    null,
    2
  ) + "\n"
);
const readmeTemplate = readFileSync(betaReadme, "utf8");
writeFileSync(
  join(bundleDir, "README.md"),
  readmeTemplate.replaceAll("{{VERSION}}", version)
);

if (!existsSync(installScriptSrc)) {
  throw new Error(`Missing installer script: ${installScriptSrc}`);
}
copyFileSync(installScriptSrc, join(bundleDir, "install-beta.mjs"));

if (!existsSync(installPs1Src)) {
  throw new Error(`Missing installer script: ${installPs1Src}`);
}
copyFileSync(installPs1Src, join(bundleDir, "install-beta.ps1"));

if (!existsSync(spawnNpmLibSrc)) {
  throw new Error(`Missing spawn helper: ${spawnNpmLibSrc}`);
}
mkdirSync(join(bundleDir, "lib"), { recursive: true });
copyFileSync(spawnNpmLibSrc, join(bundleDir, "lib", "spawn-npm.mjs"));

if (!existsSync(ideSmokeScriptSrc)) {
  throw new Error(`Missing IDE smoke script: ${ideSmokeScriptSrc}`);
}
copyFileSync(ideSmokeScriptSrc, join(bundleDir, "smoke-ide-install.mjs"));

if (!existsSync(installMdSrc)) {
  throw new Error(`Missing ${installMdSrc}`);
}
copyFileSync(installMdSrc, join(bundleDir, "INSTALL.md"));

if (!existsSync(licenceSrc)) {
  throw new Error(`Missing ${licenceSrc}`);
}
copyFileSync(licenceSrc, join(bundleDir, "Licence.md"));

if (!existsSync(makefileSrc)) {
  throw new Error(`Missing ${makefileSrc}`);
}
const makefileBody = readFileSync(makefileSrc, "utf8").replace(
  /^VERSION\s+\?=.*/m,
  `VERSION    ?= ${version}`
);
writeFileSync(join(bundleDir, "Makefile"), makefileBody);

if (!existsSync(makefileReadmeSrc)) {
  throw new Error(`Missing ${makefileReadmeSrc}`);
}
copyFileSync(makefileReadmeSrc, join(bundleDir, "README_MAKE.md"));

const checksumNames = [
  "README.md",
  "INSTALL.md",
  "Licence.md",
  "Makefile",
  "README_MAKE.md",
  "package.json",
  "pack-manifest.json",
  "install-beta.mjs",
  "install-beta.ps1",
  "lib/spawn-npm.mjs",
  "smoke-ide-install.mjs",
  ...filesToCopy.map((entry) => basename(entry))
];
const checksumLines = [];
for (const name of checksumNames) {
  const fullPath = join(bundleDir, name);
  const sha256 = createHash("sha256")
    .update(readFileSync(fullPath))
    .digest("hex");
  checksumLines.push(`${sha256}  ${name}`);
}
writeFileSync(
  join(bundleDir, "SHA256SUMS.txt"),
  checksumLines.join("\n") + "\n"
);

const zipName = `ghostcrab-beta-${version}.zip`;
const zipPath = join(distPackDir, zipName);
rmSync(zipPath, { force: true });

function createZipArchive() {
  if (process.platform !== "win32") {
    return spawnSync("zip", ["-r", zipPath, "."], {
      cwd: bundleDir,
      encoding: "utf8"
    });
  }

  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Compress-Archive -Path (Join-Path $env:GHOSTCRAB_BETA_BUNDLE_DIR '*') -DestinationPath $env:GHOSTCRAB_BETA_ZIP_PATH -Force"
  ];
  const options = {
    cwd: bundleDir,
    encoding: "utf8",
    env: {
      ...process.env,
      GHOSTCRAB_BETA_BUNDLE_DIR: bundleDir,
      GHOSTCRAB_BETA_ZIP_PATH: zipPath
    }
  };
  const pwsh = spawnSync("pwsh", args, options);
  if (pwsh.error?.code !== "ENOENT") {
    return pwsh;
  }
  return spawnSync("powershell.exe", args, options);
}

const zip = createZipArchive();

if (zip.status !== 0) {
  throw new Error(
    `zip failed with exit=${zip.status ?? "null"}${zip.error ? ` (${zip.error.code}: ${zip.error.message})` : ""}.\n` +
      `STDERR:\n${zip.stderr}\nSTDOUT:\n${zip.stdout}`
  );
}

console.error(`[beta-bundle] Wrote ${zipPath}`);
