/**
 * Cross-platform prep for the native backend.
 *
 * Resolution order:
 * - platform optionalDependency package when installed
 * - local prebuilds/{platform-key}/ fallback for dev builds
 *
 * - Linux / macOS: ensure POSIX execute bit (npm/pnpm often strip +x on unpack).
 * - macOS: try to clear Gatekeeper quarantine (downloaded / browser-copied toolchains).
 * - Windows: .exe is run directly; no chmod (nothing to do here).
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

export const SUPPORTED_PREBUILD_TARGETS = [
  {
    platformKey: "linux-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-linux-x64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "linux-arm64",
    packageName: "@mindflight/ghostcrab-personal-mcp-linux-arm64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "darwin-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-darwin-x64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "darwin-arm64",
    packageName: "@mindflight/ghostcrab-personal-mcp-darwin-arm64",
    binaryName: "ghostcrab-backend",
    documentBinaryName: "ghostcrab-document"
  },
  {
    platformKey: "win32-x64",
    packageName: "@mindflight/ghostcrab-personal-mcp-win32-x64",
    binaryName: "ghostcrab-backend.exe",
    documentBinaryName: "ghostcrab-document.exe"
  }
];

function getCurrentPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

function getTargetMetadata() {
  const platformKey = getCurrentPlatformKey();
  const binaryName =
    process.platform === "win32" ? "ghostcrab-backend.exe" : "ghostcrab-backend";
  const documentBinaryName =
    process.platform === "win32" ? "ghostcrab-document.exe" : "ghostcrab-document";
  const packageEntry = SUPPORTED_PREBUILD_TARGETS.find((entry) => entry.platformKey === platformKey);
  return {
    platformKey,
    binaryName,
    documentBinaryName,
    packageName: packageEntry?.packageName ?? null
  };
}

/**
 * @param {string} pkgRoot
 * @returns {{ path: string, platformKey: string, binaryName: string, packageName: string | null }}
 */
export function getNativeBackendPath(pkgRoot) {
  const { platformKey, binaryName, packageName } = getTargetMetadata();
  return {
    path: join(pkgRoot, "prebuilds", platformKey, binaryName),
    platformKey,
    binaryName,
    packageName
  };
}

/**
 * @param {string} pkgRoot
 * @returns {{ ok: true, path: string, platformKey: string, binaryName: string, source: "optionalDependency" | "bundled-prebuild", packageName: string | null } | { ok: false, path: string, platformKey: string, binaryName: string, source: "missing", packageName: string | null }}
 */
export function resolveNativeBackendPath(pkgRoot) {
  const bundled = getNativeBackendPath(pkgRoot);

  if (bundled.packageName) {
    try {
      const packageJsonPath = require.resolve(`${bundled.packageName}/package.json`, {
        paths: [pkgRoot]
      });
      const installedPath = join(dirname(packageJsonPath), "bin", bundled.binaryName);
      if (existsSync(installedPath)) {
        return {
          ok: true,
          path: installedPath,
          platformKey: bundled.platformKey,
          binaryName: bundled.binaryName,
          source: "optionalDependency",
          packageName: bundled.packageName
        };
      }
    } catch {
      // fall through to bundled fallback
    }
  }

  if (existsSync(bundled.path)) {
    return {
      ok: true,
      path: bundled.path,
      platformKey: bundled.platformKey,
      binaryName: bundled.binaryName,
      source: "bundled-prebuild",
      packageName: bundled.packageName
    };
  }

  return {
    ok: false,
    path: bundled.path,
    platformKey: bundled.platformKey,
    binaryName: bundled.binaryName,
    source: "missing",
    packageName: bundled.packageName
  };
}

/**
 * @param {string} pkgRoot
 * @returns {{ path: string, platformKey: string, binaryName: string, packageName: string | null }}
 */
export function getNativeDocumentEnginePath(pkgRoot) {
  const { platformKey, documentBinaryName, packageName } = getTargetMetadata();
  return {
    path: join(pkgRoot, "prebuilds", platformKey, documentBinaryName),
    platformKey,
    binaryName: documentBinaryName,
    packageName
  };
}

/**
 * Same resolution order as the backend: optionalDependency bin/ first, then prebuilds/.
 * Override: GHOSTCRAB_DOCUMENT_ENGINE=/absolute/path/to/ghostcrab-document
 *
 * @param {string} pkgRoot
 * @returns {{ ok: true, path: string, platformKey: string, binaryName: string, source: "env" | "optionalDependency" | "bundled-prebuild" | "vendor-dev", packageName: string | null } | { ok: false, path: string, platformKey: string, binaryName: string, source: "missing", packageName: string | null }}
 */
