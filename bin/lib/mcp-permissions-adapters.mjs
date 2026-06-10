/**
 * MCP permission rendering and settings merge for Claude Code and Cursor.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..", "..");

const FALLBACK_BASIC_TOOLS = [
  "ghostcrab_status",
  "ghostcrab_search",
  "ghostcrab_count",
  "ghostcrab_combined_search",
  "ghostcrab_remember",
  "ghostcrab_upsert",
  "ghostcrab_schema_get",
  "ghostcrab_schema_list",
  "ghostcrab_schema_inspect",
  "ghostcrab_pack",
  "ghostcrab_project",
  "ghostcrab_modeling_guidance",
  "ghostcrab_tool_search"
];

/** @returns {Promise<typeof import("../../dist/tools/mcp-tool-policy.js") | null>} */
export async function loadMcpToolPolicyModule() {
  try {
    return await import("../../dist/tools/mcp-tool-policy.js");
  } catch {
    return null;
  }
}

/**
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPreset} preset
 * @param {object} opts
 */
export async function buildPolicy(preset, opts = {}) {
  const mod = await loadMcpToolPolicyModule();
  if (mod) {
    return mod.buildToolPermissionPreset(preset, opts);
  }
  if (preset === "none") {
    return { allow: [], ask: [], deny: [] };
  }
  if (preset === "basic") {
    const serverName = opts.serverName ?? "ghostcrab-personal-mcp";
    return {
      allow: FALLBACK_BASIC_TOOLS.map((toolName) => ({ serverName, toolName })),
      ask: [],
      deny: []
    };
  }
  throw new Error(
    `dist/tools/mcp-tool-policy.js not built — run pnpm run build for preset ${preset}`
  );
}

/**
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPolicy} policy
 */
export async function toClaudePermissions(policy) {
  const mod = await loadMcpToolPolicyModule();
  if (mod) {
    return mod.policyToClaudePermissions(policy);
  }
  const allow = policy.allow.map(
    (ref) =>
      `mcp__${ref.serverName}${ref.toolName ? `__${ref.toolName}` : ""}`
  );
  const ask = policy.ask.map(
    (ref) =>
      `mcp__${ref.serverName}${ref.toolName ? `__${ref.toolName}` : ""}`
  );
  return { allow, ask, deny: [] };
}

/**
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPolicy} policy
 */
export async function toCursorAllowlist(policy) {
  const mod = await loadMcpToolPolicyModule();
  if (mod) {
    return mod.policyToCursorMcpAllowlist(policy);
  }
  return policy.allow.map((ref) =>
    ref.toolName ? `${ref.serverName}:${ref.toolName}` : `${ref.serverName}:*`
  );
}

/** @param {string[]} rules @param {string[]} serverNames */
export function pruneGhostcrabMcpRules(rules, serverNames) {
  const prefixes = serverNames.flatMap((name) => [
    `mcp__${name}`,
    `${name}:`
  ]);
  return rules.filter((rule) => {
    const r = String(rule);
    return !prefixes.some(
      (p) => r === p || r.startsWith(`${p}__`) || r.startsWith(p)
    );
  });
}

/** @param {string[]} allowlist @param {string[]} serverNames */
export function pruneCursorMcpAllowlist(allowlist, serverNames) {
  return allowlist.filter((entry) => {
    const e = String(entry);
    return !serverNames.some(
      (name) => e.startsWith(`${name}:`) || e === `${name}:*`
    );
  });
}

/**
 * @param {Record<string, unknown> | null} existing
 * @param {{ allow?: string[], ask?: string[], deny?: string[] }} patch
 * @param {{ force?: boolean, serverNames?: string[] }} opts
 */
export function mergeClaudeSettingsPermissions(existing, patch, opts = {}) {
  const serverNames = opts.serverNames ?? [
    "ghostcrab-personal-mcp",
    "ghostcrab"
  ];
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const permissions =
    base.permissions && typeof base.permissions === "object"
      ? { .../** @type {Record<string, unknown>} */ (base.permissions) }
      : {};

  for (const key of ["allow", "ask", "deny"]) {
    const incoming = patch[key];
    if (!Array.isArray(incoming)) continue;
    const prev = Array.isArray(permissions[key])
      ? /** @type {string[]} */ (permissions[key])
      : [];
    const cleaned = opts.force
      ? pruneGhostcrabMcpRules(prev, serverNames)
      : prev;
    permissions[key] = [...new Set([...cleaned, ...incoming])];
  }

  return { ...base, permissions };
}

