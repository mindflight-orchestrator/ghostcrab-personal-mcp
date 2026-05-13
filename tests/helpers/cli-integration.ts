import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll } from "vitest";

import { resolveGhostcrabConfig } from "../../src/config/env.js";
import {
  type DatabaseClient,
  createDatabaseClient
} from "../../src/db/client.js";
import { createToolContext } from "./tool-context.js";
import { countTool } from "../../src/tools/facets/count.js";
import { rememberTool } from "../../src/tools/facets/remember.js";
import {
  schemaInspectTool,
  schemaListTool,
  schemaRegisterTool
} from "../../src/tools/facets/schema.js";
import { searchTool } from "../../src/tools/facets/search.js";
import { upsertTool } from "../../src/tools/facets/upsert.js";
import { coverageTool } from "../../src/tools/dgraph/coverage.js";
import { learnTool } from "../../src/tools/dgraph/learn.js";
import { traverseTool } from "../../src/tools/dgraph/traverse.js";
import { packTool } from "../../src/tools/pragma/pack.js";
import { projectTool } from "../../src/tools/pragma/project.js";
import { statusTool } from "../../src/tools/pragma/status.js";
import { registerAllTools } from "../../src/tools/register-all.js";
import type { ToolHandler } from "../../src/tools/registry.js";

type ToolResult = Awaited<ReturnType<ToolHandler["handler"]>>;

const TOOL_HANDLERS = {
  ghostcrab_count: countTool,
  ghostcrab_coverage: coverageTool,
  ghostcrab_learn: learnTool,
  ghostcrab_pack: packTool,
  ghostcrab_project: projectTool,
  ghostcrab_remember: rememberTool,
  ghostcrab_schema_inspect: schemaInspectTool,
  ghostcrab_schema_list: schemaListTool,
  ghostcrab_schema_register: schemaRegisterTool,
  ghostcrab_search: searchTool,
  ghostcrab_status: statusTool,
  ghostcrab_traverse: traverseTool,
  ghostcrab_upsert: upsertTool
} satisfies Record<string, ToolHandler>;

const SQLITE_TEST_DIR = mkdtempSync(join(tmpdir(), "ghostcrab-sqlite-tests-"));
const SQLITE_TEST_DB_PATH = join(SQLITE_TEST_DIR, "integration.sqlite");

function ensureSqliteTestEnv(): void {
  process.env.GHOSTCRAB_MINDBRAIN_URL =
    process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091";
  process.env.GHOSTCRAB_MINDBRAIN_HTTP_TIMEOUT_MS =
    process.env.GHOSTCRAB_MINDBRAIN_HTTP_TIMEOUT_MS ?? "30000";
  process.env.GHOSTCRAB_SQLITE_PATH = SQLITE_TEST_DB_PATH;
  process.env.GHOSTCRAB_EMBEDDINGS_MODE = "disabled";
}

export function createIntegrationHarness() {
  ensureSqliteTestEnv();
  const config = resolveGhostcrabConfig(process.env);
  const database = createDatabaseClient(config);
  const toolContext = createToolContext(database, {
    embeddingDimensions: config.embeddingDimensions,
    embeddingsMode: config.embeddingsMode,
    embeddingFixturePath: config.embeddingFixturePath,
    hybridBm25Weight: config.hybridBm25Weight,
    hybridVectorWeight: config.hybridVectorWeight
  });

  beforeAll(async () => {
    registerAllTools();
    const reachable = await database.ping();

    if (!reachable) {
      throw new Error(
        `Integration MindBrain backend is unreachable at ${config.mindbrainUrl}.`
      );
    }
  });

  return {
    config,
    database,
    toolContext
  };
}

export async function cleanupTestDatabase(
  database: DatabaseClient
): Promise<void> {
  await database.query("DELETE FROM graph_relation");
  await database.query("DELETE FROM graph_entity_alias");
  await database.query("DELETE FROM graph_entity");
  await database.query("DELETE FROM relation_semantics");
  await database.query("DELETE FROM column_semantics");
  await database.query("DELETE FROM table_semantics");
  await database.query("DELETE FROM pending_migrations");
  await database.query("DELETE FROM projections");
  await database.query("DELETE FROM agent_state");
  await database.query("DELETE FROM facets");
  await database.query("DELETE FROM workspaces WHERE id <> 'default'");
}

export async function closeIntegrationDatabase(
  database: DatabaseClient
): Promise<void> {
  await database.close();
  rmSync(SQLITE_TEST_DIR, { force: true, recursive: true });
}

export function readStructured(result: ToolResult): Record<string, unknown> {
  return result.structuredContent as Record<string, unknown>;
}

