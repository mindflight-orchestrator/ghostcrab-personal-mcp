import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveGhostcrabConfig, type GhostcrabConfig } from "../config/env.js";
import { createDatabaseClient, type Queryable } from "../db/client.js";
import {
  resolveGraphEntityId,
  upsertGraphEntity,
  upsertGraphRelation
} from "../db/graph.js";
import { runStandaloneFactWrite } from "../db/standalone-mindbrain.js";

type DemoSeedEntry =
  | DemoProfileEntry
  | DemoRememberEntry
  | DemoLearnNodeEntry
  | DemoLearnEdgeEntry
  | DemoAnswerArtifactEntry
  | DemoProjectionEntry;

const ANSWER_ARTIFACT_KINDS = [
  "analysis_plan",
  "live_answer_view",
  "answer_snapshot",
  "evidence_pack"
] as const;

type AnswerArtifactKind = (typeof ANSWER_ARTIFACT_KINDS)[number];

const ANSWER_ARTIFACT_KIND_SET = new Set<string>(ANSWER_ARTIFACT_KINDS);

interface DemoProfileEntry {
  description: string;
  kind: "profile";
  profile_id: string;
  recommended_entrypoints: string[];
  tags: string[];
  title: string;
}

interface DemoRememberEntry {
  content: string;
  facets: Record<string, unknown>;
  kind: "remember";
  profile_id: string;
  schema_id: string;
}

interface DemoLearnNodeEntry {
  kind: "learn_node";
  node: {
    id: string;
    label: string;
    mastery?: number;
    node_type: string;
    properties?: Record<string, unknown>;
  };
  profile_id: string;
}

interface DemoLearnEdgeEntry {
  edge: {
    label: string;
    properties?: Record<string, unknown>;
    source: string;
    target: string;
    weight?: number;
  };
  kind: "learn_edge";
  profile_id: string;
}

interface DemoProjectionEntry {
  kind: "projection";
  profile_id: string;
  projection: {
    agent_id: string;
    content: string;
    proj_type: string;
    scope: string;
    status: string;
    weight?: number;
  };
}

interface DemoAnswerArtifactEntry {
  artifact: {
    agent_id?: string | null;
    artifact_id: string;
    artifact_kind: AnswerArtifactKind;
    current_version?: number;
    lifecycle: string;
    legacy_ref?: string | null;
    payload?: Record<string, unknown>;
    payload_json?: string;
    public_label: string;
    public_label_key?: string | null;
    scope?: string | null;
    slug: string;
    state: string;
    workspace_id?: string | null;
  };
  kind: "answer_artifact";
  profile_id: string;
}

interface DemoLoadSummary {
  insertedArtifacts: number;
  insertedEdges: number;
  insertedFacts: number;
  insertedNodes: number;
  insertedProjections: number;
  profileId: string;
  skipped: number;
}

function parseArgs(argv: string[]): {
  profileId: string;
  workspaceId: string | null;
  skillsRepoRoot: string;
  profileFile: string | null;
} {
  let profileId: string | null = null;
  let profileFile: string | null = null;
  let skillsRepoRoot = path.resolve(process.cwd(), "..", "ghostcrab-skills");
  let workspaceId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--profile") {
      profileId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--profile-file") {
      profileFile = path.resolve(argv[index + 1] ?? "");
      index += 1;
      continue;
    }

    if (arg === "--skills-repo-root") {
      skillsRepoRoot = path.resolve(argv[index + 1] ?? skillsRepoRoot);
      index += 1;
      continue;
    }
    if (arg === "--workspace" || arg === "-w") {
      workspaceId = argv[index + 1] ?? null;
      if (!workspaceId) {
        throw new Error("Demo load --workspace requires an id.");
      }
      index += 1;
      continue;
    }
  }

  if (profileFile) {
    if (!existsSync(profileFile)) {
      throw new Error(`Demo profile file not found: ${profileFile}`);
    }
  } else if (!profileId) {
    throw new Error(
      "Usage: pnpm run demo:load -- --profile <profile-id> [--skills-repo-root <path>]\n" +
        "   or: pnpm run demo:load -- --profile-file <path.jsonl>\n" +
        "Optional: --workspace <id> to force all imported facts/nodes/edges into that workspace"
    );
  }

  return {
    profileId: profileId ?? "",
    workspaceId,
    skillsRepoRoot,
    profileFile
  };
}

function readProfileEntriesFromFile(profilePath: string): DemoSeedEntry[] {
  return readFileSync(profilePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DemoSeedEntry);
}

