import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadToolManifestFromDist } from "./load-tool-manifest.mjs";
import {
  callToolJson,
  listTools,
  withSmokeClient
} from "./mcp-smoke-shared.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadManifest() {
  return loadToolManifestFromDist();
}

const { manifest, registered, missing, extra } = loadManifest();

if (missing.length > 0 || extra.length > 0) {
  console.error(JSON.stringify({ ok: false, missing, extra }, null, 2));
  process.exit(1);
}

const callSmoke = [
  {
    subsystem: "pragma",
    name: "ghostcrab_status",
    args: { agent_id: "verify:mcp-tools" }
  },
  {
    subsystem: "facets",
    name: "ghostcrab_search",
    args: { query: "verify", limit: 1 }
  },
  {
    subsystem: "workspace",
    name: "ghostcrab_workspace_list",
    args: {}
  },
  {
    subsystem: "graph",
    name: "ghostcrab_coverage",
    args: { workspace_id: "default" }
  },
  {
    subsystem: "loadout",
    name: "ghostcrab_loadout_list",
    args: { workspace_id: "default" }
  },
  {
    subsystem: "discovery",
    name: "ghostcrab_tool_search",
    args: { query: "workspace", limit: 20 }
  }
];

const report = {
  ok: true,
  expected_count: manifest.total,
  registered_count: registered.length,
  missing,
  extra,
  listed_count: 0,
  call_failures: []
};

await withSmokeClient("verify-mcp-tools", async ({ client }) => {
  const toolNames = await listTools(client);
  report.listed_count = toolNames.length;

  if (
    JSON.stringify([...toolNames].sort()) !==
    JSON.stringify([...manifest.names].sort())
  ) {
    throw new Error(
      `tools/list mismatch. Listed ${toolNames.length}, expected ${manifest.total} tools (full catalog).`
    );
  }

  const toolsResult = await client.listTools();
  for (const tool of toolsResult.tools) {
    if (!tool.inputSchema) {
      throw new Error(`Missing inputSchema for ${tool.name}`);
    }
  }

  for (const check of callSmoke) {
    const payload = await callToolJson(
      client,
      check.name,
      check.args,
      check.name
    );

    if (payload.ok !== true) {
      const code =
        payload.error && typeof payload.error === "object"
          ? payload.error.code
          : "unknown";
      if (code === "unknown_tool" || code === "backend_unavailable") {
        report.ok = false;
        report.call_failures.push({
          subsystem: check.subsystem,
          tool: check.name,
          code
        });
      }
      continue;
    }

    if (check.name === "ghostcrab_tool_search") {
      if (payload.catalog_size !== manifest.total) {
        throw new Error(
          `ghostcrab_tool_search catalog_size=${payload.catalog_size} expected ${manifest.total}`
        );
      }
    }
  }
});

if (report.call_failures.length > 0) {
  report.ok = false;
}

const jsonOutput = process.argv.includes("--json");
if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.ok) {
  console.error(
    `[verify-mcp-tools] OK — listed ${report.listed_count}/${report.expected_count} tools; call smoke passed.`
  );
} else {
  console.error(JSON.stringify(report, null, 2));
}

process.exit(report.ok ? 0 : 1);
