import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { bootstrapNativeWithReport } from "../../../src/db/native-bootstrap.js";
import { resolveExtensionCapabilities } from "../../../src/db/extension-probe.js";
import {
  cleanupTestDatabase,
  closeIntegrationDatabase,
  createIntegrationHarness,
  executeHandler,
  seedActiveProjectDataset
} from "../../helpers/cli-integration.js";

const harness = createIntegrationHarness();
type NativeReadinessPayload = Record<string, unknown>;

describe.sequential("native readiness", () => {
  beforeEach(async () => {
    await cleanupTestDatabase(harness.database);
  });

  afterAll(async () => {
    await closeIntegrationDatabase(harness.database);
  });

  it("reports runtime.native_readiness consistent with effective capabilities", async () => {
    await seedActiveProjectDataset(harness.database);

    if (harness.database.kind !== "sqlite") {
      const extensions = await resolveExtensionCapabilities(
        harness.database,
        "auto"
      );
      const bootstrap = await bootstrapNativeWithReport(harness.database, extensions);
      expect(bootstrap.ok).toBe(true);
    }

    const status = await executeHandler(
      "ghostcrab_status",
      { agent_id: "agent:self" },
      harness.database,
      { nativeExtensionsMode: "auto" }
    );
    const runtime = status.runtime as NativeReadinessPayload;
    const readiness = runtime.native_readiness as NativeReadinessPayload;
    const capabilities = runtime.capabilities as NativeReadinessPayload;
    const detected = runtime.extensions_detected as NativeReadinessPayload;

    expect(readiness).toBeDefined();
    expect(capabilities.facets_native_count).toBe(readiness.facets.count);
    expect(capabilities.facets_native_bm25).toBe(readiness.facets.bm25);
    expect(capabilities.graph_native_traversal).toBe(
      readiness.dgraph.entityNeighborhood
    );
    expect(capabilities.graph_marketplace_search).toBe(
      readiness.dgraph.marketplace
    );
    expect(capabilities.graph_confidence_decay).toBe(
      readiness.dgraph.confidenceDecay
    );
    expect(capabilities.pragma_native_pack).toBe(readiness.pragma.pack);

    if (harness.database.kind === "sqlite") {
      expect(detected).toMatchObject({
        pg_facets: false,
        pg_dgraph: false,
        pg_pragma: false,
        pg_mindbrain: false
      });
      return;
    }

    if (detected.pg_facets) {
      expect(readiness.facets.registered).toBe(true);
      expect(readiness.facets.count).toBe(true);
      expect(readiness.facets.hierarchy).toBe(true);
    } else {
      expect(readiness.facets.registered).toBe(false);
      expect(readiness.facets.bm25).toBe(false);
    }

    if (detected.pg_dgraph) {
      expect(readiness.dgraph.marketplace).toBe(true);
      expect(readiness.dgraph.patch).toBe(true);
      expect(readiness.dgraph.confidenceDecay).toBe(true);
      expect(readiness.dgraph.entityNeighborhood).toBe(true);
      expect(readiness.dgraph.entityDegree).toBe(true);
    }

    if (detected.pg_pragma) {
      expect(readiness.pragma.pack).toBe(true);
    } else {
      expect(readiness.pragma.pack).toBe(false);
    }
  });
});