export function resolveDocumentEnginePath(pkgRoot) {
  const override = process.env.GHOSTCRAB_DOCUMENT_ENGINE?.trim();
  if (override) {
    const { platformKey, documentBinaryName, packageName } = getTargetMetadata();
    if (existsSync(override)) {
      return {
        ok: true,
        path: override,
        platformKey,
        binaryName: documentBinaryName,
        source: "env",
        packageName
      };
    }
  }

  const bundled = getNativeDocumentEnginePath(pkgRoot);

  if (bundled.packageName) {
    try {
      const packageJsonPath = require.resolve(`${bundled.packageName}/package.json`, {
        paths: [pkgRoot]
      });
      const installedPath = join(dirname(packageJsonPath), "bin", bundled.binaryName);
      if (existsSync(installedPath)) {
        return {
          ok: true,
          path: installedPath,
          platformKey: bundled.platformKey,
          binaryName: bundled.binaryName,
          source: "optionalDependency",
          packageName: bundled.packageName
        };
      }
    } catch {
      // fall through
    }
  }

  if (existsSync(bundled.path)) {
    return {
      ok: true,
      path: bundled.path,
      platformKey: bundled.platformKey,
      binaryName: bundled.binaryName,
      source: "bundled-prebuild",
      packageName: bundled.packageName
    };
  }

  const devVendor =
    process.platform === "win32"
      ? join(pkgRoot, "vendor", "mindbrain", "zig-out", "bin", "mindbrain-standalone-tool.exe")
      : join(pkgRoot, "vendor", "mindbrain", "zig-out", "bin", "mindbrain-standalone-tool");
  if (existsSync(devVendor)) {
    return {
      ok: true,
      path: devVendor,
      platformKey: bundled.platformKey,
      binaryName: bundled.binaryName,
      source: "vendor-dev",
      packageName: bundled.packageName
    };
  }

  const devCmd = join(
    pkgRoot,
    "cmd",
    "backend",
    "zig-out",
    "bin",
    process.platform === "win32" ? "ghostcrab-document.exe" : "ghostcrab-document"
  );
  if (existsSync(devCmd)) {
    return {
      ok: true,
      path: devCmd,
      platformKey: bundled.platformKey,
      binaryName: bundled.binaryName,
      source: "vendor-dev",
      packageName: bundled.packageName
    };
  }

  return {
    ok: false,
    path: bundled.path,
    platformKey: bundled.platformKey,
    binaryName: bundled.binaryName,
    source: "missing",
    packageName: bundled.packageName
  };
}

/**
 * @param {string} targetPath
 * @returns {{ ok: true, changed: boolean } | { ok: false, error: Error }}
 */
