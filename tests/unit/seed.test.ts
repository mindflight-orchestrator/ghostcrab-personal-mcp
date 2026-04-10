import { describe, expect, it } from "vitest";

import { ensureBootstrapData } from "../../src/bootstrap/seed.js";
import type { DatabaseClient, Queryable } from "../../src/db/client.js";

function createMockDatabase(): {
  database: DatabaseClient;
  insertedFacetKeys: Set<string>;
} {
  const insertedAgentStates = new Set<string>();
  const insertedFacetKeys = new Set<string>();
  const insertedNodeIds = new Set<string>();
  const insertedEdgeKeys = new Set<string>();
  const insertedProjectionKeys = new Set<string>();
  let lastEdgeLookupKey: string | null = null;

  const queryImpl: Queryable["query"] = async (sql, params = []) => {
    if (sql.includes("SELECT id") && sql.includes("FROM mfo_facets")) {
      const schemaId = String(params[0]);
      const lookup = JSON.parse(String(params[1])) as Record<string, unknown>;
      const key = `${schemaId}:${JSON.stringify(lookup)}`;

      return insertedFacetKeys.has(key) ? [{ id: key }] : [];
    }

    if (sql.includes("FROM graph.entity") && sql.includes("name =")) {
      const nodeId = String(params.length >= 2 ? params[1] : params[0]);

      return insertedNodeIds.has(nodeId) ? [{ id: "1" }] : [];
    }

    if (sql.includes("FROM graph.relation") && sql.includes("s.name =")) {
      lastEdgeLookupKey = `${params[0]}:${params[1]}:${params[2]}`;

      return insertedEdgeKeys.has(lastEdgeLookupKey) ? [{ id: "edge-1" }] : [];
    }

    if (
      sql.includes("SELECT agent_id") &&
      sql.includes("FROM mfo_agent_state")
    ) {
      const agentId = String(params[0]);

      return insertedAgentStates.has(agentId) ? [{ agent_id: agentId }] : [];
    }

    if (sql.includes("SELECT id") && sql.includes("FROM mfo_projections")) {
      const projectionKey = `${params[0]}:${params[1]}:${params[2]}:${params[3]}`;

      return insertedProjectionKeys.has(projectionKey)
        ? [{ id: projectionKey }]
        : [];
    }

    if (sql.includes("INSERT INTO mfo_facets")) {
      const schemaId = String(params[0]);
      const facets = JSON.parse(String(params[2])) as Record<string, unknown>;
      const lookup =
        schemaId === "mfo:system"
          ? { entry_slug: facets.entry_slug }
          : schemaId === "mfo:schema"
            ? { schema_id: facets.schema_id, target: facets.target }
            : schemaId === "mfo:ontology"
              ? { domain: facets.domain, node_id: facets.node_id }
              : { record_id: facets.record_id };

      insertedFacetKeys.add(`${schemaId}:${JSON.stringify(lookup)}`);
      return [];
    }

    if (sql.includes("INSERT INTO graph.entity")) {
      insertedNodeIds.add(String(params[1]));
      return [{ id: "1" }];
    }

    if (sql.includes("INSERT INTO graph.entity_alias")) {
      return [];
    }

    if (sql.includes("INSERT INTO graph.relation")) {
      if (lastEdgeLookupKey) {
        insertedEdgeKeys.add(lastEdgeLookupKey);
      }

      return [];
    }

    if (sql.includes("INSERT INTO mfo_agent_state")) {
      insertedAgentStates.add(String(params[0]));
      return [];
    }

    if (sql.includes("INSERT INTO mfo_projections")) {
      insertedProjectionKeys.add(
        `${params[0]}:${params[1]}:${params[2]}:${params[3]}`
      );
      return [];
    }

    return [];
  };

  return {
    database: {
      query: queryImpl,
      ping: async () => true,
      close: async () => undefined,
      transaction: async (operation) => {
        const queryable: Queryable = {
          query: queryImpl
        };

        return operation(queryable);
      }
    },
    insertedFacetKeys
  };
}

