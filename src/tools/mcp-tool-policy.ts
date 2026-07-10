import { classifyToolAccess, getBasicToolNames } from "./catalog.js";
import { EXPECTED_TOOL_NAMES } from "./tool-manifest.js";

export type ToolPermissionPreset =
  | "none"
  | "all"
  | "basic"
  | "read"
  | "balanced"
  | "custom";

export interface ToolRef {
  serverName: string;
  toolName?: string;
}

export interface ToolPermissionPolicy {
  allow: ToolRef[];
  ask: ToolRef[];
  deny: ToolRef[];
}

export const DESTRUCTIVE_TOOL_NAMES = [
  "ghostcrab_workspace_delete",
  "ghostcrab_workspace_reset",
  "ghostcrab_ddl_execute",
  "ghostcrab_graph_gap_rules_delete"
] as const;

const READ_ACCESS = new Set(["bootstrap", "read", "guide", "session"]);

export function getToolAccessForName(name: string): string {
  return classifyToolAccess(name);
}

export function formatClaudeMcpRule(
  serverName: string,
  toolName?: string
): string {
  if (!toolName) {
    return `mcp__${serverName}`;
  }
  return `mcp__${serverName}__${toolName}`;
}

export function formatCursorMcpRule(
  serverName: string,
  toolName?: string
): string {
  if (!toolName) {
    return `${serverName}:*`;
  }
  return `${serverName}:${toolName}`;
}

function toolRef(serverName: string, toolName?: string): ToolRef {
  return toolName ? { serverName, toolName } : { serverName };
}

function isDestructive(name: string): boolean {
  return (DESTRUCTIVE_TOOL_NAMES as readonly string[]).includes(name);
}

export interface BuildToolPermissionPresetOptions {
  serverName?: string;
  allowTools?: string[];
  askTools?: string[];
}

export function buildToolPermissionPreset(
  preset: ToolPermissionPreset,
  opts: BuildToolPermissionPresetOptions = {}
): ToolPermissionPolicy {
  const serverName = opts.serverName ?? "ghostcrab-personal-mcp";

  if (preset === "none") {
    return { allow: [], ask: [], deny: [] };
  }

  if (preset === "all") {
    return {
      allow: [toolRef(serverName)],
      ask: [],
      deny: []
    };
  }

  if (preset === "basic") {
    return {
      allow: getBasicToolNames().map((name) => toolRef(serverName, name)),
      ask: [],
      deny: []
    };
  }

  if (preset === "custom") {
    const allowTools = opts.allowTools ?? [];
    const askTools = opts.askTools ?? [];
    return {
      allow: allowTools.map((name) => toolRef(serverName, name)),
      ask: askTools.map((name) => toolRef(serverName, name)),
      deny: []
    };
  }

  if (preset === "read") {
    const allow = EXPECTED_TOOL_NAMES.filter((name) =>
      READ_ACCESS.has(classifyToolAccess(name))
    ).map((name) => toolRef(serverName, name));
    const ask = EXPECTED_TOOL_NAMES.filter(
      (name) =>
        classifyToolAccess(name) === "write" ||
        classifyToolAccess(name) === "model"
    ).map((name) => toolRef(serverName, name));
    return { allow, ask, deny: [] };
  }

  if (preset === "balanced") {
    const destructiveSet = new Set<string>(DESTRUCTIVE_TOOL_NAMES);
    const allow = EXPECTED_TOOL_NAMES.filter(
      (name) => !isDestructive(name)
    ).map((name) => toolRef(serverName, name));
    const ask = [...destructiveSet].map((name) => toolRef(serverName, name));
    return { allow, ask, deny: [] };
  }

  throw new Error(`Unknown permission preset: ${preset}`);
}

export function policyToClaudePermissions(policy: ToolPermissionPolicy): {
  allow: string[];
  ask: string[];
  deny: string[];
} {
  return {
    allow: policy.allow.map((ref) =>
      formatClaudeMcpRule(ref.serverName, ref.toolName)
    ),
    ask: policy.ask.map((ref) =>
      formatClaudeMcpRule(ref.serverName, ref.toolName)
    ),
    deny: policy.deny.map((ref) =>
      formatClaudeMcpRule(ref.serverName, ref.toolName)
    )
  };
}

export function policyToCursorMcpAllowlist(
  policy: ToolPermissionPolicy
): string[] {
  return policy.allow.map((ref) =>
    formatCursorMcpRule(ref.serverName, ref.toolName)
  );
}
