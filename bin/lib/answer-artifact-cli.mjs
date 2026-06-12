/**
 * Answer artifact registry — shared CLI helpers (gcp brain artifact).
 * Backend contract: vendor/mindbrain/docs/artifacts/artifact-model.md
 */

/** @typedef {"analysis_plan"|"live_answer_view"|"answer_snapshot"|"evidence_pack"} AnswerArtifactKind */

export const ANSWER_ARTIFACT_KINDS = /** @type {const} */ ([
  "analysis_plan",
  "live_answer_view",
  "answer_snapshot",
  "evidence_pack"
]);

export const ANSWER_ARTIFACT_KIND_SET = new Set(ANSWER_ARTIFACT_KINDS);

/**
 * @param {unknown} kind
 * @returns {kind is AnswerArtifactKind}
 */
export function isAnswerArtifactKind(kind) {
  return typeof kind === "string" && ANSWER_ARTIFACT_KIND_SET.has(kind);
}

/**
 * @param {unknown} kind
 * @returns {AnswerArtifactKind}
 */
export function assertAnswerArtifactKind(kind) {
  if (!isAnswerArtifactKind(kind)) {
    throw new Error(
      `Invalid artifact_kind "${String(kind)}". Allowed: ${ANSWER_ARTIFACT_KINDS.join(", ")}`
    );
  }
  return kind;
}

/**
 * @param {{ workspaceId?: string | null; kind?: string | null; agentId?: string | null; scope?: string | null; limit?: number }} filters
 * @returns {{ sql: string; params: unknown[] }}
 */
export function buildListArtifactsQuery(filters = {}) {
  const clauses = ["1 = 1"];
  const params = [];

  if (filters.workspaceId) {
    clauses.push("(workspace_id = ? OR scope = ?)");
    params.push(filters.workspaceId, filters.workspaceId);
  }
  if (filters.kind) {
    assertAnswerArtifactKind(filters.kind);
    clauses.push("artifact_kind = ?");
    params.push(filters.kind);
  }
  if (filters.agentId) {
    clauses.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.scope) {
    clauses.push("scope = ?");
    params.push(filters.scope);
  }

  const limit =
    typeof filters.limit === "number" && filters.limit > 0
      ? Math.min(filters.limit, 500)
      : 100;

  const sql = `
    SELECT artifact_id, slug, workspace_id, agent_id, scope, artifact_kind,
           public_label, lifecycle, state, current_version, legacy_ref
    FROM mindbrain_answer_artifacts
    WHERE ${clauses.join(" AND ")}
    ORDER BY artifact_kind, artifact_id
    LIMIT ${limit}
  `.trim();

  return { sql, params };
}

/**
 * Map MindBrain SQL API rows (column order from buildListArtifactsQuery) to objects.
 * @param {string[]} columns
 * @param {unknown[][]} rows
 */
export function mapListArtifactRows(columns, rows) {
  const index = Object.fromEntries(columns.map((name, i) => [name, i]));
  return rows.map((row) => {
    const kind = row[index.artifact_kind];
    assertAnswerArtifactKind(kind);
    return {
      artifact_id: String(row[index.artifact_id] ?? ""),
      slug: String(row[index.slug] ?? ""),
      workspace_id: row[index.workspace_id] ?? null,
      agent_id: row[index.agent_id] ?? null,
      scope: row[index.scope] ?? null,
      artifact_kind: kind,
      public_label: String(row[index.public_label] ?? ""),
      lifecycle: String(row[index.lifecycle] ?? ""),
      state: String(row[index.state] ?? ""),
      current_version: Number(row[index.current_version] ?? 0),
      legacy_ref: row[index.legacy_ref] ?? null
    };
  });
}

/**
 * @param {string[]} args
 * @returns {{
 *   subcommand?: string;
 *   rest?: string[];
 *   workspaceId?: string | null;
 *   workspaceName?: string | null;
 *   sqlitePathFromCli?: string | null;
 *   kind?: string | null;
 *   agentId?: string | null;
 *   scope?: string | null;
 *   limit?: number;
 *   dryRun?: boolean;
 *   repair?: boolean;
 *   force?: boolean;
 *   mindbrainUrl?: string | null;
 *   artifactId?: string | null;
 *   includeLatestEvent?: boolean;
 *   error?: string;
 * }}
 */
