import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../..");
const bundleRoot = join(repoRoot, "bin/ide-skills");

const EXPECTED_SHARED_FILES = [
  "ONBOARDING_CONTRACT.md",
  "QUERY_PATTERNS.md",
  "TRANSITION_LOGGING.md",
  "SCHEMA_DESIGN.md",
  "APP_PATTERNS.md",
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
  it("sync script exits 0 and refreshes manifest", () => {
    const run = spawnSync(process.execPath, ["scripts/sync-ide-skill-bundles.mjs"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/Wrote \d+ files under bin\/ide-skills/);
  });

  it("manifest lists all bundle artifacts including shared subset", () => {
    const manifestPath = join(bundleRoot, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      source: string;
      files: { path: string; sha256: string }[];
    };
    expect(manifest.source).toBe("ghostcrab-skills");
    expect(manifest.files.length).toBeGreaterThanOrEqual(13);
    for (const name of EXPECTED_SHARED_FILES) {
      expect(manifest.files.some((f) => f.path === `shared/${name}`)).toBe(true);
    }
    for (const entry of manifest.files) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(existsSync(join(bundleRoot, entry.path))).toBe(true);
    }
  });

  it("bundle text files do not reference ghostcrab-skills/shared paths", () => {
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
    const cursorRule = readFileSync(
      join(bundleRoot, "cursor/rules/ghostcrab-memory.mdc"),
      "utf8"
    );
    expect(cursorRule).toContain(".ghostcrab/skills/shared/ONBOARDING_CONTRACT.md");

    const claude = readFileSync(
      join(bundleRoot, "claude-code/self-memory/CLAUDE.md"),
      "utf8"
    );
    expect(claude).toContain("./skills/shared/ONBOARDING_CONTRACT.md");

    const codex = readFileSync(
      join(bundleRoot, "codex/ghostcrab-memory/SKILL.md"),
      "utf8"
    );
    expect(codex).toContain("../ghostcrab-shared/ONBOARDING_CONTRACT.md");
  });

  it("re-running sync is a no-op on manifest paths and checksums", () => {
    const before = JSON.parse(
      readFileSync(join(bundleRoot, "manifest.json"), "utf8")
    );
    spawnSync(process.execPath, ["scripts/sync-ide-skill-bundles.mjs"], {
      cwd: repoRoot
    });
    const after = JSON.parse(
      readFileSync(join(bundleRoot, "manifest.json"), "utf8")
    );
    expect(after.files).toEqual(before.files);
  });
});
