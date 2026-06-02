#!/usr/bin/env node
/**
 * Sync ghostcrab-skills authoring tree -> bin/ide-skills install bundles.
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
const skillsRoot =
  process.env.GHOSTCRAB_SKILLS_SOURCE_ROOT ?? join(repoRoot, "ghostcrab-skills");
const outRoot =
  process.env.GHOSTCRAB_IDE_SKILLS_OUT_ROOT ?? join(repoRoot, "bin", "ide-skills");
const generatedAt =
  process.env.GHOSTCRAB_IDE_SKILLS_GENERATED_AT ?? new Date().toISOString();

const SKILL_NAMES = [
  "ghostcrab-memory",
  "ghostcrab-prompt-guide",
  "ghostcrab-data-architect",
  "ghostcrab-integration-sop-editor",
  "mindbrain-comparison-writer"
];

const SHARED_FROM_SHARED = [
  "ONBOARDING_CONTRACT.md",
  "QUERY_PATTERNS.md",
  "TRANSITION_LOGGING.md",
  "SCHEMA_DESIGN.md",
  "APP_PATTERNS.md",
  "WORKSPACE_CONTEXT.md",
  "PATH_CONTENT_FACETS.md",
  "DEMO_CHOOSER.md"
];

const SHARED_FROM_ROOT = ["CAPABILITIES.md", "SERVER_INSTRUCTIONS.md"];

/**
 * @param {string} text
 * @param {"skill" | "claude-starter"} target
 */
function rewriteLinks(text, target) {
  let out = text;
  const sharedLinkPatterns = [
    /\]\(\.\.\/\.\.\/shared\//g,
    /\]\(\.\.\/shared\//g,
    /\]\(\.\/shared\//g,
    /\]\(ghostcrab-skills\/shared\//g
  ];
  const bareSharedPatterns = [
    /\.\.\/\.\.\/shared\//g,
    /\.\.\/shared\//g,
    /ghostcrab-skills\/shared\//g
  ];

  if (target === "claude-starter") {
    for (const p of sharedLinkPatterns) {
      out = out.replace(p, "](.ghostcrab/skills/shared/");
    }
    for (const p of bareSharedPatterns) {
      out = out.replace(p, ".ghostcrab/skills/shared/");
    }
    out = out.replace(
      /\*\*\[ONBOARDING_CONTRACT\.md\]\([^)]+\)\*\*/g,
      "**[ONBOARDING_CONTRACT.md](.ghostcrab/skills/shared/ONBOARDING_CONTRACT.md)**"
    );
    return out;
  }

  for (const p of sharedLinkPatterns) {
    out = out.replace(p, "](../ghostcrab-shared/");
  }
  for (const p of bareSharedPatterns) {
    out = out.replace(p, "../ghostcrab-shared/");
  }
  out = out.replace(/\.\.\/\.\.\/ghostcrab-shared\//g, "../ghostcrab-shared/");
  return out;
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {"skill" | "claude-starter" | "raw"} target
 */
function copyTextFile(src, dest, target) {
  mkdirSync(dirname(dest), { recursive: true });
  const raw = readFileSync(src, "utf8");
  const text = target === "raw" ? raw : rewriteLinks(raw, target);
  writeFileSync(dest, text, "utf8");
}

/**
 * @param {string} src
 * @param {string} dest
 * @param {"skill" | "claude-starter" | "raw"} target
 */
function copyTree(src, dest, target) {
  if (!existsSync(src)) {
    throw new Error(`Missing source tree: ${src}`);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const rel of collectFiles(src)) {
    if (/^SKILL-\d+\.md$/i.test(rel)) continue;
    const from = join(src, rel);
    const to = join(dest, rel);
    if (/\.(md|mdc|json|yaml|yml|txt|tpl|sql)$/i.test(rel)) {
      copyTextFile(from, to, target);
    } else {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    }
  }
}

/** @param {string} skillDir */
function ensureCodexManualInvocation(skillDir) {
  const agentsDir = join(skillDir, "agents");
  const openaiPath = join(agentsDir, "openai.yaml");
  mkdirSync(agentsDir, { recursive: true });
  if (!existsSync(openaiPath)) {
    writeFileSync(
      openaiPath,
      "policy:\n  allow_implicit_invocation: false\n",
      "utf8"
    );
    return;
  }
  const text = readFileSync(openaiPath, "utf8");
  if (text.includes("allow_implicit_invocation")) return;
  const sep = text.endsWith("\n") ? "" : "\n";
  writeFileSync(
    openaiPath,
    `${text}${sep}policy:\n  allow_implicit_invocation: false\n`,
    "utf8"
  );
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
    if (!existsSync(src)) throw new Error(`Missing shared source: ${src}`);
    cpSync(src, join(destDir, name), { recursive: true });
  }
  for (const name of SHARED_FROM_ROOT) {
    const src = join(skillsRoot, name);
    if (!existsSync(src)) throw new Error(`Missing root source: ${src}`);
    cpSync(src, join(destDir, name), { recursive: true });
  }
}

