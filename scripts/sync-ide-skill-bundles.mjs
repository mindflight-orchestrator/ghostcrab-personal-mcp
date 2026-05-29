#!/usr/bin/env node
/**
 * Sync ghostcrab-skills authoring tree → bin/ide-skills install bundles.
 * Run: pnpm run sync:ide-skills
 */

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(repoRoot, "ghostcrab-skills");
const outRoot = join(repoRoot, "bin", "ide-skills");

const SHARED_FROM_SHARED = [
  "ONBOARDING_CONTRACT.md",
  "QUERY_PATTERNS.md",
  "TRANSITION_LOGGING.md",
  "SCHEMA_DESIGN.md",
  "APP_PATTERNS.md",
  "WORKSPACE_CONTEXT.md"
];

const SHARED_FROM_ROOT = ["CAPABILITIES.md", "SERVER_INSTRUCTIONS.md"];

/** @param {string} text @param {"cursor" | "claude-code" | "codex"} target */
function rewriteLinks(text, target) {
  let out = text;
  const sharedPatterns = [
    /\]\(\.\.\/\.\.\/shared\//g,
    /\]\(\.\.\/shared\//g,
    /ghostcrab-skills\/shared\//g,
    /\]\(\.\/shared\//g
  ];

  if (target === "cursor") {
    for (const p of sharedPatterns) {
      out = out.replace(p, (m) =>
        m.startsWith("](") ? "](../.ghostcrab/skills/shared/" : "../.ghostcrab/skills/shared/"
      );
    }
    out = out.replace(
      /follow `[^`]*ONBOARDING_CONTRACT\.md`/g,
      "follow `.ghostcrab/skills/shared/ONBOARDING_CONTRACT.md`"
    );
  } else if (target === "claude-code") {
    out = out.replace(/\[\.\.\/\.\.\/shared\/([^\]]+)\]/g, "[$1]");
    out = out.replace(
      /\]\(\.\.\/\.\.\/shared\/([^)]+)\)/g,
      "](./skills/shared/$1)"
    );
    for (const p of sharedPatterns) {
      out = out.replace(p, (m) =>
        m.startsWith("](") ? "](./skills/shared/" : "./skills/shared/"
      );
    }
    out = out.replace(
      /\*\*\[ONBOARDING_CONTRACT\.md\]\([^)]+\)\*\*/g,
      "**[ONBOARDING_CONTRACT.md](./skills/shared/ONBOARDING_CONTRACT.md)**"
    );
  } else if (target === "codex") {
    for (const p of sharedPatterns) {
      out = out.replace(p, (m) =>
        m.startsWith("](") ? "](../ghostcrab-shared/" : "../ghostcrab-shared/"
      );
    }
  }

  return out;
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {"cursor" | "claude-code" | "codex" | "shared"} target
 */
function copyTextFile(src, dest, target) {
  mkdirSync(dirname(dest), { recursive: true });
  const raw = readFileSync(src, "utf8");
  const text = target === "shared" ? raw : rewriteLinks(raw, target);
  writeFileSync(dest, text, "utf8");
}

/** @param {string} path */
function sha256File(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

/** @param {string} dir @param {string} [prefix] */
function collectFiles(dir, prefix = "") {
  /** @type {string[]} */
  const files = [];
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, rel));
    } else {
      files.push(rel);
    }
  }
  return files.sort();
}

function syncShared() {
  const destDir = join(outRoot, "shared");
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

  for (const name of SHARED_FROM_SHARED) {
    const src = join(skillsRoot, "shared", name);
    if (!existsSync(src)) {
      throw new Error(`Missing shared source: ${src}`);
    }
    cpSync(src, join(destDir, name));
  }
  for (const name of SHARED_FROM_ROOT) {
    const src = join(skillsRoot, name);
    if (!existsSync(src)) {
      throw new Error(`Missing root source: ${src}`);
    }
    cpSync(src, join(destDir, name));
  }
}

function syncCursor() {
  const destRule = join(outRoot, "cursor", "rules", "ghostcrab-memory.mdc");
  rmSync(join(outRoot, "cursor"), { recursive: true, force: true });
  copyTextFile(
    join(skillsRoot, "cursor", "rules", "ghostcrab-memory.mdc"),
    destRule,
    "cursor"
  );
}

function syncClaudeCode() {
  const destDir = join(outRoot, "claude-code", "self-memory");
  rmSync(join(outRoot, "claude-code"), { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

  copyTextFile(
    join(skillsRoot, "claude-code", "self-memory", "CLAUDE.md"),
    join(destDir, "CLAUDE.md"),
    "claude-code"
  );

  const settingsSrc = join(
    skillsRoot,
    "claude-code",
    "self-memory",
    ".claude",
    "settings.json"
  );
  if (existsSync(settingsSrc)) {
    cpSync(settingsSrc, join(destDir, "settings.fragment.json"));
  }

  const readmeSrc = join(skillsRoot, "claude-code", "self-memory", "README.md");
  if (existsSync(readmeSrc)) {
    copyTextFile(readmeSrc, join(destDir, "README.install.md"), "claude-code");
  }
}

function syncCodex() {
  const destDir = join(outRoot, "codex", "ghostcrab-memory");
  rmSync(join(outRoot, "codex"), { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  copyTextFile(
    join(skillsRoot, "codex", "ghostcrab-memory", "SKILL.md"),
    join(destDir, "SKILL.md"),
    "codex"
  );
}

function writeManifest() {
  const files = collectFiles(outRoot).filter((f) => f !== "manifest.json");
  const entries = files.map((rel) => ({
    path: rel,
    sha256: sha256File(join(outRoot, rel))
  }));

  const manifest = {
    generated_at: new Date().toISOString(),
    source: "ghostcrab-skills",
    files: entries
  };
  writeFileSync(
    join(outRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

function writeReadme() {
  const readme = `# IDE skill bundles (generated)

Do not edit files here by hand. Source: \`ghostcrab-skills/\`. Regenerate:

\`\`\`bash
pnpm run sync:ide-skills
\`\`\`

## Setup mapping

| \`gcp brain setup\` | Bundle | Installed into user project |
|---------------------|--------|----------------------------|
| \`cursor\` | \`cursor/\` + \`shared/\` | \`.cursor/rules/ghostcrab-memory.mdc\`, \`.ghostcrab/skills/shared/\` |
| \`claude\` | \`claude-code/self-memory/\` + \`shared/\` | \`.ghostcrab/claude-self-memory.md\`, \`.ghostcrab/skills/shared/\`, merge \`.claude/settings.json\` |
| \`codex\` | \`codex/ghostcrab-memory/\` + \`shared/\` | \`.codex/skills/ghostcrab-memory/\`, \`.codex/skills/ghostcrab-shared/\` |

Installed by \`gcp brain setup\` by default (opt-out: \`--no-skills\`).
`;
  writeFileSync(join(outRoot, "README.md"), readme, "utf8");
}

function assertNoStaleLinks() {
  const bad = [];
  for (const rel of collectFiles(outRoot)) {
    if (rel === "manifest.json" || rel === "README.md") continue;
    const text = readFileSync(join(outRoot, rel), "utf8");
    if (text.includes("ghostcrab-skills/shared")) {
      bad.push(rel);
    }
    if (rel.endsWith(".mdc") || rel.endsWith(".md")) {
      if (/\]\(\.\.\/\.\.\/shared\//.test(text)) {
        bad.push(rel);
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `Bundle still contains unresolved ghostcrab-skills paths: ${bad.join(", ")}`
    );
  }
}

function main() {
  if (!existsSync(skillsRoot)) {
    console.error(`ghostcrab-skills not found at ${skillsRoot}`);
    process.exit(1);
  }

  mkdirSync(outRoot, { recursive: true });
  syncShared();
  syncCursor();
  syncClaudeCode();
  syncCodex();
  writeReadme();
  assertNoStaleLinks();
  writeManifest();

  console.log(
    `[sync-ide-skills] Wrote ${collectFiles(outRoot).length} files under ${relative(repoRoot, outRoot)}/`
  );
}

main();