function readProfileFile(
  skillsRepoRoot: string,
  profileId: string
): DemoSeedEntry[] {
  const profilePath = path.join(
    skillsRepoRoot,
    "shared",
    "demo-profiles",
    `${profileId}.jsonl`
  );

  if (!existsSync(profilePath)) {
    throw new Error(`Demo profile not found: ${profilePath}`);
  }

  return readProfileEntriesFromFile(profilePath);
}

function inferProfileIdFromEntries(
  entries: DemoSeedEntry[],
  profileFile: string
): string {
  for (const entry of entries) {
    if (entry.kind === "profile") {
      return entry.profile_id;
    }
  }
  return path.basename(profileFile, path.extname(profileFile));
}

async function ensureRememberEntry(
  config: GhostcrabConfig,
  queryable: Queryable,
  workspaceId: string,
  entry: DemoRememberEntry
): Promise<boolean> {
  const [existing] = await queryable.query<{ id: string }>(
    `
      SELECT id
      FROM mb_pragma.agent_facts
      WHERE schema_id = $1
        AND content = $2
        AND facets_json = $3::jsonb
        AND (
          workspace_id = $4 OR (workspace_id IS NULL AND $4 IS NULL)
        )
      LIMIT 1
    `,
    [
      entry.schema_id,
      entry.content,
      JSON.stringify(entry.facets),
      workspaceId
    ]
  );

  if (existing) {
    return false;
  }

  const result = await runStandaloneFactWrite({
    mindbrainUrl: config.mindbrainUrl,
    timeoutMs: config.mindbrainHttpTimeoutMs,
    schemaId: entry.schema_id,
    content: entry.content,
    facetsJson: JSON.stringify(entry.facets),
    workspaceId
  });

  return result.created || result.updated;
}

function assertAnswerArtifactKind(kind: unknown): AnswerArtifactKind {
  if (typeof kind === "string" && ANSWER_ARTIFACT_KIND_SET.has(kind)) {
    return kind as AnswerArtifactKind;
  }

  throw new Error(
    `Invalid answer_artifact artifact_kind "${String(kind)}". Allowed: ${ANSWER_ARTIFACT_KINDS.join(", ")}`
  );
}

function normalizeNullableString(
  value: string | null | undefined
): string | null {
  return value === undefined ? null : value;
}

function normalizePayloadJson(
  entry: DemoAnswerArtifactEntry["artifact"]
): string {
  if (entry.payload !== undefined && entry.payload_json !== undefined) {
    throw new Error(
      "answer_artifact must set either payload or payload_json, not both."
    );
  }

  if (entry.payload_json !== undefined) {
    JSON.parse(entry.payload_json);
    return entry.payload_json;
  }

  return JSON.stringify(entry.payload ?? {});
}

export function normalizeAnswerArtifactEntry(
  entry: DemoAnswerArtifactEntry["artifact"]
): {
  agent_id: string | null;
  artifact_id: string;
  artifact_kind: AnswerArtifactKind;
  current_version: number;
  lifecycle: string;
  legacy_ref: string | null;
  payload_json: string;
  public_label: string;
  public_label_key: string | null;
  scope: string | null;
  slug: string;
  state: string;
  workspace_id: string | null;
} {
  const artifactKind = assertAnswerArtifactKind(entry.artifact_kind);
  const workspaceId = normalizeNullableString(entry.workspace_id);
  const agentId = normalizeNullableString(entry.agent_id);
  const scope = normalizeNullableString(entry.scope);
  const payloadJson = normalizePayloadJson(entry);
  const currentVersion = entry.current_version ?? 1;

  for (const [field, value] of [
    ["artifact_id", entry.artifact_id],
    ["slug", entry.slug],
    ["public_label", entry.public_label],
    ["lifecycle", entry.lifecycle],
    ["state", entry.state]
  ] as const) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`answer_artifact ${field} must be a non-empty string.`);
    }
  }

  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error(
      "answer_artifact current_version must be a positive integer."
    );
  }

  if (artifactKind === "analysis_plan") {
    if (workspaceId !== null || !agentId || !scope) {
      throw new Error(
        "answer_artifact analysis_plan requires agent_id and scope, and must not set workspace_id."
      );
    }
  } else if (
    artifactKind === "live_answer_view" ||
    artifactKind === "answer_snapshot"
  ) {
    if (!workspaceId) {
      throw new Error(`answer_artifact ${artifactKind} requires workspace_id.`);
    }
  } else if (artifactKind === "evidence_pack") {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (
      typeof parsed.parent_artifact_id !== "string" ||
      parsed.parent_artifact_id.trim() === ""
    ) {
      throw new Error(
        "answer_artifact evidence_pack requires payload.parent_artifact_id."
      );
    }
  }

  return {
    agent_id: agentId,
    artifact_id: entry.artifact_id,
    artifact_kind: artifactKind,
    current_version: currentVersion,
    lifecycle: entry.lifecycle,
    legacy_ref: normalizeNullableString(entry.legacy_ref),
    payload_json: payloadJson,
    public_label: entry.public_label,
    public_label_key: normalizeNullableString(entry.public_label_key),
    scope,
    slug: entry.slug,
    state: entry.state,
    workspace_id: workspaceId
  };
}

