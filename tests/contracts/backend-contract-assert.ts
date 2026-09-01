import { expect } from "vitest";

import {
  GHOSTCRAB_BACKEND_CONTRACT,
  type BackendRouteSpec
} from "./ghostcrab-backend.contract.js";

export function formatRoute(route: BackendRouteSpec): string {
  return `${route.method} ${route.path}`;
}

export function canonicalizeRoute(route: string): string {
  return route.replace(/\?.*$/, "").replace(/\s+/g, " ").trim();
}

export function routeSet(routes: readonly BackendRouteSpec[]): Set<string> {
  return new Set(routes.map((entry) => formatRoute(entry)));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractZigUsageRoutes(source: string): string[] {
  const routeMatches = [...source.matchAll(/\\\\\s+(GET|POST)\s+(\/[^\n"]+)/g)];
  return routeMatches.map(([, method, routePath]) =>
    canonicalizeRoute(normalizeWhitespace(`${method} ${routePath}`))
  );
}

export function extractMindbrainDispatchRoutes(source: string): string[] {
  const routes = new Set<string>();
  const lines = source.split("\n");
  let getOnly = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("request.head.method != .GET")) {
      getOnly = true;
    }

    const dynamicMatch = line.match(
      /artifactRouteId\(path,\s*"([^"]+)",\s*"([^"]*)"\)/
    );
    if (dynamicMatch) {
      const path = `${dynamicMatch[1]}{artifact_id}${dynamicMatch[2]}`;
      if (getOnly) {
        routes.add(`GET ${path}`);
      } else {
        const routeBlock = lines.slice(index, index + 6).join("\n");
        if (routeBlock.includes("request.head.method != .POST")) {
          routes.add(`POST ${path}`);
        } else if (routeBlock.includes("request.head.method != .GET")) {
          routes.add(`GET ${path}`);
        }
      }
      continue;
    }

    const match = line.match(/std\.mem\.eql\(u8,\s*path,\s*"([^"]+)"\)/);
    if (!match) {
      continue;
    }

    if (getOnly) {
      routes.add(`GET ${match[1]}`);
      continue;
    }

    const routeBlock = lines.slice(index, index + 6).join("\n");
    if (routeBlock.includes("request.head.method != .POST")) {
      routes.add(`POST ${match[1]}`);
    } else if (routeBlock.includes("request.head.method != .GET")) {
      routes.add(`GET ${match[1]}`);
    }
  }

  return [...routes];
}

export function assertRoutesPresent(
  dispatchRoutes: Set<string>,
  routes: readonly BackendRouteSpec[],
  label: string
): void {
  for (const route of routes) {
    expect(
      dispatchRoutes.has(formatRoute(route)),
      `${label}: ${formatRoute(route)}`
    ).toBe(true);
  }
}

export function assertRoutesAbsentFromSource(
  source: string,
  routes: readonly BackendRouteSpec[],
  label: string
): void {
  for (const route of routes) {
    expect(source.includes(route.path), `${label}: ${route.path}`).toBe(false);
  }
}

export function assertForbiddenEmbedderPatterns(source: string): void {
  for (const pattern of GHOSTCRAB_BACKEND_CONTRACT.forbiddenEmbedderPatterns) {
    expect(
      source.includes(pattern),
      `forbidden embedder pattern: ${pattern}`
    ).toBe(false);
  }
  expect(
    source.includes(".enable_lab_routes = false"),
    "ghostcrab-backend must explicitly disable lab routes"
  ).toBe(true);
}

export function assertLabRoutesGatedInMindbrain(source: string): void {
  expect(
    source.includes("if (!self.enable_lab_routes) return error.NotFound"),
    "simulate route must be gated by enable_lab_routes"
  ).toBe(true);
  expect(
    source.includes("if (self.enable_lab_routes and"),
    "SSE lab routes must be gated by enable_lab_routes"
  ).toBe(true);
}

export function assertDocumentedRoutesMatchUsage(
  usageRoutes: string[],
  documentedRoutes: readonly BackendRouteSpec[]
): void {
  expect(new Set(usageRoutes)).toEqual(routeSet(documentedRoutes));
}
