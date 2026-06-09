/**
 * gcp brain artifact — answer artifact registry (operator / CI).
 *
 * list/get require a running MindBrain backend (HTTP).
 * migrate runs offline against the SQLite file (stop MCP first).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "../lib/cli-config.mjs";
import { resolveGhostcrabSqlite } from "../lib/resolve-ghostcrab-sqlite.mjs";
import { slugifyWorkspace } from "../lib/workspace-slug.mjs";
import {
  preflightBrainDatabaseOrExit,
  probeBackend,
  runNativeEngineOrExit
} from "../lib/brain-engine-runner.mjs";
import {
  buildArtifactEventsUrl,
  buildArtifactGetUrl,
  buildArtifactMigrateEngineArgs,
  buildArtifactRefreshUrl,
  buildListArtifactsQuery,
  mapListArtifactRows,
  normalizeArtifactEventsBody,
  parseArtifactArgs
} from "../lib/answer-artifact-cli.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdBrainArtifact(args) {
  const parsed = parseArtifactArgs(args);
  if (parsed.error) {
    console.error(`[ghostcrab] ${parsed.error}\n`);
    printArtifactHelp();
    process.exit(1);
  }
  if (parsed.subcommand === "__help__") {
    printArtifactHelp();
    return;
  }

  switch (parsed.subcommand) {
    case "list":
      await runArtifactList(parsed);
      break;
    case "get":
      await runArtifactGet(parsed);
      break;
    case "refresh":
      await runArtifactRefresh(parsed);
      break;
    case "events":
      await runArtifactEvents(parsed);
      break;
    case "migrate":
      await runArtifactMigrate(parsed);
      break;
    default:
      console.error(`[ghostcrab] gcp brain artifact: unknown subcommand.\n`);
      printArtifactHelp();
      process.exit(1);
  }
}

/**
 * @param {NonNullable<ReturnType<typeof parseArtifactArgs>>} parsed
 */
async function runArtifactList(parsed) {
  const workspaceId = resolveArtifactWorkspaceId(parsed);
  const baseUrl = await resolveMindbrainBaseUrl(parsed);
  const { sql, params } = buildListArtifactsQuery({
    workspaceId: workspaceId ?? undefined,
    kind: parsed.kind ?? undefined,
    agentId: parsed.agentId ?? undefined,
    scope: parsed.scope ?? undefined,
    limit: parsed.limit
  });

  const response = await postSql(baseUrl, sql, params);
  const artifacts = mapListArtifactRows(response.columns, response.rows);
  console.log(JSON.stringify({ ok: true, count: artifacts.length, artifacts }, null, 2));
}

/**
 * @param {NonNullable<ReturnType<typeof parseArtifactArgs>>} parsed
 */
async function runArtifactGet(parsed) {
  const baseUrl = await resolveMindbrainBaseUrl(parsed);
  const url = buildArtifactGetUrl(baseUrl, parsed.artifactId);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[ghostcrab] artifact get failed (${res.status}): ${text || res.statusText}`
    );
    process.exit(1);
  }
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

/**
 * @param {NonNullable<ReturnType<typeof parseArtifactArgs>>} parsed
 */
async function runArtifactRefresh(parsed) {
  const baseUrl = await resolveMindbrainBaseUrl(parsed);
  const url = buildArtifactRefreshUrl(baseUrl, parsed.artifactId);
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[ghostcrab] artifact refresh failed (${res.status}): ${text || res.statusText}`
    );
    process.exit(1);
  }
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

/**
 * @param {NonNullable<ReturnType<typeof parseArtifactArgs>>} parsed
 */