export function parseArtifactArgs(args) {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { subcommand: "__help__" };
  }

  const subcommand = args[0];
  const rest = args.slice(1);

  /** @type {ReturnType<typeof parseArtifactArgs>} */
  const parsed = {
    subcommand,
    rest,
    workspaceId: null,
    workspaceName: null,
    sqlitePathFromCli: null,
    kind: null,
    agentId: null,
    scope: null,
    limit: 100,
    dryRun: false,
    repair: false,
    force: false,
    mindbrainUrl: null,
    artifactId: null,
    includeLatestEvent: true
  };

  const positional = [];

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--workspace-id") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --workspace-id requires a value." };
      parsed.workspaceId = rest[++i];
      continue;
    }
    if (a === "--workspace" || a === "-w") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --workspace requires a name." };
      parsed.workspaceName = rest[++i];
      continue;
    }
    if (a === "--db") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --db requires a path." };
      parsed.sqlitePathFromCli = rest[++i];
      continue;
    }
    if (a === "--kind") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --kind requires a value." };
      parsed.kind = rest[++i];
      continue;
    }
    if (a === "--agent-id") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --agent-id requires a value." };
      parsed.agentId = rest[++i];
      continue;
    }
    if (a === "--scope") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --scope requires a value." };
      parsed.scope = rest[++i];
      continue;
    }
    if (a === "--limit") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --limit requires a number." };
      const n = Number(rest[++i]);
      if (!Number.isFinite(n) || n < 1) {
        return { error: "gcp brain artifact: --limit must be a positive number." };
      }
      parsed.limit = n;
      continue;
    }
    if (a === "--url") {
      if (!rest[i + 1]) return { error: "gcp brain artifact: --url requires a MindBrain base URL." };
      parsed.mindbrainUrl = rest[++i].replace(/\/$/, "");
      continue;
    }
    if (a === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (a === "--repair") {
      parsed.repair = true;
      continue;
    }
    if (a === "--force") {
      parsed.force = true;
      continue;
    }
    if (a === "--no-event") {
      parsed.includeLatestEvent = false;
      continue;
    }
    if (a.startsWith("-")) {
      return { error: `gcp brain artifact: unknown flag "${a}".` };
    }
    positional.push(a);
  }

  if (subcommand === "get" || subcommand === "refresh" || subcommand === "events") {
    if (positional.length !== 1) {
      return {
        error: `gcp brain artifact ${subcommand}: requires exactly one <artifact_id>.`
      };
    }
    parsed.artifactId = positional[0];
  } else if (subcommand === "migrate") {
    if (positional.length > 0) {
      return { error: "gcp brain artifact migrate: does not take positional arguments." };
    }
    if (parsed.dryRun === parsed.repair) {
      return {
        error: "gcp brain artifact migrate: specify exactly one of --dry-run or --repair."
      };
    }
  } else if (subcommand === "list") {
    if (positional.length > 0) {
      return { error: "gcp brain artifact list: does not take positional arguments." };
    }
  } else {
    return { error: `gcp brain artifact: unknown subcommand "${subcommand}".` };
  }

  if (parsed.kind) {
    try {
      assertAnswerArtifactKind(parsed.kind);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return parsed;
}

/**
 * @param {string} sqlitePathResolved
 * @param {{ dryRun: boolean; repair: boolean }} mode
 */
export function buildArtifactMigrateEngineArgs(sqlitePathResolved, mode) {
  const args = ["artifact-migrate", "--db", sqlitePathResolved];
  if (mode.dryRun) args.push("--dry-run");
  if (mode.repair) args.push("--repair");
  return args;
}

/**
 * @param {string} baseUrl
 * @param {string} artifactId
 */
export function buildArtifactGetUrl(baseUrl, artifactId) {
  return new URL(
    `/api/mindbrain/ghostcrab/artifact/${encodeURIComponent(artifactId)}`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  );
}

/**
 * @param {string} baseUrl
 * @param {string} artifactId
 */
export function buildArtifactRefreshUrl(baseUrl, artifactId) {
  return new URL(
    `/api/mindbrain/ghostcrab/artifact/${encodeURIComponent(artifactId)}/refresh`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  );
}

/**
 * @param {string} baseUrl
 * @param {string} artifactId
 * @param {number | undefined} limit
 */
export function buildArtifactEventsUrl(baseUrl, artifactId, limit) {
  const url = new URL(
    `/api/mindbrain/ghostcrab/artifact/${encodeURIComponent(artifactId)}/events`,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  );
  if (typeof limit === "number" && limit > 0) {
    url.searchParams.set("limit", String(limit));
  }
  return url;
}

/**
 * Normalize backend events payload (`rows` or legacy `events`).
 * @param {Record<string, unknown>} body
 */
export function normalizeArtifactEventsBody(body) {
  const rows = Array.isArray(body.rows)
    ? body.rows
    : Array.isArray(body.events)
      ? body.events
      : [];
  return {
    artifact_id: body.artifact_id ?? null,
    event_kind: body.event_kind ?? "answer_update_event",
    count: rows.length,
    events: rows
  };
}

/**
 * @param {string} baseUrl
 * @param {{ sql: string; params: unknown[] }} query
 */
export function buildArtifactSqlRequest(baseUrl, query) {
  return {
    url: new URL("/api/mindbrain/sql", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`),
    body: { sql: query.sql, params: query.params }
  };
}