export async function executeHandler(
  toolName: keyof typeof TOOL_HANDLERS,
  args: Record<string, unknown>,
  database: DatabaseClient
): Promise<Record<string, unknown>> {
  const config = resolveGhostcrabConfig(process.env);
  const result = await TOOL_HANDLERS[toolName].handler(
    args,
    createToolContext(database, {
      embeddingsMode: config.embeddingsMode,
      embeddingDimensions: config.embeddingDimensions,
      embeddingFixturePath: config.embeddingFixturePath,
      hybridBm25Weight: config.hybridBm25Weight,
      hybridVectorWeight: config.hybridVectorWeight
    })
  );

  return readStructured(result);
}

export async function seedBootstrapDomainMinimal(
  database: DatabaseClient
): Promise<void> {
  await database.query(
    `UPDATE workspaces
     SET domain_profile = $1, domain_profile_json = $2
     WHERE id = 'default'`,
    ["demo-domain", JSON.stringify({ domain: "demo-domain" })]
  );
  await executeHandler(
    "ghostcrab_schema_register",
    {
      definition: {
        schema_id: "demo:test:task",
        description: "Task records for integration tests"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_remember",
    {
      schema_id: "mindbrain:ontology",
      content: "Task concept in demo domain",
      facets: {
        domain: "demo-domain",
        node_id: "concept:demo:task",
        label: "Task",
        criticality: "high"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_learn",
    {
      node: {
        id: "concept:demo:task",
        node_type: "concept",
        label: "Task",
        properties: {
          domain: "demo-domain",
          mastery: 1
        }
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_project",
    {
      scope: "demo-domain/setup",
      content: "Define the first task model",
      proj_type: "STEP",
      status: "active"
    },
    database
  );
}

export async function seedActiveProjectDataset(
  database: DatabaseClient
): Promise<void> {
  await seedBootstrapDomainMinimal(database);

  await executeHandler(
    "ghostcrab_remember",
    {
      schema_id: "demo:test:task",
      content: "Customer onboarding task is blocked by missing API token",
      facets: {
        record_id: "task:active-1",
        scope: "project:apollo",
        status: "blocked",
        team: "ops",
        domain: "delivery"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_remember",
    {
      schema_id: "demo:test:task",
      content: "Customer onboarding task is blocked by missing API token",
      facets: {
        record_id: "task:duplicate-content",
        scope: "project:apollo",
        status: "todo",
        team: "ops",
        domain: "delivery"
      }
    },
    database
  );
  await database.query(
    `
      INSERT INTO facets (
        id,
        schema_id,
        content,
        facets_json,
        valid_until_unix,
        workspace_id,
        doc_id
      )
      VALUES (?, ?, ?, ?, strftime('%s','now') - 86400, 'default', ?)
    `,
    [
      "facet:expired-1",
      "demo:test:task",
      "Expired task should not appear in active reads",
      JSON.stringify({
        record_id: "task:expired-1",
        scope: "project:apollo",
        status: "done",
        team: "ops",
        domain: "delivery",
        external_schema: "unknown:schema"
      }),
      1_000_001
    ]
  );
  await executeHandler(
    "ghostcrab_upsert",
    {
      schema_id: "demo:test:task",
      match: {
        facets: {
          record_id: "task:active-1"
        }
      },
      set_facets: {
        owner: "agent:self"
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_project",
    {
      scope: "project:apollo",
      content: "Resolve missing token blocker",
      proj_type: "CONSTRAINT",
      status: "blocking"
    },
    database
  );
  await database.query(
    `
      INSERT INTO agent_state (
        agent_id,
        health,
        state,
        metrics_json,
        updated_at_unix
      )
      VALUES ('agent:self', 'YELLOW', 'ACTIVE', ?, strftime('%s','now'))
      ON CONFLICT(agent_id) DO UPDATE
        SET health = excluded.health,
            state = excluded.state,
            metrics_json = excluded.metrics_json,
            updated_at_unix = excluded.updated_at_unix
    `,
    [
      JSON.stringify({
        avg_latency_ms: 120,
        token_budget_remaining: 4_000
      })
    ]
  );
}

export async function seedEdgeCasesDataset(
  database: DatabaseClient
): Promise<void> {
  await seedActiveProjectDataset(database);
  await executeHandler(
    "ghostcrab_learn",
    {
      edge: {
        source: "concept:demo:task",
        target: "concept:demo:missing-capability",
        label: "HAS_GAP",
        weight: 0.9,
        properties: {
          domain: "demo-domain"
        }
      }
    },
    database
  );
  await executeHandler(
    "ghostcrab_learn",
    {
      node: {
        id: "concept:demo:missing-capability",
        node_type: "concept",
        label: "Missing capability",
        properties: {
          domain: "demo-domain",
          mastery: 0
        }
      }
    },
    database
  );
}
