import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const STANDALONE_TOOL_NAME = "mindbrain-standalone-tool";

let ensuredToolPathPromise: Promise<string> | null = null;

export interface StandaloneTraverseParams {
  sqlitePath: string;
  start: string;
  direction: "outbound" | "inbound";
  edgeLabels: string[];
  depth: number;
  target?: string;
}

export interface StandaloneTraverseRow {
  node_id: string;
  node_label: string;
  node_type: string;
  metadata_json: string;
  edge_label: string | null;
  depth: number;
  path: string[];
}

export interface StandaloneTraverseResult {
  target_found: boolean;
  rows: StandaloneTraverseRow[];
}

export async function runStandaloneTraverse(
  params: StandaloneTraverseParams
): Promise<StandaloneTraverseResult> {
  const toolPath = await ensureStandaloneToolPath();
  const args = [
    "traverse",
    "--db",
    params.sqlitePath,
    "--start",
    params.start,
    "--direction",
    params.direction,
    "--depth",
    String(params.depth)
  ];

  for (const edgeLabel of params.edgeLabels) {
    args.push("--edge-label", edgeLabel);
  }

  if (params.target) {
    args.push("--target", params.target);
  }

  const { stdout, stderr } = await execFileAsync(toolPath, args, {
    cwd: path.dirname(toolPath),
    env: process.env,
    maxBuffer: 8 * 1024 * 1024
  });

  try {
    return JSON.parse(stdout) as StandaloneTraverseResult;
  } catch (error) {
    throw new Error(
      `Failed to parse standalone traverse output: ${
        error instanceof Error ? error.message : String(error)
      }${stderr ? `\n${stderr}` : ""}`
    );
  }
}

async function ensureStandaloneToolPath(): Promise<string> {
  if (ensuredToolPathPromise) {
    return ensuredToolPathPromise;
  }

  ensuredToolPathPromise = (async () => {
    const repoPath = resolveMindbrainRepoPath();
    const toolPath = path.join(repoPath, "zig-out", "bin", STANDALONE_TOOL_NAME);

    try {
      await access(toolPath, constants.X_OK);
      return toolPath;
    } catch {
      await execFileAsync("zig", ["build", "standalone-tool"], {
        cwd: repoPath,
        env: process.env,
        maxBuffer: 8 * 1024 * 1024
      });
      await access(toolPath, constants.X_OK);
      return toolPath;
    }
  })();

  return ensuredToolPathPromise;
}

function resolveMindbrainRepoPath(): string {
  const configuredPath = process.env.GHOSTCRAB_MINDBRAIN_PATH;
  if (configuredPath && configuredPath.trim().length > 0) {
    return path.resolve(configuredPath);
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const ghostcrabRepoRoot = path.resolve(path.dirname(currentFilePath), "../..");
  return path.resolve(ghostcrabRepoRoot, "../mindbrain");
}
