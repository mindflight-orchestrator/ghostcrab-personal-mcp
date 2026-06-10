import { runNativeEngineSync } from "./brain-engine-runner.mjs";

/**
 * Register (idempotently) a logical MindBrain workspace_id row in the SQLite
 * registry so the MCP startup pin resolves instead of falling back to "default".
 *
 * The root cause of the "data disappears on restart" symptom was facts stored
 * under workspace_id = "<slug>" while the workspaces registry table only held
 * "default": resolveInitialSessionContext() could not find the row and pinned
 * "default". Calling this before backend/MCP start guarantees the row exists.
 *
 * @param {{
 *   pkgRoot: string;
 *   sqlitePath: string;
 *   workspaceId: string;
 *   label?: string | null;
 *   description?: string | null;
 *   profile?: string | null;
 *   quiet?: boolean;
 * }} opts
 */
export function registerMindbrainWorkspace(opts) {
  const args = [
    "workspace-create",
    "--db",
    opts.sqlitePath,
    "--workspace-id",
    opts.workspaceId,
    "--label",
    opts.label ?? opts.workspaceId
  ];
  if (opts.description) args.push("--description", opts.description);
  if (opts.profile) args.push("--profile", opts.profile);

  return runNativeEngineSync(opts.pkgRoot, args, { preferDev: true });
}

export function ensureMindbrainWorkspaceOrExit(opts) {
  const result = registerMindbrainWorkspace(opts);
  if (!result.ok) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.error(
      `[ghostcrab] failed to register MindBrain workspace '${opts.workspaceId}' in ${opts.sqlitePath}`
    );
    process.exit(result.status ?? 1);
  }
  if (!opts.quiet && result.stdout) {
    process.stdout.write(result.stdout);
  }
}

/**
 * Best-effort registration for the MCP startup path: never aborts `gcp brain up`.
 * If the native engine is missing or the command fails, log a warning and let the
 * MCP session pin fall back to "default" (prior behavior).
 *
 * @param {Parameters<typeof registerMindbrainWorkspace>[0]} opts
 * @returns {boolean} true when the workspace row is registered.
 */
export function tryRegisterMindbrainWorkspace(opts) {
  const result = registerMindbrainWorkspace(opts);
  if (!result.ok) {
    process.stderr.write(
      `[ghostcrab] WARNING: could not register workspace '${opts.workspaceId}' ` +
        `(${(result.stderr || "native engine unavailable").trim()}). ` +
        `The MCP session may fall back to the 'default' workspace.\n`
    );
    return false;
  }
  return true;
}
