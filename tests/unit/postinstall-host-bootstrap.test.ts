import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "vitest";
import { findConsumerProjectRoot } from "../../bin/lib/postinstall-host-bootstrap.mjs";

const __dirname = import.meta.dirname;

describe("findConsumerProjectRoot", () => {
  let root = "";
  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = "";
    }
  });

  test("returns project root for scoped package under node_modules", () => {
    root = mkdtempSync(join(tmpdir(), "gc-bootstrap-"));
    const pkgDir = join(
      root,
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp"
    );
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "my-app", private: true })
    );

    assert.equal(findConsumerProjectRoot(pkgDir), root);
  });

  test("returns nearest package.json for pnpm-style path", () => {
    root = mkdtempSync(join(tmpdir(), "gc-bootstrap-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "pnpm-app", private: true })
    );
    const pkgDir = join(
      root,
      "node_modules",
      ".pnpm",
      "@mindflight+ghostcrab-personal-mcp@0.0.0",
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp"
    );
    mkdirSync(pkgDir, { recursive: true });

    assert.equal(findConsumerProjectRoot(pkgDir), root);
  });

  test("returns null when consumer is this package (monorepo root)", () => {
    root = mkdtempSync(join(tmpdir(), "gc-bootstrap-"));
    const pkgDir = join(
      root,
      "node_modules",
      "@mindflight",
      "ghostcrab-personal-mcp"
    );
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")
    );

    assert.equal(findConsumerProjectRoot(pkgDir), null);
  });
});
