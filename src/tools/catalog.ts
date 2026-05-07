import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export type ToolAccess =
  | "bootstrap"
  | "read"
  | "write"
  | "model"
  | "guide"
  | "session";

export type ToolSubsystem =
  | "facets"
  | "graph"
  | "loadout"
  | "ontology"
  | "pragma"
  | "session"
  | "workspace";

export type ToolVisibility = "basic" | "extended";

export interface ToolCatalogEntry {
  access: ToolAccess;
  arguments: ToolArgumentSummary[];
  description: string;
  name: string;
  required_arguments: string[];
  searchable_text: string;
  subsystem: ToolSubsystem;
  visibility: ToolVisibility;
}

export interface ToolArgumentSummary {
  description: string;
  name: string;
  required: boolean;
  type: string;
}

const BASIC_LISTED_TOOL_NAMES = [
  "ghostcrab_status",
  "ghostcrab_search",
  "ghostcrab_count",
  "ghostcrab_remember",
  "ghostcrab_upsert",
  "ghostcrab_schema_list",
  "ghostcrab_schema_inspect",
  "ghostcrab_pack",
  "ghostcrab_project",
  "ghostcrab_modeling_guidance",
  "ghostcrab_tool_search"
] as const;

const BASIC_LISTED_TOOL_SET = new Set<string>(BASIC_LISTED_TOOL_NAMES);

export interface ToolSearchFilters {
  access?: ToolAccess[];
  name_prefix?: string;
  subsystem?: ToolSubsystem[];
  visibility?: ToolVisibility[];
}

export function listBasicRegisteredTools(tools: Tool[]): Tool[] {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return BASIC_LISTED_TOOL_NAMES.flatMap((name) => {
    const tool = byName.get(name);
    return tool ? [tool] : [];
  });
}

export function buildToolCatalog(tools: Tool[]): ToolCatalogEntry[] {
  return tools.map((tool) => {
    const access = classifyAccess(tool.name);
    const subsystem = classifySubsystem(tool.name);
    const visibility: ToolVisibility = BASIC_LISTED_TOOL_SET.has(tool.name)
      ? "basic"
      : "extended";
    const argumentsSummary = summarizeArguments(tool);
    const requiredArguments = argumentsSummary
      .filter((argument) => argument.required)
      .map((argument) => argument.name);
    const searchableParts = [
      tool.name,
      tool.description ?? "",
      access,
      subsystem,
      visibility,
      ...argumentsSummary.flatMap((argument) => [
        argument.name,
        argument.type,
        argument.description
      ])
    ];

    return {
      access,
      arguments: argumentsSummary,
      description: tool.description ?? "",
      name: tool.name,
      required_arguments: requiredArguments,
      searchable_text: searchableParts
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
      subsystem,
      visibility
    };
  });
}

