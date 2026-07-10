import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertDocumentedRoutesMatchUsage,
  assertForbiddenEmbedderPatterns,
  assertLabRoutesGatedInMindbrain,
  assertRoutesAbsentFromSource,
  assertRoutesPresent,
  extractMindbrainDispatchRoutes,
  extractZigUsageRoutes,
  routeSet
} from "../contracts/backend-contract-assert.js";
import { GHOSTCRAB_BACKEND_CONTRACT } from "../contracts/ghostcrab-backend.contract.js";

const repoRoot = process.cwd();

describe("ghostcrab backend contract", () => {
  it("defines a stable production surface without lab routes", () => {
    expect(GHOSTCRAB_BACKEND_CONTRACT.service).toBe("ghostcrab-backend");
    expect(GHOSTCRAB_BACKEND_CONTRACT.enableLabRoutes).toBe(false);

    const required = routeSet(GHOSTCRAB_BACKEND_CONTRACT.requiredRoutes);
    for (const forbidden of GHOSTCRAB_BACKEND_CONTRACT.forbiddenRoutes) {
      expect(required.has(`${forbidden.method} ${forbidden.path}`)).toBe(false);
    }
  });

  it("keeps required routes in vendor mindbrain dispatch", async () => {
    const mindbrainSource = await readFile(
      path.resolve(repoRoot, "vendor/mindbrain/src/standalone/http_app.zig"),
      "utf8"
    );
    const dispatchRoutes = new Set(
      extractMindbrainDispatchRoutes(mindbrainSource)
    );

    assertRoutesPresent(
      dispatchRoutes,
      GHOSTCRAB_BACKEND_CONTRACT.requiredRoutes,
      "mindbrain dispatch"
    );
    assertLabRoutesGatedInMindbrain(mindbrainSource);
  });

  it("keeps ghostcrab-backend usage aligned with the documented contract routes", async () => {
    const httpServerSource = await readFile(
      path.resolve(repoRoot, "cmd/backend/http_server.zig"),
      "utf8"
    );
    const usageRoutes = extractZigUsageRoutes(httpServerSource);

    assertDocumentedRoutesMatchUsage(
      usageRoutes,
      GHOSTCRAB_BACKEND_CONTRACT.documentedRoutes
    );
    assertForbiddenEmbedderPatterns(httpServerSource);
    assertRoutesAbsentFromSource(
      httpServerSource,
      GHOSTCRAB_BACKEND_CONTRACT.forbiddenRoutes,
      "ghostcrab-backend usage"
    );

    const mindbrainSource = await readFile(
      path.resolve(repoRoot, "vendor/mindbrain/src/standalone/http_app.zig"),
      "utf8"
    );
    const dispatchRoutes = new Set(
      extractMindbrainDispatchRoutes(mindbrainSource)
    );

    for (const route of usageRoutes) {
      expect(
        dispatchRoutes.has(route),
        `usage route missing in dispatch: ${route}`
      ).toBe(true);
    }
  });
});