function expectFacetSeed(
  insertedFacetKeys: Set<string>,
  schemaId: string,
  lookup: Record<string, unknown>
) {
  expect(insertedFacetKeys.has(`${schemaId}:${JSON.stringify(lookup)}`)).toBe(
    true
  );
}

describe("ensureBootstrapData", () => {
  it("seeds system entries, schemas, and ontology nodes only once", async () => {
    const { database } = createMockDatabase();

    const first = await ensureBootstrapData(database);
    const second = await ensureBootstrapData(database);

    expect(first.insertedSystemEntries).toBeGreaterThan(0);
    expect(first.insertedSchemas).toBeGreaterThan(0);
    expect(first.insertedOntologies).toBeGreaterThan(0);
    expect(first.insertedProductRecords).toBeGreaterThan(0);
    expect(first.insertedGraphNodes).toBeGreaterThan(0);
    expect(first.insertedGraphEdges).toBeGreaterThan(0);
    expect(first.insertedAgentStates).toBeGreaterThan(0);
    expect(first.insertedProjections).toBeGreaterThan(0);
    expect(second.insertedSystemEntries).toBe(0);
    expect(second.insertedSchemas).toBe(0);
    expect(second.insertedOntologies).toBe(0);
    expect(second.insertedProductRecords).toBe(0);
    expect(second.insertedGraphNodes).toBe(0);
    expect(second.insertedGraphEdges).toBe(0);
    expect(second.insertedAgentStates).toBe(0);
    expect(second.insertedProjections).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
  });

  it("seeds long-running primitives, policies, and activity families", async () => {
    const { database, insertedFacetKeys } = createMockDatabase();

    await ensureBootstrapData(database);

    expectFacetSeed(insertedFacetKeys, "mfo:system", {
      entry_slug: "view:phase-heartbeat"
    });
    expectFacetSeed(insertedFacetKeys, "mfo:system", {
      entry_slug: "view:deployment-brief"
    });
    expectFacetSeed(insertedFacetKeys, "mfo:system", {
      entry_slug: "view:integration-health-brief"
    });
    expectFacetSeed(insertedFacetKeys, "mfo:system", {
      entry_slug: "view:knowledge-snapshot"
    });
    expectFacetSeed(insertedFacetKeys, "mfo:schema", {
      schema_id: "ghostcrab:source",
      target: "facets"
    });
    expectFacetSeed(insertedFacetKeys, "mfo:schema", {
      schema_id: "ghostcrab:note",
      target: "facets"
    });
    expectFacetSeed(insertedFacetKeys, "mfo:schema", {
      schema_id: "ghostcrab:integration-endpoint",
      target: "facets"
    });
    expectFacetSeed(insertedFacetKeys, "mfo:schema", {
      schema_id: "ghostcrab:environment-context",
      target: "facets"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:autonomy-policy", {
      record_id: "policy:canonical-current-state-first"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:intent-pattern", {
      record_id: "intent:resume-paused-project"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:intent-pattern", {
      record_id: "intent:connect-external-postgresql"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:signal-pattern", {
      record_id: "signal:integration-operations"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:signal-pattern", {
      record_id: "signal:environment-delivery"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:ingest-pattern", {
      record_id: "ingest:api-response-to-source"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:ingest-pattern", {
      record_id: "ingest:db-inspection-to-note"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:activity-family", {
      record_id: "activity-family:integration-operations"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:activity-family", {
      record_id: "activity-family:environment-delivery"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:projection-recipe", {
      record_id: "recipe:projection:workflow-tracking:phase-heartbeat"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:projection-recipe", {
      record_id: "recipe:projection:integration-operations"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:projection-recipe", {
      record_id: "recipe:projection:environment-delivery"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:environment-context", {
      record_id: "environment:apollo:acme-eu-staging"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:integration-endpoint", {
      record_id: "integration:apollo:erp-postgres"
    });
    expectFacetSeed(insertedFacetKeys, "ghostcrab:note", {
      record_id: "note:apollo:recovery-checkpoint"
    });
  });
});