async function ensureAnswerArtifactEntry(
  queryable: Queryable,
  entry: DemoAnswerArtifactEntry["artifact"]
): Promise<boolean> {
  const artifact = normalizeAnswerArtifactEntry(entry);
  const [existing] = await queryable.query<{ artifact_id: string }>(
    `
      SELECT artifact_id
      FROM mindbrain_answer_artifacts
      WHERE artifact_id = $1
      LIMIT 1
    `,
    [artifact.artifact_id]
  );

  if (existing) {
    return false;
  }

  await queryable.query(
    `
      INSERT INTO mindbrain_answer_artifacts (
        artifact_id,
        slug,
        workspace_id,
        agent_id,
        scope,
        artifact_kind,
        public_label_key,
        public_label,
        lifecycle,
        state,
        current_version,
        payload_json,
        legacy_ref
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      artifact.artifact_id,
      artifact.slug,
      artifact.workspace_id,
      artifact.agent_id,
      artifact.scope,
      artifact.artifact_kind,
      artifact.public_label_key,
      artifact.public_label,
      artifact.lifecycle,
      artifact.state,
      artifact.current_version,
      artifact.payload_json,
      artifact.legacy_ref
    ]
  );

  return true;
}

async function ensureNodeEntry(
  queryable: Queryable,
  workspaceId: string,
  entry: DemoLearnNodeEntry["node"]
): Promise<boolean> {
  const [existing] = await queryable.query<{ entity_id: number }>(
    `
      SELECT entity_id
      FROM graph_entity
      WHERE workspace_id = $1
        AND entity_type = 'entity'
        AND name = $2
      LIMIT 1
    `,
    [workspaceId, entry.id]
  );

  if (existing) {
    return false;
  }

  await upsertGraphEntity(queryable, {
    nodeId: entry.id,
    nodeType: entry.node_type,
    label: entry.label,
    properties: {
      ...(entry.properties ?? {}),
      mastery: entry.mastery ?? null,
      workspace_id: workspaceId
    },
    schemaId: null,
    workspaceId
  });

  return true;
}

async function ensureNodePlaceholder(
  queryable: Queryable,
  workspaceId: string,
  nodeId: string
): Promise<void> {
  await upsertGraphEntity(queryable, {
    nodeId,
    nodeType: "unknown",
    label: nodeId,
    properties: { workspace_id: workspaceId },
    schemaId: null,
    workspaceId
  });
}

async function ensureEdgeEntry(
  queryable: Queryable,
  workspaceId: string,
  entry: DemoLearnEdgeEntry["edge"]
): Promise<boolean> {
  const [existing] = await queryable.query<{ relation_id: number }>(
    `
      SELECT r.relation_id
      FROM graph_relation r
      JOIN graph_entity s ON s.entity_id = r.source_id
      JOIN graph_entity t ON t.entity_id = r.target_id
      WHERE s.workspace_id = $1
        AND t.workspace_id = $1
        AND s.name = $2
        AND t.name = $3
        AND r.relation_type = $4
        AND r.deprecated_at IS NULL
      LIMIT 1
    `,
    [workspaceId, entry.source, entry.target, entry.label]
  );

  if (existing) {
    return false;
  }

  await ensureNodePlaceholder(queryable, workspaceId, entry.source);
  await ensureNodePlaceholder(queryable, workspaceId, entry.target);

  const sourceId = await resolveGraphEntityId(
    queryable,
    entry.source,
    workspaceId
  );
  const targetId = await resolveGraphEntityId(
    queryable,
    entry.target,
    workspaceId
  );

  if (sourceId === null || targetId === null) {
    return false;
  }

  await upsertGraphRelation(queryable, {
    label: entry.label,
    sourceId,
    targetId,
    confidence: entry.weight ?? 1,
    properties: {
      ...(entry.properties ?? {}),
      workspace_id: workspaceId
    },
    workspaceId
  });

  return true;
}

async function ensureProjectionEntry(
  queryable: Queryable,
  entry: DemoProjectionEntry["projection"]
): Promise<boolean> {
  const [existing] = await queryable.query<{ id: string }>(
    `
      SELECT id
      FROM mb_pragma.projections
      WHERE agent_id = $1
        AND proj_type = $2
        AND content = $3
      LIMIT 1
    `,
    [entry.agent_id, entry.proj_type, entry.content]
  );

  if (existing) {
    return false;
  }

  await queryable.query(
    `
      INSERT INTO mb_pragma.projections (
        agent_id,
        scope,
        proj_type,
        content,
        weight,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      entry.agent_id,
      entry.scope,
      entry.proj_type,
      entry.content,
      entry.weight ?? 0.5,
      entry.status
    ]
  );

  return true;
}

