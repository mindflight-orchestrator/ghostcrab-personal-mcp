import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function canonicalizeRoute(route: string): string {
  return route.replace(/\?.*$/, "");
}

function extractRouteLines(block: string): string[] {
  return block
    .split("\n")
    .map((line) => canonicalizeRoute(normalizeWhitespace(line)))
    .filter((line) => /^(GET|POST)\s+\//.test(line));
}

function extractZigDocRoutes(source: string): string[] {
  const routesBlock = source.match(/\/\/\/ Routes:\n((?:\/\/\/.*\n)+)/);
  expect(routesBlock?.[1]).toBeDefined();
  return extractRouteLines(
    routesBlock![1].replaceAll("///", "")
  );
}

function extractZigUsageRoutes(source: string): string[] {
  const routeMatches = [...source.matchAll(/\\\\\s+(GET|POST)\s+(\/[^\n"]+)/g)];
  return routeMatches.map(([, method, route]) =>
    canonicalizeRoute(normalizeWhitespace(`${method} ${route}`))
  );
}

function extractZigDispatchRoutes(source: string): string[] {
  const routes = new Set<string>();
  let method: "POST" | "GET" | null = null;

  for (const line of source.split("\n")) {
    if (line.includes("// POST routes")) {
      method = "POST";
      continue;
    }
    if (line.includes("// GET routes")) {
      method = "GET";
      continue;
    }

    const match = line.match(
      /std\.mem\.eql\(u8,\s*path,\s*"([^"]+)"\)/
    );
    if (match && method) {
      routes.add(`${method} ${match[1]}`);
    }
  }

  return [...routes];
}

function extractMindbrainDispatchRoutes(source: string): string[] {
  const routes = new Set<string>();
  const lines = source.split("\n");
  let getOnly = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("request.head.method != .GET")) {
      getOnly = true;
    }

    const match = line.match(
      /std\.mem\.eql\(u8,\s*path,\s*"([^"]+)"\)/
    );
    if (!match) {
      continue;
    }

    if (getOnly) {
      routes.add(`GET ${match[1]}`);
      continue;
    }

    const routeBlock = lines.slice(index, index + 4).join("\n");
    if (routeBlock.includes("request.head.method != .POST")) {
      routes.add(`POST ${match[1]}`);
    } else if (routeBlock.includes("request.head.method != .GET")) {
      routes.add(`GET ${match[1]}`);
    }
  }

  return [...routes];
}

describe("endpoint contract drift guard", () => {
  it("keeps backend docs and CLI usage aligned with the Zig route dispatcher", async () => {
    const source = await readFile(
      path.resolve(repoRoot, "cmd/backend/http_server.zig"),
      "utf8"
    );
    const usageRoutes = extractZigUsageRoutes(source);

    if (source.includes("mindbrain.http_app.MindbrainHttpApp")) {
      const mindbrainSource = await readFile(
        path.resolve(repoRoot, "vendor/mindbrain/src/standalone/http_app.zig"),
        "utf8"
      );
      const mindbrainDispatchRoutes = new Set(
        extractMindbrainDispatchRoutes(mindbrainSource)
      );

      for (const route of usageRoutes) {
        expect(mindbrainDispatchRoutes.has(route)).toBe(true);
      }
      return;
    }

    const dispatchRoutes = extractZigDispatchRoutes(source);
    const docRoutes = extractZigDocRoutes(source);

    expect(new Set(docRoutes)).toEqual(new Set(dispatchRoutes));
    expect(new Set(usageRoutes)).toEqual(new Set(dispatchRoutes));
  });
});