export function ensureUnixExecuteBit(targetPath) {
  if (process.platform === "win32") {
    return { ok: true, changed: false };
  }
  try {
    const mode = statSync(targetPath).mode;
    if ((mode & 0o111) === 0) {
      chmodSync(targetPath, 0o755);
      return { ok: true, changed: true };
    }
    return { ok: true, changed: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * @param {string} targetPath
 * @returns {{ ok: true, stripped?: boolean, skipped?: boolean } | { ok: false, error: string }}
 */
export function tryStripDarwinQuarantine(targetPath) {
  if (process.platform !== "darwin") {
    return { ok: true, skipped: true };
  }
  const r = spawnSync("xattr", ["-d", "com.apple.quarantine", targetPath], {
    encoding: "utf8"
  });
  if (r.status === 0) {
    return { ok: true, stripped: true };
  }
  const msg = (r.stderr || r.stdout || "").trim();
  if (/no such xattr|not supported/i.test(msg)) {
    return { ok: true, skipped: true };
  }
  return { ok: false, error: msg || `xattr exited ${r.status}` };
}

/**
 * @param {string} binPath
 * @returns {void}
 */
export function ensureBackendExecutableForServe(binPath) {
  const r = ensureUnixExecuteBit(binPath);
  if (r.ok) {
    return;
  }
  process.stderr.write(
    `[ghostcrab] Cannot access backend binary ${binPath}: ${r.error?.message}\n`
  );
  process.exit(1);
}

/**
 * @param {string} pkgRoot
 * @param {{ verbose?: boolean, silent?: boolean, tryQuarantine?: boolean, softFail?: boolean, ignorePostinstallEnv?: boolean }} o
 * @returns {object}
 */
export function preparePrebuildForInstall(pkgRoot, o = {}) {
  if (!o.ignorePostinstallEnv && process.env.GHOSTCRAB_SKIP_POSTINSTALL === "1") {
    return { ok: true, skipped: "GHOSTCRAB_SKIP_POSTINSTALL" };
  }

  const { verbose = false, silent = false, tryQuarantine = true, softFail = false } = o;
  const resolved = resolveNativeBackendPath(pkgRoot);
  const { path: binPath, platformKey, packageName } = resolved;

  if (!resolved.ok) {
    if (verbose) {
      const sourceHint = packageName
        ? `  Expected optional dependency: ${packageName}\n`
        : "";
      console.log(
        `[ghostcrab] No native backend available for this machine (${platformKey}).\n` +
          sourceHint +
          `  Checked fallback path: ${binPath}\n` +
          `  (OK if you use a self-built backend.)`
      );
    }
    return {
      ok: true,
      missing: true,
      binPath,
      platformKey,
      packageName: resolved.packageName
    };
  }

  if (process.platform === "win32") {
    const docResolvedW = resolveDocumentEnginePath(pkgRoot);
    if (verbose) {
      console.log(
        `[ghostcrab] Windows (${platformKey}): using ${resolved.source}\n` +
          `  ${binPath}\n` +
          `  No chmod step. If SmartScreen blocks it, use "Unblock" in file properties.`
      );
      if (docResolvedW.ok) {
        console.log(
          `[ghostcrab] Document engine (${docResolvedW.source}): ${docResolvedW.path}`
        );
      }
    } else if (!silent) {
      console.log(
        `[ghostcrab] postinstall: backend ready (${resolved.source}) — ${binPath}`
      );
    }
    return {
      ok: true,
      platformKey,
      binPath,
      actions: [],
      source: resolved.source
    };
  }

  /** @type {string[]} */
  const actions = [];
  const ex = ensureUnixExecuteBit(binPath);
  if (!ex.ok) {
    const err = ex.error?.message ?? "chmod failed";
    if (!softFail) {
      const msg = `[ghostcrab] Could not set execute permission on ${binPath}: ${err}`;
      if (!silent) {
        console.error(msg);
        console.error(`  Run manually:  chmod +x "${binPath}"`);
      }
      return { ok: false, error: err, binPath, platformKey };
    }
    if (!silent) {
      console.error(
        `[ghostcrab] Could not set execute permission (non-fatal): ${err}\n` +
          `  Run:  chmod +x "${binPath}"\n` +
          `  Or:  gcp authorize`
      );
    }
    return {
      ok: true,
      platformKey,
      binPath,
      actions,
      warn: err,
      source: resolved.source
    };
  }
  if (ex.changed) {
    actions.push("chmod+x");
  }

  if (tryQuarantine && process.platform === "darwin") {
    const q = tryStripDarwinQuarantine(binPath);
    if (q.stripped) {
      actions.push("cleared-macos-quarantine");
    } else if (!q.ok) {
      if (verbose) {
        console.error(`[ghostcrab] (optional) xattr: ${q.error}`);
      }
    }
  }

  if (verbose) {
    const detail =
      actions.length > 0 ? actions.join(", ") : "already OK (execute + not quarantined or no xattr)";
    console.log(
      `[ghostcrab] Native backend for ${platformKey} (${resolved.source}) — ${detail}\n` +
        `  ${binPath}`
    );
  } else if (!silent) {
    const detail = actions.length > 0 ? ` (${actions.join(", ")})` : "";
    console.log(
      `[ghostcrab] postinstall: backend ready (${resolved.source})${detail}\n  ${binPath}`
    );
  }

  const docResolved = resolveDocumentEnginePath(pkgRoot);
  if (docResolved.ok) {
    const docEx = ensureUnixExecuteBit(docResolved.path);
    if (docEx.changed) {
      actions.push("document-chmod+x");
    } else if (!docEx.ok && !softFail && verbose) {
      console.error(
        `[ghostcrab] Document engine chmod: ${docEx.error?.message ?? docEx} (${docResolved.path})`
      );
    }
    if (tryQuarantine && process.platform === "darwin") {
      const dq = tryStripDarwinQuarantine(docResolved.path);
      if (dq.stripped) {
        actions.push("document-cleared-quarantine");
      }
    }
    if (verbose) {
      console.log(
        `[ghostcrab] Document engine for ${platformKey} (${docResolved.source}) — ${docResolved.path}`
      );
    }
  } else if (verbose) {
    console.log(
      `[ghostcrab] No document engine binary for ${platformKey} (optional until you run full prebuilds).\n` +
        `  Expected: ${docResolved.path}\n` +
        `  Or build:  cd cmd/backend && zig build document-tool`
    );
  }

  return { ok: true, binPath, platformKey, actions, source: resolved.source };
}
