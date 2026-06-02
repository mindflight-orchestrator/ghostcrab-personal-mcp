import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureGhostcrabSkillLinks } from "../../bin/lib/postinstall-skill-links.mjs";

describe("ensureGhostcrabSkillLinks", () => {
  let root = "";

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  it("recreates package-local skill reference links after npm install", () => {
    root = mkdtempSync(join(tmpdir(), "gc-skill-links-"));
    for (const name of ["ghostcrab-memory", "ghostcrab-prompt-guide"]) {
      mkdirSync(join(root, "ghostcrab-skills", "skills", name), {
        recursive: true
      });
      writeFileSync(
        join(root, "ghostcrab-skills", "skills", name, "SKILL.md"),
        `# ${name}\n`
      );
    }
    for (const target of ["codex", "cursor", "claude-code"]) {
      mkdirSync(join(root, "bin", "ide-skills", target, "skills"), {
        recursive: true
      });
    }
    mkdirSync(join(root, "ghostcrab-skills", "codex"), { recursive: true });
    mkdirSync(join(root, "ghostcrab-skills", "cursor"), { recursive: true });
    mkdirSync(join(root, "ghostcrab-skills", "claude-code"), {
      recursive: true
    });

    const result = ensureGhostcrabSkillLinks({ pkgRoot: root, quiet: true });

    expect(result.ok).toBe(true);
    expect(result.created).toHaveLength(11);
    for (const path of [
      join(root, "ghostcrab-skills", "all", "ghostcrab-memory"),
      join(root, "ghostcrab-skills", "codex", "ghostcrab-memory"),
      join(root, "ghostcrab-skills", "cursor", "skills", "ghostcrab-memory"),
      join(
        root,
        "ghostcrab-skills",
        "claude-code",
        "skills",
        "ghostcrab-memory"
      ),
      join(root, "ghostcrab-skills", "generated", "codex"),
      join(root, "ghostcrab-skills", "generated", "cursor"),
      join(root, "ghostcrab-skills", "generated", "claude-code")
    ]) {
      expect(existsSync(path)).toBe(true);
      expect(lstatSync(path).isSymbolicLink()).toBe(true);
      expect(readlinkSync(path)).not.toBe("");
    }
  });
});
