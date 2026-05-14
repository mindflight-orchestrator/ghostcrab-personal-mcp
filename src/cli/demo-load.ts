import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveGhostcrabConfig } from "../config/env.js";
import { createDatabaseClient, type Queryable } from "../db/client.js";
import { resolveGraphEntityId, upsertGraphEntity } from "../db/graph.js";

type DemoSeedEntry =
  | DemoProfileEntry
  | DemoRememberEntry
  | DemoLearnNodeEntry
  | DemoLearnEdgeEntry
  | DemoProjectionEntry;

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

interface DemoLoadSummary {
  insertedEdges: number;
  insertedFacts: number;
  insertedNodes: number;
  insertedProjections: number;
  profileId: string;
  skipped: number;
}

function parseArgs(argv: string[]): {
  profileId: string;
  skillsRepoRoot: string;
  profileFile: string | null;
} {
  let profileId: string | null = null;
  let profileFile: string | null = null;
  let skillsRepoRoot = path.resolve(process.cwd(), "..", "ghostcrab-skills");

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
  }

  if (profileFile) {
    if (!existsSync(profileFile)) {
      throw new Error(`Demo profile file not found: ${profileFile}`);
    }
  } else if (!profileId) {
    throw new Error(
      "Usage: pnpm run demo:load -- --profile <profile-id> [--skills-repo-root <path>]\n" +
        "   or: pnpm run demo:load -- --profile-file <path.jsonl>"
    );
  }

  return {
    profileId: profileId ?? "",
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

function readProfileFile(skillsRepoRoot: string, profileId: string): DemoSeedEntry[] {
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
  queryable: Queryable,
  entry: DemoRememberEntry
): Promise<boolean> {
  const [existing] = await queryable.query<{ id: string }>(
    `
      SELECT id
      FROM mb_pragma.facets
      WHERE schema_id = $1
        AND content = $2
        AND facets_json = $3::jsonb
      LIMIT 1
    `,
    [entry.schema_id, entry.content, JSON.stringify(entry.facets)]
  );

  if (existing) {
    return false;
  }

  await queryable.query(
    `
      INSERT INTO mb_pragma.facets (schema_id, content, facets_json)
      VALUES ($1, $2, $3::jsonb)
    `,
    [entry.schema_id, entry.content, JSON.stringify(entry.facets)]
  );

  return true;
}

async function ensureNodeEntry(
  queryable: Queryable,
  entry: DemoLearnNodeEntry["node"]
): Promise<boolean> {
  const [existing] = await queryable.query<{ id: string }>(
    `
      SELECT id::text
      FROM graph.entity
      WHERE type = 'entity' AND name = $1
      LIMIT 1
    `,
    [entry.id]
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
      mastery: entry.mastery ?? null
    },
    schemaId: null
  });

  return true;
}

async function ensureNodePlaceholder(
  queryable: Queryable,
  nodeId: string
): Promise<void> {
  await upsertGraphEntity(queryable, {
    nodeId,
    nodeType: "unknown",
    label: nodeId,
    properties: {},
    schemaId: null
  });
}

async function ensureEdgeEntry(
  queryable: Queryable,
  entry: DemoLearnEdgeEntry["edge"]
): Promise<boolean> {
  const [existing] = await queryable.query<{ id: string }>(
    `
      SELECT r.id::text
      FROM graph.relation r
      JOIN graph.entity s ON s.id = r.source_id AND s.type = 'entity'
      JOIN graph.entity t ON t.id = r.target_id AND t.type = 'entity'
      WHERE s.name = $1
        AND t.name = $2
        AND r.type = $3
        AND r.deprecated_at IS NULL
      LIMIT 1
    `,
    [entry.source, entry.target, entry.label]
  );

  if (existing) {
    return false;
  }

  await ensureNodePlaceholder(queryable, entry.source);
  await ensureNodePlaceholder(queryable, entry.target);

  const sourceId = await resolveGraphEntityId(queryable, entry.source);
  const targetId = await resolveGraphEntityId(queryable, entry.target);

  if (sourceId === null || targetId === null) {
    return false;
  }

  await queryable.query(
    `
      INSERT INTO graph.relation (type, source_id, target_id, confidence, metadata)
      VALUES ($1, $2::bigint, $3::bigint, $4::real, $5::jsonb)
    `,
    [
      entry.label,
      sourceId.toString(),
      targetId.toString(),
      entry.weight ?? 1,
      JSON.stringify(entry.properties ?? {})
    ]
  );

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

async function loadDemoProfile(
  queryable: Queryable,
  entries: DemoSeedEntry[],
  profileId: string
): Promise<DemoLoadSummary> {
  const summary: DemoLoadSummary = {
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
        if (await ensureRememberEntry(queryable, entry)) {
          summary.insertedFacts += 1;
        } else {
          summary.skipped += 1;
        }
        break;
      case "learn_node":
        if (await ensureNodeEntry(queryable, entry.node)) {
          summary.insertedNodes += 1;
        } else {
          summary.skipped += 1;
        }
        break;
      case "learn_edge":
        if (await ensureEdgeEntry(queryable, entry.edge)) {
          summary.insertedEdges += 1;
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
        throw new Error(`Unsupported demo seed entry kind: ${(entry as { kind: string }).kind}`);
    }
  }

  return summary;
}

/** Load a portable demo profile into the configured MindBrain backend. */
export async function runDemoLoad(argv: string[]): Promise<void> {
  const { profileId, skillsRepoRoot, profileFile } = parseArgs(argv);
  const config = resolveGhostcrabConfig();
  const database = createDatabaseClient(config);

  try {
    const entries = profileFile
      ? readProfileEntriesFromFile(profileFile)
      : readProfileFile(skillsRepoRoot, profileId);

    const resolvedProfileId = profileFile
      ? inferProfileIdFromEntries(entries, profileFile)
      : profileId;

    console.error(
      `[ghostcrab] Loading demo profile ${resolvedProfileId} from ${profileFile ?? path.join(skillsRepoRoot, "shared", "demo-profiles", `${profileId}.jsonl`)} against ${config.mindbrainUrl}`
    );
    const summary = await database.transaction((queryable) =>
      loadDemoProfile(queryable, entries, resolvedProfileId)
    );

    console.error(
      `[ghostcrab] Demo load summary: profile=${summary.profileId}, facts=${summary.insertedFacts}, nodes=${summary.insertedNodes}, edges=${summary.insertedEdges}, projections=${summary.insertedProjections}, skipped=${summary.skipped}`
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