function syncCursor() {
  rmSync(join(outRoot, "cursor"), { recursive: true, force: true });
  for (const name of SKILL_NAMES) {
    const dest = join(outRoot, "cursor", "skills", name);
    copyTree(
      join(skillsRoot, "skills", name),
      dest,
      "skill"
    );
    rmSync(join(dest, "agents"), { recursive: true, force: true });
  }
}

function syncClaudeCode() {
  rmSync(join(outRoot, "claude-code"), { recursive: true, force: true });
  const selfMem = join(outRoot, "claude-code", "self-memory");
  mkdirSync(selfMem, { recursive: true });

  copyTextFile(
    join(skillsRoot, "claude-code", "self-memory", "CLAUDE.md"),
    join(selfMem, "CLAUDE.install.md"),
    "claude-starter"
  );

  const settingsSrc = join(
    skillsRoot,
    "claude-code",
    "self-memory",
    ".claude",
    "settings.json"
  );
  if (existsSync(settingsSrc)) {
    cpSync(settingsSrc, join(selfMem, "settings.fragment.json"));
  }

  const readmeSrc = join(skillsRoot, "claude-code", "self-memory", "README.md");
  if (existsSync(readmeSrc)) {
    copyTextFile(readmeSrc, join(selfMem, "README.install.md"), "claude-starter");
  }

  for (const name of SKILL_NAMES) {
    const dest = join(outRoot, "claude-code", "skills", name);
    copyTree(
      join(skillsRoot, "skills", name),
      dest,
      "skill"
    );
    rmSync(join(dest, "agents"), { recursive: true, force: true });
  }
}

function syncCodex() {
  rmSync(join(outRoot, "codex"), { recursive: true, force: true });
  for (const name of SKILL_NAMES) {
    const dest = join(outRoot, "codex", "skills", name);
    copyTree(
      join(skillsRoot, "skills", name),
      dest,
      "skill"
    );
    ensureCodexManualInvocation(dest);
  }
}

function writeManifest() {
  const files = collectFiles(outRoot).filter((f) => f !== "manifest.json");
  const entries = files.map((rel) => ({
    path: rel,
    sha256: sha256File(join(outRoot, rel))
  }));

  const manifest = {
    generated_at: generatedAt,
    source: "ghostcrab-skills",
    skill_names: SKILL_NAMES,
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

Do not edit files here by hand. Source: \`ghostcrab-skills/skills/\`. Regenerate:

\`\`\`bash
pnpm run sync:ide-skills
\`\`\`

## Setup mapping

| \`gcp brain setup\` | Bundle | Installed by default |
|---------------------|--------|----------------------------|
| \`cursor\` | \`cursor/skills/\`, \`shared/\` | \`~/.cursor/skills/<skill>/\`, \`.ghostcrab/skills/shared/\` |
| \`claude\` | \`claude-code/self-memory/\`, \`claude-code/skills/\`, \`shared/\` | \`~/.claude/skills/<skill>/\`, \`.ghostcrab/claude-self-memory.md\`, \`.ghostcrab/skills/shared/\`, merge Claude settings |
| \`codex\` | \`codex/skills/\`, \`shared/\` | \`~/.codex/skills/<skill>/\`, \`~/.codex/skills/ghostcrab-shared/\` |
| \`generic\` | \`codex/skills/\`, \`shared/\` | \`~/.agents/skills/<skill>/\`, \`~/.agents/skills/ghostcrab-shared/\` |

Installed globally by \`gcp brain setup\` by default (opt-out: \`--no-skills\`; project install: \`--skills-scope project\`).
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

  const displayRoot = outRoot.startsWith(repoRoot)
    ? relative(repoRoot, outRoot)
    : outRoot;
  console.log(
    `[sync-ide-skills] Wrote ${collectFiles(outRoot).length} files under ${displayRoot}/`
  );
}

main();