export function searchToolCatalog(
  entries: ToolCatalogEntry[],
  query: string,
  filters: ToolSearchFilters,
  limit: number
): Array<ToolCatalogEntry & { score: number }> {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  const candidates = entries.filter((entry) => matchesFilters(entry, filters));
  const documentFrequency = new Map<string, number>();

  for (const term of queryTerms) {
    let count = 0;
    for (const entry of candidates) {
      if (entry.searchable_text.includes(term)) {
        count += 1;
      }
    }
    documentFrequency.set(term, count);
  }

  const scored = candidates
    .map((entry) => ({
      ...entry,
      score:
        queryTerms.length === 0
          ? defaultBrowseScore(entry)
          : bm25LikeScore(entry, queryTerms, documentFrequency, candidates.length)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.visibility !== right.visibility) {
        return left.visibility === "basic" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

  return scored.slice(0, limit);
}

export function getBasicToolNames(): string[] {
  return [...BASIC_LISTED_TOOL_NAMES];
}

function classifyAccess(name: string): ToolAccess {
  if (name === "ghostcrab_status") {
    return "bootstrap";
  }

  if (name === "ghostcrab_modeling_guidance") {
    return "guide";
  }

  if (name === "ghostcrab_workspace_use") {
    return "session";
  }

  if (
    name.includes("_remember") ||
    name.includes("_learn") ||
    name.includes("_upsert") ||
    name.includes("_patch") ||
    name.includes("_register") ||
    name.includes("_create") ||
    name.includes("_apply") ||
    name.includes("_seed") ||
    name.includes("_instantiate") ||
    name.includes("_checkpoint") ||
    name.includes("_bridge")
  ) {
    return "write";
  }

  if (
    name.includes("_project") ||
    name.includes("_ddl_") ||
    name.includes("_compare") ||
    name.includes("_conflicts")
  ) {
    return "model";
  }

  return "read";
}

function classifySubsystem(name: string): ToolSubsystem {
  if (name.startsWith("ghostcrab_loadout_")) {
    return "loadout";
  }

  if (
    name.startsWith("ghostcrab_workspace_") ||
    name.startsWith("ghostcrab_ddl_")
  ) {
    return name === "ghostcrab_workspace_use" ? "session" : "workspace";
  }

  if (
    name.startsWith("ghostcrab_ontology_") ||
    name.startsWith("ghostcrab_federated_") ||
    name.startsWith("ghostcrab_ingest_") ||
    name.startsWith("ghostcrab_project_template_") ||
    name.startsWith("ghostcrab_project_instantiate") ||
    name.startsWith("ghostcrab_project_checkpoint")
  ) {
    return "ontology";
  }

  if (
    name.startsWith("ghostcrab_traverse") ||
    name.startsWith("ghostcrab_coverage") ||
    name.startsWith("ghostcrab_learn") ||
    name.startsWith("ghostcrab_patch") ||
    name.startsWith("ghostcrab_marketplace")
  ) {
    return "graph";
  }

  if (
    name.startsWith("ghostcrab_status") ||
    name.startsWith("ghostcrab_pack") ||
    name.startsWith("ghostcrab_projection") ||
    name.startsWith("ghostcrab_project") ||
    name.startsWith("ghostcrab_modeling_guidance")
  ) {
    return "pragma";
  }

  return "facets";
}

function summarizeArguments(tool: Tool): ToolArgumentSummary[] {
  const schema = tool.inputSchema;
  const properties =
    schema && typeof schema === "object" && "properties" in schema
      ? (schema.properties as Record<string, unknown>)
      : {};
  const required =
    schema && typeof schema === "object" && "required" in schema
      ? new Set(
          Array.isArray(schema.required)
            ? schema.required.filter(
                (value): value is string => typeof value === "string"
              )
            : []
        )
      : new Set<string>();

  return Object.entries(properties).map(([name, property]) => {
    const shape =
      property && typeof property === "object"
        ? (property as Record<string, unknown>)
        : {};
    const type = normalizePropertyType(shape.type, shape.enum);

    return {
      description:
        typeof shape.description === "string" ? shape.description : "",
      name,
      required: required.has(name),
      type
    };
  });
}

function normalizePropertyType(
  type: unknown,
  enumValues: unknown
): string {
  if (typeof type === "string") {
    return type;
  }

  if (Array.isArray(type) && type.every((value) => typeof value === "string")) {
    return type.join("|");
  }

  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return "enum";
  }

  return "unknown";
}

function matchesFilters(
  entry: ToolCatalogEntry,
  filters: ToolSearchFilters
): boolean {
  if (
    filters.visibility &&
    filters.visibility.length > 0 &&
    !filters.visibility.includes(entry.visibility)
  ) {
    return false;
  }

  if (
    filters.access &&
    filters.access.length > 0 &&
    !filters.access.includes(entry.access)
  ) {
    return false;
  }

  if (
    filters.subsystem &&
    filters.subsystem.length > 0 &&
    !filters.subsystem.includes(entry.subsystem)
  ) {
    return false;
  }

  if (filters.name_prefix) {
    const prefix = filters.name_prefix.trim().toLowerCase();
    if (prefix.length > 0 && !entry.name.toLowerCase().startsWith(prefix)) {
      return false;
    }
  }

  return true;
}

function defaultBrowseScore(entry: ToolCatalogEntry): number {
  return entry.visibility === "basic" ? 1 : 0.5;
}

function bm25LikeScore(
  entry: ToolCatalogEntry,
  queryTerms: string[],
  documentFrequency: Map<string, number>,
  totalDocuments: number
): number {
  let score = 0;
  const searchableText = entry.searchable_text;
  const nameLower = entry.name.toLowerCase();
  const descriptionLower = entry.description.toLowerCase();

  for (const term of queryTerms) {
    const frequency = countOccurrences(searchableText, term);
    if (frequency === 0) {
      continue;
    }

    const docFrequency = documentFrequency.get(term) ?? 0;
    const inverseDocumentFrequency = Math.log(
      1 + (totalDocuments - docFrequency + 0.5) / (docFrequency + 0.5)
    );

    score += frequency * inverseDocumentFrequency;

    if (nameLower.includes(term)) {
      score += 2.5;
    }

    if (descriptionLower.includes(term)) {
      score += 1.25;
    }
  }

  if (entry.visibility === "basic") {
    score += 0.15;
  }

  return score;
}

function countOccurrences(text: string, term: string): number {
  if (term.length === 0) {
    return 0;
  }

  let count = 0;
  let offset = 0;

  while (offset < text.length) {
    const index = text.indexOf(term, offset);
    if (index === -1) {
      break;
    }

    count += 1;
    offset = index + term.length;
  }

  return count;
}