async function runArtifactEvents(parsed) {
  const baseUrl = await resolveMindbrainBaseUrl(parsed);
  const url = buildArtifactEventsUrl(baseUrl, parsed.artifactId, parsed.limit);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[ghostcrab] artifact events failed (${res.status}): ${text || res.statusText}`
    );
    process.exit(1);
  }
  const body = await res.json();
  console.log(JSON.stringify(normalizeArtifactEventsBody(body), null, 2));
}

/**
 * @param {NonNullable<ReturnType<typeof parseArtifactArgs>>} parsed
 */
async function runArtifactMigrate(parsed) {
  const { sqlitePathResolved } = resolveGhostcrabSqlite({
    workspaceNameFromCli: parsed.workspaceName,
    sqlitePathFromCli: parsed.sqlitePathFromCli
  });
  await preflightBrainDatabaseOrExit(sqlitePathResolved, parsed.force);

  const childArgs = buildArtifactMigrateEngineArgs(sqlitePathResolved, {
    dryRun: parsed.dryRun,
    repair: parsed.repair
  });
  runNativeEngineOrExit(pkgRoot, childArgs, { preferDev: true });
}

/**
 * @param {NonNullable<ReturnType<typeof parseArtifactArgs>>} parsed
 */
function resolveArtifactWorkspaceId(parsed) {
  if (parsed.workspaceId) return parsed.workspaceId;
  if (parsed.workspaceName) return slugifyWorkspace(parsed.workspaceName);
  const config = readConfig();
  if (config.defaultWorkspace) return config.defaultWorkspace;
  return null;
}

/**
 * @param {NonNullable<ReturnType<typeof parseArtifactArgs>>} parsed
 */
async function resolveMindbrainBaseUrl(parsed) {
  if (parsed.mindbrainUrl) return parsed.mindbrainUrl;
  const envUrl = process.env.GHOSTCRAB_MINDBRAIN_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");

  const { sqlitePathResolved } = resolveGhostcrabSqlite({
    workspaceNameFromCli: parsed.workspaceName,
    sqlitePathFromCli: parsed.sqlitePathFromCli
  });
  const backend = await probeBackend(sqlitePathResolved);
  if (!backend.alive || !backend.url) {
    console.error(
      "[ghostcrab] gcp brain artifact list/get/refresh/events requires a running MindBrain backend.\n" +
        "  Start: gcp brain up\n" +
        "  Or set GHOSTCRAB_MINDBRAIN_URL / pass --url http://127.0.0.1:8091"
    );
    process.exit(1);
  }
  return backend.url;
}

/**
 * @param {string} baseUrl
 * @param {string} sql
 * @param {unknown[]} params
 */
async function postSql(baseUrl, sql, params) {
  const url = new URL("/api/mindbrain/sql", `${baseUrl}/`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[ghostcrab] MindBrain SQL request failed (${res.status}): ${text || res.statusText}`
    );
    process.exit(1);
  }
  const body = await res.json();
  if (!body.ok) {
    console.error("[ghostcrab] MindBrain SQL error:", JSON.stringify(body));
    process.exit(1);
  }
  return body;
}

function artifactHelpText() {
  return `
Usage: gcp brain artifact <list|get|refresh|events|migrate> [options]

Answer artifact registry (analysis_plan, live_answer_view, answer_snapshot, evidence_pack).
Gap rules, diagnostics, and coverage reports are NOT answer artifacts.
Update history uses event_kind answer_update_event (not artifact_kind).

Subcommands:
  list [--workspace-id <id>] [--kind <kind>] [--agent-id <id>] [--scope <scope>] [--limit <n>]
       List registry rows (requires running backend; uses MindBrain SQL API).
  get <artifact_id> [--url <base>]
       Fetch one artifact by id (HTTP).
  refresh <artifact_id> [--url <base>]
       Explicitly refresh one live answer view. The id must be exact; shell
       globs/wildcards such as live_answer_view__foo_* are not supported.
  events <artifact_id> [--limit <n>] [--url <base>]
       List answer_update_event rows for an artifact (HTTP).
  migrate (--dry-run | --repair) [--db <path>] [--force]
       Backfill registry from legacy projections / ProjectionResult (offline; stop MCP first).

Options:
  --workspace, -w <name>   Workspace slug (list/migrate path resolution)
  --workspace-id <id>      Filter list or scope migrate context
  --db <path>              SQLite file (migrate; same as gcp brain up)
  --url <base>             MindBrain base URL for list/get/refresh/events
  --force                  Allow migrate while backend appears running (risky)

Examples:
  gcp brain artifact list --workspace-id default --kind analysis_plan
  gcp brain artifact get analysis_plan__pilotage_hebdo
  gcp brain artifact refresh live_answer_view__pilotage_hebdo
  gcp brain artifact events live_answer_view__pilotage_hebdo --limit 5
  gcp brain artifact list --workspace-id serenity --kind live_answer_view --limit 100
  gcp brain artifact migrate --dry-run --db data/ghostcrab.sqlite
  gcp brain artifact migrate --repair --db data/ghostcrab.sqlite

To refresh many live views, list exact ids first and call refresh once per id:
  gcp brain artifact list --workspace-id serenity --kind live_answer_view --limit 100 \\
    | jq -r '.artifacts[].artifact_id' \\
    | while read -r id; do gcp brain artifact refresh "$id"; done

The refresh route is POST. A 405 MethodNotAllowed usually means the running
MindBrain backend is stale after an upgrade or the URL was called with GET.
Restart the backend/MCP, then retry with one exact live_answer_view id.

Backup bundles include mindbrain_answer_artifacts and mindbrain_answer_events
when exporting a full workspace (gcp brain backup).
`.trim()
}

function printArtifactHelp() {
  console.log(artifactHelpText());
}

export const __private__ = {
  parseArtifactArgs,
  buildListArtifactsQuery,
  mapListArtifactRows,
  buildArtifactMigrateEngineArgs,
  buildArtifactGetUrl,
  buildArtifactRefreshUrl,
  buildArtifactEventsUrl,
  normalizeArtifactEventsBody,
  artifactHelpText,
  resolveArtifactWorkspaceId: resolveArtifactWorkspaceId
};
