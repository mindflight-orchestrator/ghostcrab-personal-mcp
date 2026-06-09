import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "../..");
let bundleRoot = "";

const EXPECTED_SKILL_NAMES = [
  "ghostcrab-memory",
  "ghostcrab-prompt-guide",
  "ghostcrab-data-architect",
  "ghostcrab-integration-sop-editor",
  "mindbrain-comparison-writer",
  "ghostcrab-operator",
  "ghostcrab-evidence-discovery",
  "ghostcrab-projection-reviewer",
  "ghostcrab-gap-auditor",
  "ghostcrab-json-answer-builder"
];

const EXPECTED_SHARED_FILES = [
  "ONBOARDING_CONTRACT.md",
  "QUERY_PATTERNS.md",
  "TRANSITION_LOGGING.md",
  "SCHEMA_DESIGN.md",
  "APP_PATTERNS.md",
  "WORKSPACE_CONTEXT.md",
  "CAPABILITIES.md",
  "SERVER_INSTRUCTIONS.md",
  "ARTIFACT_KINDS.md",
  "RUNTIME_QUERY_PIPELINE.md",
  "MCP_VS_GCP_ROUTING.md",
  "IMPORT_CLOSURE_GATES.md",
  "GAP_TAXONOMY.md",
  "SKILL_ROUTE_MAP_ESSENTIALS.md"
];

const EXPECTED_FILES_PER_SKILL = 3; // SKILL.md + codex agents/openai.yaml + one IDE bundle copy each

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
    expect(existsSync(join(bundleRoot, "cursor", "rules", "ghostcrab-memory.mdc"))).toBe(false);
    expect(existsSync(join(bundleRoot, "claude-code", "self-memory", "CLAUDE.install.md"))).toBe(true);
    expect(existsSync(join(bundleRoot, "claude-code", "self-memory", "CLAUDE.md"))).toBe(false);
  });

  it("manifest lists all bundle artifacts including shared subset", () => {
    runSync();
    const manifestPath = join(bundleRoot, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      source: string;
      skill_names: string[];
      files: { path: string; sha256: string }[];
    };
    expect(manifest.source).toBe("ghostcrab-skills");
    expect(manifest.skill_names).toEqual(EXPECTED_SKILL_NAMES);
    const minFiles =
      EXPECTED_SHARED_FILES.length +
      EXPECTED_SKILL_NAMES.length * EXPECTED_FILES_PER_SKILL +
      5; // README + claude self-memory install artifacts
    expect(manifest.files.length).toBeGreaterThanOrEqual(minFiles);
    for (const name of EXPECTED_SHARED_FILES) {
      expect(manifest.files.some((f) => f.path === `shared/${name}`)).toBe(true);
    }
    expect(manifest.files.some((f) => f.path.startsWith("cursor/rules/"))).toBe(false);
    expect(manifest.files.some((f) => f.path === "cursor/skills/ghostcrab-memory/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "claude-code/self-memory/CLAUDE.install.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "claude-code/self-memory/CLAUDE.md")).toBe(false);
    expect(manifest.files.some((f) => f.path === "claude-code/skills/ghostcrab-memory/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "codex/skills/ghostcrab-memory/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "codex/skills/ghostcrab-memory/agents/openai.yaml")).toBe(true);
    expect(manifest.files.some((f) => f.path === "codex/skills/ghostcrab-operator/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "cursor/skills/ghostcrab-operator/SKILL.md")).toBe(true);
    expect(manifest.files.some((f) => f.path === "claude-code/skills/ghostcrab-gap-auditor/SKILL.md")).toBe(true);
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

  it("cursor and claude bundles use skill-local shared paths", () => {
    runSync();
    expect(
      existsSync(join(bundleRoot, "cursor", "rules", "ghostcrab-memory.mdc"))
    ).toBe(false);

    const cursorSkill = readFileSync(
      join(bundleRoot, "cursor", "skills", "ghostcrab-memory", "SKILL.md"),
      "utf8"
    );
    expect(cursorSkill).toContain("../ghostcrab-shared/ONBOARDING_CONTRACT.md");
    expect(cursorSkill).toContain("disable-model-invocation: true");
    expect(
      existsSync(
        join(bundleRoot, "cursor/skills/mindbrain-comparison-writer/agents/openai.yaml")
      )
    ).toBe(false);

    const claude = readFileSync(
      join(bundleRoot, "claude-code/skills/ghostcrab-memory/SKILL.md"),
      "utf8"
    );
    expect(claude).toContain("../ghostcrab-shared/ONBOARDING_CONTRACT.md");
    expect(
      existsSync(
        join(
          bundleRoot,
          "claude-code/skills/mindbrain-comparison-writer/agents/openai.yaml"
        )
      )
    ).toBe(false);

    const codex = readFileSync(
      join(bundleRoot, "codex/skills/ghostcrab-memory/SKILL.md"),
      "utf8"
    );
    expect(codex).toContain("../ghostcrab-shared/ONBOARDING_CONTRACT.md");
    const codexPolicy = readFileSync(
      join(bundleRoot, "codex/skills/ghostcrab-memory/agents/openai.yaml"),
      "utf8"
    );
    expect(codexPolicy).toContain("allow_implicit_invocation: false");

    const operator = readFileSync(
      join(bundleRoot, "codex/skills/ghostcrab-operator/SKILL.md"),
      "utf8"
    );
    expect(operator).toContain("../ghostcrab-shared/RUNTIME_QUERY_PIPELINE.md");
    expect(operator).not.toContain("../../../docs/");
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