export async function loadDemoProfile(
  config: GhostcrabConfig,
  queryable: Queryable,
  entries: DemoSeedEntry[],
  profileId: string,
  targetWorkspaceId?: string | null
): Promise<DemoLoadSummary> {
  const workspaceId = targetWorkspaceId || profileId;
  const summary: DemoLoadSummary = {
    insertedArtifacts: 0,
    insertedEdges: 0,
    insertedFacts: 0,
    insertedNodes: 0,
    insertedProjections: 0,
    profileId,
    skipped: 0
  };

  for (const entry of entries) {
    switch (entry.kind) {
      case "profile":
        break;
      case "remember":
        if (await ensureRememberEntry(config, queryable, workspaceId, entry)) {
          summary.insertedFacts += 1;
        } else {
          summary.skipped += 1;
        }
        break;
      case "learn_node":
        if (await ensureNodeEntry(queryable, workspaceId, entry.node)) {
          summary.insertedNodes += 1;
        } else {
          summary.skipped += 1;
        }
        break;
      case "learn_edge":
        if (await ensureEdgeEntry(queryable, workspaceId, entry.edge)) {
          summary.insertedEdges += 1;
        } else {
          summary.skipped += 1;
        }
        break;
      case "answer_artifact":
        if (await ensureAnswerArtifactEntry(queryable, entry.artifact)) {
          summary.insertedArtifacts += 1;
        } else {
          summary.skipped += 1;
        }
        break;
      case "projection":
        if (await ensureProjectionEntry(queryable, entry.projection)) {
          summary.insertedProjections += 1;
        } else {
          summary.skipped += 1;
        }
        break;
      default:
        throw new Error(
          `Unsupported demo seed entry kind: ${(entry as { kind: string }).kind}`
        );
    }
  }

  return summary;
}

/** Load a portable demo profile into the configured MindBrain backend. */
export async function runDemoLoad(argv: string[]): Promise<void> {
  const { profileId, skillsRepoRoot, profileFile, workspaceId } = parseArgs(argv);
  const config = resolveGhostcrabConfig();
  const database = createDatabaseClient(config);

  try {
    const entries = profileFile
      ? readProfileEntriesFromFile(profileFile)
      : readProfileFile(skillsRepoRoot, profileId);

    const resolvedProfileId = profileFile
      ? inferProfileIdFromEntries(entries, profileFile)
      : profileId;
    const resolvedWorkspaceId = workspaceId || resolvedProfileId;

    console.error(
      `[ghostcrab] Loading demo profile ${resolvedProfileId} into workspace ${resolvedWorkspaceId} from ${profileFile ?? path.join(skillsRepoRoot, "shared", "demo-profiles", `${profileId}.jsonl`)} against ${config.mindbrainUrl}`
    );
    const summary = await database.transaction((queryable) =>
      loadDemoProfile(config, queryable, entries, resolvedProfileId, resolvedWorkspaceId)
    );

    console.error(
      `[ghostcrab] Demo load summary: profile=${summary.profileId}, facts=${summary.insertedFacts}, nodes=${summary.insertedNodes}, edges=${summary.insertedEdges}, artifacts=${summary.insertedArtifacts}, projections=${summary.insertedProjections}, skipped=${summary.skipped}`
    );
  } finally {
    await database.close();
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void runDemoLoad(process.argv.slice(2)).catch((error) => {
    console.error(
      `[ghostcrab] Demo load failure: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
