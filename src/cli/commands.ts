import type { ParseArgsConfig } from "node:util";

export interface CliCommand {
  cliName: string;
  mcpToolName: string;
  description: string;
  parseArgsOptions: NonNullable<ParseArgsConfig["options"]>;
  subcommand?: string;
}

export const CLI_COMMANDS: CliCommand[] = [
  {
    cliName: "search",
    mcpToolName: "ghostcrab_search",
    description: "Search persistent memory with keyword + facet filters",
    parseArgsOptions: {
      query: { type: "string", short: "q" },
      "schema-id": { type: "string" },
      filters: { type: "string" },
      limit: { type: "string" },
      mode: { type: "string" }
    }
  },
  {
    cliName: "remember",
    mcpToolName: "ghostcrab_remember",
    description: "Store a fact or observation in persistent memory",
    parseArgsOptions: {
      content: { type: "string", short: "c" },
      "schema-id": { type: "string" },
      facets: { type: "string" },
      "created-by": { type: "string" },
      "valid-until": { type: "string" }
    }
  },
  {
    cliName: "count",
    mcpToolName: "ghostcrab_count",
    description: "Count items grouped by facet dimensions",
    parseArgsOptions: {
      "schema-id": { type: "string" },
      "group-by": { type: "string", multiple: true },
      filters: { type: "string" }
    }
  },
  {
    cliName: "upsert",
    mcpToolName: "ghostcrab_upsert",
    description: "Update or create a record by exact match",
    parseArgsOptions: {
      "schema-id": { type: "string" },
      match: { type: "string" },
      "set-content": { type: "string" },
      "set-facets": { type: "string" },
      "created-by": { type: "string" },
      "valid-until": { type: "string" },
      "create-if-missing": { type: "boolean" }
    }
  },
  {
    cliName: "schema",
    subcommand: "list",
    mcpToolName: "ghostcrab_schema_list",
    description: "List registered schemas",
    parseArgsOptions: {
      target: { type: "string" }
    }
  },
  {
    cliName: "schema",
    subcommand: "inspect",
    mcpToolName: "ghostcrab_schema_inspect",
    description: "Inspect a schema by ID",
    parseArgsOptions: {
      "schema-id": { type: "string" }
    }
  },
  {
    cliName: "schema",
    subcommand: "register",
    mcpToolName: "ghostcrab_schema_register",
    description: "Register a new schema",
    parseArgsOptions: {
      target: { type: "string" },
      definition: { type: "string" }
    }
  },
  {
    cliName: "coverage",
    mcpToolName: "ghostcrab_coverage",
    description: "Check epistemic coverage for a domain",
    parseArgsOptions: {
      domain: { type: "string" },
      "agent-id": { type: "string" }
    }
  },
  {
    cliName: "traverse",
    mcpToolName: "ghostcrab_traverse",
    description: "Traverse the knowledge graph from a start node",
    parseArgsOptions: {
      start: { type: "string" },
      direction: { type: "string" },
      "edge-labels": { type: "string", multiple: true },
      depth: { type: "string" },
      target: { type: "string" }
    }
  },
  {
    cliName: "learn",
    mcpToolName: "ghostcrab_learn",
    description: "Upsert knowledge nodes and graph edges",
    parseArgsOptions: {
      node: { type: "string" },
      edge: { type: "string" }
    }
  },
  {
    cliName: "pack",
    mcpToolName: "ghostcrab_pack",
    description: "Build a compact working-memory pack",
    parseArgsOptions: {
      query: { type: "string", short: "q" },
      "agent-id": { type: "string" },
      scope: { type: "string" },
      limit: { type: "string" }
    }
  },
  {
    cliName: "project",
    mcpToolName: "ghostcrab_project",
    description: "Create or refresh a provisional projection",
    parseArgsOptions: {
      scope: { type: "string" },
      content: { type: "string", short: "c" },
      "proj-type": { type: "string" },
      status: { type: "string" },
      weight: { type: "string" },
      "activity-family": { type: "string" },
      "agent-id": { type: "string" },
      provisional: { type: "boolean" }
    }
  },
  {
    cliName: "status",
    mcpToolName: "ghostcrab_status",
    description: "Return an operational snapshot with directives",
    parseArgsOptions: {
      "agent-id": { type: "string" }
    }
  }
];

export function resolveCommand(argv: string[]): CliCommand | undefined {
  const [cmd, sub] = argv;
  if (!cmd) {
    return undefined;
  }

  const withSub = CLI_COMMANDS.find(
    (c) => c.cliName === cmd && c.subcommand === sub
  );
  if (withSub) {
    return withSub;
  }

  return CLI_COMMANDS.find((c) => c.cliName === cmd && !c.subcommand);
}
