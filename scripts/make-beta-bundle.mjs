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
const betaReadme = join(repoRoot, "docs", "dev", "beta_testers_readme.md");
const installScriptSrc = join(repoRoot, "scripts", "beta-bundle-install.mjs");
const installMdSrc = join(repoRoot, "INSTALL.md");
const licenceSrc = join(repoRoot, "Licence.md");
const makefileSrc = join(repoRoot, "docs", "installer-question", "Makefile");
const makefileReadmeSrc = join(
  repoRoot,
  "docs",
  "installer-question",
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
const readmeTemplate = readFileSync(betaReadme, "utf8");
writeFileSync(
  join(bundleDir, "README.md"),
  readmeTemplate.replaceAll("{{VERSION}}", version)
);

if (!existsSync(installScriptSrc)) {
  throw new Error(`Missing installer script: ${installScriptSrc}`);
}
copyFileSync(installScriptSrc, join(bundleDir, "install-beta.mjs"));

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
  "pack-manifest.json",
  "install-beta.mjs",
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

const zip = spawnSync("zip", ["-r", zipPath, "."], {
  cwd: bundleDir,
  encoding: "utf8"
});

if (zip.status !== 0) {
  throw new Error(
    `zip failed with exit=${zip.status ?? "null"}.\nSTDERR:\n${zip.stderr}\nSTDOUT:\n${zip.stdout}`
  );
}

console.error(`[beta-bundle] Wrote ${zipPath}`);
