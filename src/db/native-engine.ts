import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

interface NativeEngineResolution {
  ok: boolean;
  path: string;
  source:
    | "env"
    | "optionalDependency"
    | "bundled-prebuild"
    | "vendor-dev"
    | "missing";
  packageName: string | null;
  platformKey: string;
}

export interface NativeEngineRunResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  enginePath?: string;
  engineSource?: string;
}

const PREBUILD_PACKAGES: Record<string, string> = {
  "linux-x64": "@mindflight/ghostcrab-personal-mcp-linux-x64",
  "linux-arm64": "@mindflight/ghostcrab-personal-mcp-linux-arm64",
  "darwin-x64": "@mindflight/ghostcrab-personal-mcp-darwin-x64",
  "darwin-arm64": "@mindflight/ghostcrab-personal-mcp-darwin-arm64",
  "win32-x64": "@mindflight/ghostcrab-personal-mcp-win32-x64",
  "win32-arm64": "@mindflight/ghostcrab-personal-mcp-win32-arm64"
};

export function runNativeMindbrainEngine(
  childArgs: string[],
  options: { pkgRoot: string }
): NativeEngineRunResult {
  const resolved = resolveNativeMindbrainEngine(options.pkgRoot);
  if (!resolved.ok) {
    const hint = resolved.packageName
      ? ` Install optional package ${resolved.packageName} or run gcp authorize.`
      : " Set GHOSTCRAB_DOCUMENT_ENGINE to the native MindBrain tool.";
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: `ghostcrab-document engine binary not found for ${resolved.platformKey}.${hint}`
    };
  }

  const result = spawnSync(resolved.path, childArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env }
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    enginePath: resolved.path,
    engineSource: resolved.source
  };
}

function resolveNativeMindbrainEngine(pkgRoot: string): NativeEngineResolution {
  const platformKey = `${process.platform}-${process.arch}`;
  const binaryName =
    process.platform === "win32"
      ? "ghostcrab-document.exe"
      : "ghostcrab-document";
  const packageName = PREBUILD_PACKAGES[platformKey] ?? null;

  const override = process.env.GHOSTCRAB_DOCUMENT_ENGINE?.trim();
  if (override && existsSync(override)) {
    return {
      ok: true,
      path: override,
      source: "env",
      packageName,
      platformKey
    };
  }

  if (packageName) {
    try {
      const packageJsonPath = require.resolve(`${packageName}/package.json`, {
        paths: [pkgRoot]
      });
      const installedPath = join(dirname(packageJsonPath), "bin", binaryName);
      if (existsAndExecutable(installedPath)) {
        return {
          ok: true,
          path: installedPath,
          source: "optionalDependency",
          packageName,
          platformKey
        };
      }
    } catch {
      /* fall through */
    }
  }

  const bundledPath = join(pkgRoot, "prebuilds", platformKey, binaryName);
  if (existsAndExecutable(bundledPath)) {
    return {
      ok: true,
      path: bundledPath,
      source: "bundled-prebuild",
      packageName,
      platformKey
    };
  }

  const vendorDevPath = join(
    pkgRoot,
    "vendor",
    "mindbrain",
    "zig-out",
    "bin",
    process.platform === "win32"
      ? "mindbrain-standalone-tool.exe"
      : "mindbrain-standalone-tool"
  );
  if (existsAndExecutable(vendorDevPath)) {
    return {
      ok: true,
      path: vendorDevPath,
      source: "vendor-dev",
      packageName,
      platformKey
    };
  }

  const cmdDevPath = join(
    pkgRoot,
    "cmd",
    "backend",
    "zig-out",
    "bin",
    binaryName
  );
  if (existsAndExecutable(cmdDevPath)) {
    return {
      ok: true,
      path: cmdDevPath,
      source: "vendor-dev",
      packageName,
      platformKey
    };
  }

  return {
    ok: false,
    path: bundledPath,
    source: "missing",
    packageName,
    platformKey
  };
}

function existsAndExecutable(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  if (process.platform === "win32") {
    return true;
  }
  return (statSync(path).mode & 0o111) !== 0;
}
