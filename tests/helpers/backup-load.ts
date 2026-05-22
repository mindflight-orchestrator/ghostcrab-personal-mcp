import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function resolveNativeEnginePath(): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          join(
            PKG_ROOT,
            "vendor",
            "mindbrain",
            "zig-out",
            "bin",
            "mindbrain-standalone-tool.exe"
          ),
          join(
            PKG_ROOT,
            "cmd",
            "backend",
            "zig-out",
            "bin",
            "ghostcrab-document.exe"
          )
        ]
      : [
          join(
            PKG_ROOT,
            "vendor",
            "mindbrain",
            "zig-out",
            "bin",
            "mindbrain-standalone-tool"
          ),
          join(
            PKG_ROOT,
            "cmd",
            "backend",
            "zig-out",
            "bin",
            "ghostcrab-document"
          )
        ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export type BackupLoadResult = {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  enginePath: string | null;
};

export function spawnBackupLoad(options: {
  dbPath: string;
  bundlePath: string;
  reindex?: "none" | "graph" | "all";
  documentTableId?: number;
  collectionId?: string;
  tableId?: number;
  dryRun?: boolean;
}): BackupLoadResult {
  const enginePath = resolveNativeEnginePath();
  if (!enginePath) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: "native MindBrain engine binary not found",
      enginePath: null
    };
  }

  const args = [
    "backup-load",
    "--db",
    options.dbPath,
    "--bundle",
    options.bundlePath
  ];

  if (options.dryRun) {
    args.push("--dry-run");
  }
  if (options.reindex && options.reindex !== "none") {
    args.push("--reindex", options.reindex);
  }
  if (options.documentTableId !== undefined) {
    args.push("--document-table-id", String(options.documentTableId));
  }
  if (options.collectionId) {
    args.push("--collection-id", options.collectionId);
  }
  if (options.tableId !== undefined) {
    args.push("--table-id", String(options.tableId));
  }

  const result = spawnSync(enginePath, args, {
    encoding: "utf8",
    env: { ...process.env }
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    enginePath
  };
}
