import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../..");
let bundleRoot = "";

const EXPECTED_SHARED_FILES = [
  "ONBOARDING_CONTRACT.md",
  "QUERY_PATTERNS.md",
  "TRANSITION_LOGGING.md",
  "SCHEMA_DESIGN.md",
  "APP_PATTERNS.md",
  "WORKSPACE_CONTEXT.md",
  "CAPABILITIES.md",
  "SERVER_INSTRUCTIONS.md"
];

function listBundleTextFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...listBundleTextFiles(full, rel));
    } else if (/\.(md|mdc|json)$/.test(name.name)) {
      out.push(rel);
    }
  }
  return out;
}

describe("sync-ide-skill-bundles", () => {
  afterEach(() => {
    if (bundleRoot) {
      rmSync(bundleRoot, { recursive: true, force: true });
      bundleRoot = "";
    }
  });

  function runSync() {
    if (!bundleRoot) {
      bundleRoot = mkdtempSync(join(tmpdir(), "gc-ide-skills-"));
    }
    return spawnSync(process.execPath, ["scripts/sync-ide-skill-bundles.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GHOSTCRAB_IDE_SKILLS_OUT_ROOT: bundleRoot,
        GHOSTCRAB_IDE_SKILLS_GENERATED_AT: "2026-01-01T00:00:00.000Z"
      }
    });
  }

  it("sync script exits 0 and refreshes manifest", () => {
    const run = runSync();
    expect(run.status).toBe(0);
    expect(existsSync(join(bundleRoot, "manifest.json"))).toBe(true);
    expect(existsSync(join(bundleRoot, "cursor", "rules", "ghostcrab-memory.mdc"))).toBe(true);
  });

  it("manifest lists all bundle artifacts including shared subset", () => {
    runSync();
    const manifestPath = join(bundleRoot, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      source: string;
      files: { path: string; sha256: string }[];
    };
    expect(manifest.source).toBe("ghostcrab-skills");
    expect(manifest.files.length).toBeGreaterThanOrEqual(38);
    for (const name of EXPECTED_SHARED_FILES) {
      expect(manifest.files.some((f) => f.path === `shared/${name}`)).toBe(true);
    }
    expect(manifest.files.some((f) => f.path === "cursor/rules/ghostcrab-prompt-guide.mdc")).toBe(true);
    expect(manifest.files.some((f) => f.path === "cursor/skills/ghostcrab-memory/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "claude-code/skills/ghostcrab-memory/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "codex/skills/ghostcrab-memory/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "codex/skills/mindbrain-comparison-writer/references/article-blueprint.md")).toBe(true);
    expect(manifest.files.some((f) => f.path.includes("SKILL-2.md"))).toBe(false);
    for (const entry of manifest.files) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(existsSync(join(bundleRoot, entry.path))).toBe(true);
    }
  });

  it("bundle text files do not reference ghostcrab-skills/shared paths", () => {
    runSync();
    const offenders: string[] = [];
    for (const rel of listBundleTextFiles(bundleRoot)) {
      if (rel === "manifest.json" || rel === "README.md") continue;
      const text = readFileSync(join(bundleRoot, rel), "utf8");
      if (text.includes("ghostcrab-skills/shared")) {
        offenders.push(rel);
      }
      if (/\]\(\.\.\/\.\.\/shared\//.test(text)) {
        offenders.push(`${rel} (../../shared link)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("cursor and claude bundles use project-local shared paths", () => {
    runSync();
    const cursorRule = readFileSync(
      join(bundleRoot, "cursor/rules/ghostcrab-memory.mdc"),
      "utf8"
    );
    expect(cursorRule).not.toContain("ghostcrab-skills/shared");

    const claude = readFileSync(
      join(bundleRoot, "claude-code/skills/ghostcrab-memory/SKILL.md"),
      "utf8"
    );
    expect(claude).toContain("../ghostcrab-shared/ONBOARDING_CONTRACT.md");

    const codex = readFileSync(
      join(bundleRoot, "codex/skills/ghostcrab-memory/SKILL.md"),
      "utf8"
    );
    expect(codex).toContain("../ghostcrab-shared/ONBOARDING_CONTRACT.md");
  });

  it("re-running sync is a no-op on manifest paths and checksums", () => {
    runSync();
    const before = JSON.parse(
      readFileSync(join(bundleRoot, "manifest.json"), "utf8")
    );
    runSync();
    const after = JSON.parse(
      readFileSync(join(bundleRoot, "manifest.json"), "utf8")
    );
    expect(after.files).toEqual(before.files);
  });
});