/**
 * @param {Record<string, unknown> | null} existing
 * @param {string[]} allowlist
 * @param {{ force?: boolean, serverNames?: string[] }} opts
 */
export function mergeCursorPermissionsJson(existing, allowlist, opts = {}) {
  const serverNames = opts.serverNames ?? [
    "ghostcrab-personal-mcp",
    "ghostcrab"
  ];
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const prev = Array.isArray(base.mcpAllowlist)
    ? /** @type {string[]} */ (base.mcpAllowlist)
    : [];
  const cleaned = opts.force
    ? pruneCursorMcpAllowlist(prev, serverNames)
    : prev;
  return {
    ...base,
    mcpAllowlist: [...new Set([...cleaned, ...allowlist])]
  };
}

/**
 * @param {Record<string, unknown> | null} existing
 * @param {Record<string, unknown>} fragment
 */
export function mergeClaudeSettingsFragment(existing, fragment) {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  if (fragment.hooks && typeof fragment.hooks === "object" && !base.hooks) {
    return { ...base, hooks: fragment.hooks };
  }
  return base;
}

/**
 * @param {"user" | "project"} scope
 * @param {string} cwd
 */
export function resolveClaudeSettingsPath(scope, cwd) {
  if (scope === "project") {
    return join(cwd, ".claude", "settings.json");
  }
  return join(homedir(), ".claude", "settings.json");
}

export function resolveCursorPermissionsPath() {
  return join(homedir(), ".cursor", "permissions.json");
}

/**
 * @param {object} opts
 * @param {"user" | "project"} opts.permissionsScope
 * @param {string} opts.cwd
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPreset} opts.preset
 * @param {string} opts.serverName
 * @param {boolean} [opts.force]
 * @param {boolean} [opts.dryRun]
 * @param {string[]} [opts.allowTools]
 * @param {string[]} [opts.askTools]
 */
export async function applyClaudePermissions(opts) {
  const policy = await buildPolicy(opts.preset, {
    serverName: opts.serverName,
    allowTools: opts.allowTools,
    askTools: opts.askTools
  });
  const rendered = await toClaudePermissions(policy);
  const settingsPath = resolveClaudeSettingsPath(
    opts.permissionsScope,
    opts.cwd
  );

  let existing = null;
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      return {
        ok: false,
        message: `Could not parse ${settingsPath}`
      };
    }
  }

  const merged = mergeClaudeSettingsPermissions(
    existing,
    {
      allow: rendered.allow,
      ask: rendered.ask,
      deny: rendered.deny
    },
    { force: opts.force ?? false, serverNames: [opts.serverName, "ghostcrab"] }
  );

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      settingsPath,
      doc: merged,
      allowCount: rendered.allow.length
    };
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return {
    ok: true,
    settingsPath,
    allowCount: rendered.allow.length,
    message: `Wrote Claude permissions (${opts.preset}) to ${settingsPath}`
  };
}

/**
 * @param {object} opts
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPreset} opts.preset
 * @param {string} opts.serverName
 * @param {boolean} [opts.force]
 * @param {boolean} [opts.dryRun]
 * @param {string[]} [opts.allowTools]
 */
export async function applyCursorPermissions(opts) {
  const policy = await buildPolicy(opts.preset, {
    serverName: opts.serverName,
    allowTools: opts.allowTools
  });
  const allowlist = await toCursorAllowlist(policy);
  const permissionsPath = resolveCursorPermissionsPath();

  let existing = null;
  if (existsSync(permissionsPath)) {
    try {
      existing = JSON.parse(readFileSync(permissionsPath, "utf8"));
    } catch {
      return {
        ok: false,
        message: `Could not parse ${permissionsPath}`
      };
    }
  }

  const merged = mergeCursorPermissionsJson(existing, allowlist, {
    force: opts.force ?? false,
    serverNames: [opts.serverName, "ghostcrab"]
  });

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      permissionsPath,
      doc: merged,
      allowCount: allowlist.length
    };
  }

  mkdirSync(dirname(permissionsPath), { recursive: true });
  writeFileSync(permissionsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return {
    ok: true,
    permissionsPath,
    allowCount: allowlist.length,
    message: `Wrote Cursor mcpAllowlist (${opts.preset}) to ${permissionsPath}`
  };
}

export { PKG_ROOT };
