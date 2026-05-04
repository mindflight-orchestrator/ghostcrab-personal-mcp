#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ghostcrabRoot = resolveSiblingGhostCrabRoot();
const strictMode = process.argv.includes("--strict");

const errors = [];
const warnings = [];
const infos = [];

const REQUIRED_DIRECTORIES = [
  "codex",
  "codex/ghostcrab-memory",
  "codex/ghostcrab-prompt-guide",
  "codex/ghostcrab-data-architect",
  "shared",
  "shared/demo-profiles",
  "openclaw/ghostcrab-memory",
  "openclaw/ghostcrab-epistemic-agent",
  "claude-code/self-memory/.claude",
  "claude-code/data-architect/templates",
  "claude-code/data-architect/examples/project-management",
  "claude-code/data-architect/examples/crm",
  "claude-code/data-architect/examples/knowledge-base",
  "openclaw/scenarios",
  "scripts",
  "cursor",
  "cursor/rules"
];

const REQUIRED_FILES = [
  "README.md",
  "GHOSTCRAB_INTEGRATION.md",
  "CAPABILITIES.md",
  "SERVER_INSTRUCTIONS.md",
  "MCP_TOOL_DESCRIPTION_PATCHES.md",
  "package.json",
  "shared/ONBOARDING_CONTRACT.md",
  "cursor/README.md",
  "cursor/rules/ghostcrab-memory.mdc",
  "codex/README.md",
  "codex/ghostcrab-memory/SKILL.md",
  "codex/ghostcrab-prompt-guide/SKILL.md",
  "codex/ghostcrab-data-architect/SKILL.md",
  "shared/SCHEMA_DESIGN.md",
  "shared/PATH_CONTENT_FACETS.md",
  "shared/QUERY_PATTERNS.md",
  "shared/APP_PATTERNS.md",
  "shared/TRANSITION_LOGGING.md",
  "shared/DEMO_CHOOSER.md",
  "shared/bootstrap_seed.jsonl",
  "shared/demo-profiles/codebase-intelligence.jsonl",
  "shared/demo-profiles/compliance-audit.jsonl",
  "shared/demo-profiles/crm-pipeline.jsonl",
  "shared/demo-profiles/knowledge-base.jsonl",
  "shared/demo-profiles/project-delivery.jsonl",
  "shared/demo-profiles/incident-response.jsonl",
  "shared/demo-profiles/software-delivery.jsonl",
  "openclaw/ghostcrab-memory/README.md",
  "openclaw/ghostcrab-memory/mcp.json",
  "openclaw/ghostcrab-memory/SKILL.md",
  "openclaw/ghostcrab-memory/SCHEMA_DESIGN.md",
  "openclaw/ghostcrab-memory/QUERY_PATTERNS.md",
  "openclaw/ghostcrab-memory/APP_PATTERNS.md",
  "openclaw/ghostcrab-epistemic-agent/README.md",
  "openclaw/ghostcrab-epistemic-agent/SOUL.md",
  "openclaw/ghostcrab-epistemic-agent/AGENTS.md",
  "openclaw/ghostcrab-epistemic-agent/HEARTBEAT.md",
  "openclaw/ghostcrab-epistemic-agent/WORKING.md",
  "openclaw/scenarios/codebase-intelligence.md",
  "openclaw/scenarios/compliance-audit.md",
  "openclaw/scenarios/crm-pipeline.md",
  "openclaw/scenarios/incident-response.md",
  "openclaw/scenarios/knowledge-base.md",
  "openclaw/scenarios/out-of-domain.md",
  "openclaw/scenarios/project-delivery.md",
  "openclaw/scenarios/software-delivery.md",
  "claude-code/self-memory/README.md",
  "claude-code/self-memory/CLAUDE.md",
  "claude-code/self-memory/.mcp.json",
  "claude-code/self-memory/.claude/settings.json",
  "claude-code/data-architect/README.md",
  "claude-code/data-architect/CLAUDE.md",
  "claude-code/data-architect/SCHEMA_DESIGN_PROJECT.md",
  "claude-code/data-architect/templates/domain.schema.json",
  "claude-code/data-architect/templates/migration.sql.tpl",
  "claude-code/data-architect/templates/types.ts.tpl",
  "claude-code/data-architect/examples/project-management/README.md",
  "claude-code/data-architect/examples/crm/README.md",
  "claude-code/data-architect/examples/knowledge-base/README.md",
  "scripts/build-bootstrap-seed.mjs",
  "scripts/choose-demo.mjs",
  "scripts/validate-skills.mjs"
];

const PROFILE_ENTRYPOINTS = new Set([
  "openclaw/ghostcrab-memory",
  "openclaw/ghostcrab-epistemic-agent",
  "claude-code/self-memory",
  "claude-code/data-architect"
]);
const ENTRYPOINT_CAPABILITIES = new Map([
  [
    "openclaw/ghostcrab-memory",
    new Set([
      "ghostcrab_status",
      "ghostcrab_search",
      "ghostcrab_pack",
      "ghostcrab_count",
      "ghostcrab_remember",
      "ghostcrab_learn",
      "ghostcrab_traverse",
      "ghostcrab_coverage"
    ])
  ],
  [
    "openclaw/ghostcrab-epistemic-agent",
    new Set([
      "ghostcrab_status",
      "ghostcrab_search",
      "ghostcrab_pack",
      "ghostcrab_count",
      "ghostcrab_remember",
      "ghostcrab_learn",
      "ghostcrab_traverse",
      "ghostcrab_coverage"
    ])
  ],
  [
    "claude-code/self-memory",
    new Set([
      "ghostcrab_status",
      "ghostcrab_search",
      "ghostcrab_pack",
      "ghostcrab_remember",
      "ghostcrab_learn",
      "ghostcrab_coverage"
    ])
  ],
  [
    "claude-code/data-architect",
    new Set([
      "ghostcrab_status",
      "ghostcrab_search",
      "ghostcrab_pack",
      "ghostcrab_count",
      "ghostcrab_schema_list",
      "ghostcrab_schema_inspect",
      "ghostcrab_schema_register"
    ])
  ]
]);

const VALID_ENV_TOKEN_PATTERN = /^\$\{[A-Z0-9_]+(?::-?[^}]*)?\}$/;
const ALL_ENV_TOKENS_PATTERN = /\$\{[^}]+\}/g;

function relativeRepoPath(targetPath) {
  return path.relative(repoRoot, targetPath) || ".";
}

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function resolveSiblingGhostCrabRoot() {
  if (process.env.GHOSTCRAB_REPO_ROOT) {
    return path.resolve(process.env.GHOSTCRAB_REPO_ROOT);
  }

  const embeddedProductRepo = path.resolve(path.join(repoRoot, ".."));
  if (
    exists(path.join(embeddedProductRepo, "package.json")) &&
    exists(path.join(embeddedProductRepo, "src")) &&
    exists(path.join(embeddedProductRepo, "dist"))
  ) {
    return embeddedProductRepo;
  }

  const preferred = path.join(repoRoot, "..", "ghostcrab");
  if (exists(preferred)) {
    return path.resolve(preferred);
  }

  const localMcpRepo = path.join(repoRoot, "..", "ghostcrab-mcp");
  if (exists(localMcpRepo)) {
    return path.resolve(localMcpRepo);
  }

  // Historical local fallback.
  return path.resolve(path.join(repoRoot, "..", "strata"));
}

function readFile(targetPath) {
  return fs.readFileSync(targetPath, "utf8");
}

function walkFiles(rootDir) {
  const results = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
      continue;
    }

    results.push(fullPath);
  }
  return results;
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function addInfo(message) {
  infos.push(message);
}

function assertRequiredPaths() {
  for (const relativePath of REQUIRED_DIRECTORIES) {
    const fullPath = path.join(repoRoot, relativePath);
    if (!exists(fullPath) || !fs.statSync(fullPath).isDirectory()) {
      addError(`Missing required directory: ${relativePath}`);
    }
  }

  for (const relativePath of REQUIRED_FILES) {
    const fullPath = path.join(repoRoot, relativePath);
    if (!exists(fullPath) || !fs.statSync(fullPath).isFile()) {
      addError(`Missing required file: ${relativePath}`);
    }
  }
}

function validateEnvPlaceholders(filePath, content) {
  const matches = content.match(ALL_ENV_TOKENS_PATTERN) ?? [];
  for (const match of matches) {
    if (!VALID_ENV_TOKEN_PATTERN.test(match)) {
      addError(`Invalid env placeholder syntax in ${relativeRepoPath(filePath)}: ${match}`);
    }
  }
}

function validateJsonFiles() {
  const jsonFiles = walkFiles(repoRoot).filter((filePath) => filePath.endsWith(".json"));

  for (const filePath of jsonFiles) {
    let parsed;
    try {
      parsed = JSON.parse(readFile(filePath));
    } catch (error) {
      addError(`Invalid JSON in ${relativeRepoPath(filePath)}: ${error.message}`);
      continue;
    }

    validateEnvPlaceholders(filePath, readFile(filePath));
    const relativePath = relativeRepoPath(filePath);

    if (relativePath.endsWith(".mcp.json") || relativePath.endsWith("/mcp.json")) {
      validateMcpConfig(relativePath, parsed);
    }

    if (relativePath.endsWith(".claude/settings.json")) {
      validateClaudeSettings(relativePath, parsed);
    }

    if (relativePath.endsWith("domain.schema.json")) {
      validateDomainSchema(relativePath, parsed);
    }
  }
}

function validateMcpConfig(relativePath, parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    addError(`${relativePath} must contain an object.`);
    return;
  }

  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) {
    addError(`${relativePath} must define mcpServers.`);
    return;
  }

  const serverEntries = Object.entries(parsed.mcpServers);
  if (serverEntries.length === 0) {
    addError(`${relativePath} must declare at least one MCP server.`);
    return;
  }

  for (const [serverName, serverConfig] of serverEntries) {
    if (!serverConfig || typeof serverConfig !== "object" || Array.isArray(serverConfig)) {
      addError(`${relativePath} server ${serverName} must be an object.`);
      continue;
    }

    if (typeof serverConfig.command !== "string" || serverConfig.command.trim() === "") {
      addError(`${relativePath} server ${serverName} must define a non-empty command.`);
    }

    if ("args" in serverConfig) {
      if (!Array.isArray(serverConfig.args) || serverConfig.args.some((value) => typeof value !== "string")) {
        addError(`${relativePath} server ${serverName} args must be an array of strings.`);
      }
    }

    if ("env" in serverConfig) {
      if (
        !serverConfig.env ||
        typeof serverConfig.env !== "object" ||
        Array.isArray(serverConfig.env) ||
        Object.values(serverConfig.env).some((value) => typeof value !== "string")
      ) {
        addError(`${relativePath} server ${serverName} env must be an object of strings.`);
      }
    }
  }
}

function validateClaudeSettings(relativePath, parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    addError(`${relativePath} must contain an object.`);
    return;
  }

  if (!parsed.hooks || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) {
    addError(`${relativePath} must define hooks as an object.`);
    return;
  }

  for (const [hookEvent, hookGroups] of Object.entries(parsed.hooks)) {
    if (!Array.isArray(hookGroups)) {
      addError(`${relativePath} hook event ${hookEvent} must be an array.`);
      continue;
    }

    for (const [groupIndex, group] of hookGroups.entries()) {
      if (!group || typeof group !== "object" || Array.isArray(group)) {
        addError(`${relativePath} hook group ${hookEvent}[${groupIndex}] must be an object.`);
        continue;
      }

      if (typeof group.matcher !== "string" || group.matcher.trim() === "") {
        addError(`${relativePath} hook group ${hookEvent}[${groupIndex}] requires matcher.`);
      }

      if (!Array.isArray(group.hooks) || group.hooks.length === 0) {
        addError(`${relativePath} hook group ${hookEvent}[${groupIndex}] requires hooks.`);
        continue;
      }

      for (const [hookIndex, hook] of group.hooks.entries()) {
        if (!hook || typeof hook !== "object" || Array.isArray(hook)) {
          addError(
            `${relativePath} hook ${hookEvent}[${groupIndex}].hooks[${hookIndex}] must be an object.`
          );
          continue;
        }

        if (typeof hook.type !== "string" || hook.type.trim() === "") {
          addError(
            `${relativePath} hook ${hookEvent}[${groupIndex}].hooks[${hookIndex}] requires type.`
          );
        }

        if (typeof hook.command !== "string" || hook.command.trim() === "") {
          addError(
            `${relativePath} hook ${hookEvent}[${groupIndex}].hooks[${hookIndex}] requires command.`
          );
        }
      }
    }
  }
}

function validateDomainSchema(relativePath, parsed) {
  for (const field of ["schema_id", "description"]) {
    if (typeof parsed[field] !== "string" || parsed[field].trim() === "") {
      addError(`${relativePath} requires non-empty string field ${field}.`);
    }
  }

  for (const field of ["required_facets", "optional_facets"]) {
    if (!parsed[field] || typeof parsed[field] !== "object" || Array.isArray(parsed[field])) {
      addError(`${relativePath} requires object field ${field}.`);
    }
  }

  if (
    !Array.isArray(parsed.retrieval_patterns) ||
    parsed.retrieval_patterns.some((value) => typeof value !== "string")
  ) {
    addError(`${relativePath} requires retrieval_patterns as an array of strings.`);
  }
}

function validateMarkdownLinks() {
  const markdownFiles = walkFiles(repoRoot).filter((filePath) => filePath.endsWith(".md"));
  for (const filePath of markdownFiles) {
    const content = readFile(filePath);
    const relativePath = relativeRepoPath(filePath);
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const rawTarget = match[1].trim();
      if (
        rawTarget.startsWith("http://") ||
        rawTarget.startsWith("https://") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("#")
      ) {
        continue;
      }

      if (rawTarget.startsWith("/Users/") || rawTarget.startsWith("file://")) {
        addError(`${relativePath} uses a machine-local link: ${rawTarget}`);
        continue;
      }

      const targetWithoutAnchor = rawTarget.split("#")[0];
      if (targetWithoutAnchor === "") {
        continue;
      }

      const resolvedPath = path.resolve(path.dirname(filePath), targetWithoutAnchor);
      if (!exists(resolvedPath)) {
        addError(`${relativePath} links to missing target: ${rawTarget}`);
      }
    }
  }
}

function validatePortableSeedFiles() {
  const aggregatePath = path.join(repoRoot, "shared", "bootstrap_seed.jsonl");
  const profilesDir = path.join(repoRoot, "shared", "demo-profiles");
  const allowedProfileFiles = [
    "codebase-intelligence.jsonl",
    "compliance-audit.jsonl",
    "crm-pipeline.jsonl",
    "incident-response.jsonl",
    "knowledge-base.jsonl",
    "project-delivery.jsonl",
    "software-delivery.jsonl"
  ];

  const allEntries = [];
  const profileIds = new Set();
  const referencedProfileIds = new Set();

  if (!exists(aggregatePath)) {
    addError("Missing shared/bootstrap_seed.jsonl aggregate seed file.");
    return [];
  }

  if (!exists(profilesDir)) {
    addError("Missing shared/demo-profiles directory.");
    return [];
  }

  const profileFiles = fs
    .readdirSync(profilesDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort();

  const unexpectedFiles = profileFiles.filter(
    (name) => !allowedProfileFiles.includes(name)
  );
  const missingFiles = allowedProfileFiles.filter(
    (name) => !profileFiles.includes(name)
  );

  if (unexpectedFiles.length > 0) {
    addError(
      `shared/demo-profiles contains unexpected file(s): ${unexpectedFiles.join(", ")}.`
    );
  }

  if (missingFiles.length > 0) {
    addError(`shared/demo-profiles is missing file(s): ${missingFiles.join(", ")}.`);
  }

  if (profileFiles.length === 0) {
    addError("shared/demo-profiles must contain at least one .jsonl profile file.");
    return [];
  }

  const aggregateContent = readFile(aggregatePath).trim();
  const builtAggregate = allowedProfileFiles
    .filter((name) => profileFiles.includes(name))
    .map((name) => readFile(path.join(profilesDir, name)).trim())
    .join("\n")
    .trim();

  if (aggregateContent !== builtAggregate) {
    addError(
      "shared/bootstrap_seed.jsonl is out of sync with shared/demo-profiles/*.jsonl. Run `npm run build:seed`."
    );
  }

  const aggregateEntries = parseSeedFile(
    aggregatePath,
    "shared/bootstrap_seed.jsonl",
    profileIds,
    referencedProfileIds
  );
  allEntries.push(...aggregateEntries);

  for (const profileFile of profileFiles) {
    const seedPath = path.join(profilesDir, profileFile);
    const entries = parseSeedFile(
      seedPath,
      `shared/demo-profiles/${profileFile}`,
      null,
      null
    );

    const profileEntry = entries.find((entry) => entry.kind === "profile");
    if (!profileEntry) {
      addError(`shared/demo-profiles/${profileFile} must contain a profile entry.`);
      continue;
    }

    if (entries.filter((entry) => entry.kind === "profile").length !== 1) {
      addError(`shared/demo-profiles/${profileFile} must contain exactly one profile entry.`);
    }

    const distinctProfileIds = new Set(entries.map((entry) => entry.profile_id));
    if (distinctProfileIds.size !== 1) {
      addError(
        `shared/demo-profiles/${profileFile} must only contain entries for a single profile_id.`
      );
    }

    const expectedFileStem = path.basename(profileFile, ".jsonl");
    if (profileEntry.profile_id !== expectedFileStem) {
      addError(
        `shared/demo-profiles/${profileFile} profile_id must match filename stem ${expectedFileStem}.`
      );
    }
  }

  for (const profileId of referencedProfileIds) {
    if (!profileIds.has(profileId)) {
      addError(
        `shared/bootstrap_seed.jsonl references profile_id ${profileId} without a profile line.`
      );
    }
  }

  return allEntries;
}

function parseSeedFile(seedPath, label, profileIds, referencedProfileIds) {
  const entries = [];

  for (const [index, rawLine] of readFile(seedPath).split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      addError(`${label}:${lineNumber} invalid JSON: ${error.message}`);
      continue;
    }

    entries.push(parsed);
    if (!parsed.kind || typeof parsed.kind !== "string") {
      addError(`${label}:${lineNumber} missing kind.`);
      continue;
    }

    if (!parsed.profile_id || typeof parsed.profile_id !== "string") {
      addError(`${label}:${lineNumber} missing profile_id.`);
      continue;
    }

    referencedProfileIds?.add(parsed.profile_id);

    switch (parsed.kind) {
      case "profile":
        validateProfileLine(parsed, lineNumber, profileIds, label);
        break;
      case "remember":
        validateRememberLine(parsed, lineNumber, label);
        break;
      case "learn_node":
        validateLearnNodeLine(parsed, lineNumber, label);
        break;
      case "learn_edge":
        validateLearnEdgeLine(parsed, lineNumber, label);
        break;
      case "projection":
        validateProjectionLine(parsed, lineNumber, label);
        break;
      default:
        addError(`${label}:${lineNumber} unsupported kind ${parsed.kind}.`);
    }
  }

  return entries;
}

function validateProfileLine(parsed, lineNumber, profileIds, label) {
  for (const field of ["title", "description"]) {
    if (typeof parsed[field] !== "string" || parsed[field].trim() === "") {
      addError(`${label}:${lineNumber} profile requires ${field}.`);
    }
  }

  if (profileIds) {
    if (profileIds.has(parsed.profile_id)) {
      addError(`${label}:${lineNumber} duplicates profile ${parsed.profile_id}.`);
    }
    profileIds.add(parsed.profile_id);
  }

  if (
    !Array.isArray(parsed.recommended_entrypoints) ||
    parsed.recommended_entrypoints.length === 0 ||
    parsed.recommended_entrypoints.some((value) => typeof value !== "string")
  ) {
    addError(
      `${label}:${lineNumber} profile requires recommended_entrypoints.`
    );
  } else {
    for (const entrypoint of parsed.recommended_entrypoints) {
      if (!PROFILE_ENTRYPOINTS.has(entrypoint)) {
        addError(`${label}:${lineNumber} uses unknown entrypoint ${entrypoint}.`);
      }
    }
  }

  if (
    !Array.isArray(parsed.tags) ||
    parsed.tags.length === 0 ||
    parsed.tags.some((value) => typeof value !== "string")
  ) {
    addError(`${label}:${lineNumber} profile requires tags.`);
  }
}

function validateRememberLine(parsed, lineNumber, label) {
  if (typeof parsed.schema_id !== "string" || parsed.schema_id.trim() === "") {
    addError(`${label}:${lineNumber} remember requires schema_id.`);
  }

  if (typeof parsed.content !== "string" || parsed.content.trim() === "") {
    addError(`${label}:${lineNumber} remember requires content.`);
  }

  if (!parsed.facets || typeof parsed.facets !== "object" || Array.isArray(parsed.facets)) {
    addError(`${label}:${lineNumber} remember requires facets object.`);
  }
}

function validateLearnNodeLine(parsed, lineNumber, label) {
  if (!parsed.node || typeof parsed.node !== "object" || Array.isArray(parsed.node)) {
    addError(`${label}:${lineNumber} learn_node requires node object.`);
    return;
  }

  for (const field of ["id", "node_type", "label"]) {
    if (typeof parsed.node[field] !== "string" || parsed.node[field].trim() === "") {
      addError(`${label}:${lineNumber} learn_node requires node.${field}.`);
    }
  }

  if ("mastery" in parsed.node && typeof parsed.node.mastery !== "number") {
    addError(`${label}:${lineNumber} learn_node mastery must be numeric.`);
  }
}

function validateLearnEdgeLine(parsed, lineNumber, label) {
  if (!parsed.edge || typeof parsed.edge !== "object" || Array.isArray(parsed.edge)) {
    addError(`${label}:${lineNumber} learn_edge requires edge object.`);
    return;
  }

  for (const field of ["source", "target", "label"]) {
    if (typeof parsed.edge[field] !== "string" || parsed.edge[field].trim() === "") {
      addError(`${label}:${lineNumber} learn_edge requires edge.${field}.`);
    }
  }
}

function validateProjectionLine(parsed, lineNumber, label) {
  if (!parsed.projection || typeof parsed.projection !== "object" || Array.isArray(parsed.projection)) {
    addError(`${label}:${lineNumber} projection requires projection object.`);
    return;
  }

  for (const field of ["agent_id", "scope", "proj_type", "status", "content"]) {
    if (typeof parsed.projection[field] !== "string" || parsed.projection[field].trim() === "") {
      addError(`${label}:${lineNumber} projection requires projection.${field}.`);
    }
  }
}

function extractProductTools() {
  const toolsDir = path.join(ghostcrabRoot, "src", "tools");
  if (!exists(toolsDir)) {
    addWarning(`Sibling ghostcrab repo not found at ${ghostcrabRoot}; tool-reference checks were skipped.`);
    return new Set();
  }

  const toolFiles = walkFiles(toolsDir).filter((filePath) => filePath.endsWith(".ts"));
  const tools = new Set();

  for (const filePath of toolFiles) {
    const content = readFile(filePath);
    for (const match of content.matchAll(/name:\s*"(ghostcrab_[a-z_]+)"/g)) {
      tools.add(match[1]);
    }
  }

  addInfo(`Detected ${tools.size} public GhostCrab tools in sibling repo.`);
  return tools;
}

function extractProductContext() {
  const tools = extractProductTools();
  const packageJsonPath = path.join(ghostcrabRoot, "package.json");
  let packageName = null;

  if (!exists(packageJsonPath)) {
    addWarning(`Sibling ghostcrab package.json not found at ${packageJsonPath}.`);
  } else {
    try {
      const parsed = JSON.parse(readFile(packageJsonPath));
      packageName = parsed.name ?? null;
      if (packageName) {
        addInfo(`Detected sibling package ${packageName}.`);
      }
      if (strictMode && packageName !== "@mindflight/ghostcrab") {
        addError(
          `Strict mode expected sibling ghostcrab package name @mindflight/ghostcrab, got ${packageName ?? "unknown"}.`
        );
      }
    } catch (error) {
      addError(`Invalid sibling ghostcrab package.json: ${error.message}`);
    }
  }

  return { tools, packageName };
}

function validateToolReferences(productTools) {
  if (productTools.size === 0) {
    return;
  }

  const filesToScan = walkFiles(repoRoot).filter((filePath) =>
    [".md", ".json", ".jsonl"].some((extension) => filePath.endsWith(extension))
  );

  const references = new Map();
  for (const filePath of filesToScan) {
    const content = readFile(filePath);
    for (const match of content.matchAll(/\b(ghostcrab_[a-z_]+)\b/g)) {
      const toolName = match[1];
      if (!references.has(toolName)) {
        references.set(toolName, new Set());
      }
      references.get(toolName).add(relativeRepoPath(filePath));
    }
  }

  for (const [toolName, fileSet] of references.entries()) {
    if (!productTools.has(toolName)) {
      addError(
        `Unknown GhostCrab tool reference ${toolName} in ${Array.from(fileSet).sort().join(", ")}`
      );
    }
  }
}

function requiredToolsForSeedEntry(entry) {
  switch (entry.kind) {
    case "remember":
      return ["ghostcrab_remember", "ghostcrab_search"];
    case "learn_node":
    case "learn_edge":
      return ["ghostcrab_learn", "ghostcrab_traverse"];
    case "projection":
      return ["ghostcrab_pack", "ghostcrab_status"];
    case "profile":
      return [];
    default:
      return [];
  }
}

function validateSeedCompatibility(seedEntries, productContext) {
  if (seedEntries.length === 0) {
    addWarning("No portable seed entries found to validate against sibling ghostcrab.");
    return;
  }

  if (productContext.tools.size === 0) {
    addWarning("Seed compatibility checks were skipped because no sibling GhostCrab tool surface was detected.");
    return;
  }

  const profileKinds = new Map();
  const profileDomains = new Map();
  const profileEntryPoints = new Map();
  const allRequiredTools = new Set();

  for (const entry of seedEntries) {
    for (const tool of requiredToolsForSeedEntry(entry)) {
      allRequiredTools.add(tool);
    }

    if (!profileKinds.has(entry.profile_id)) {
      profileKinds.set(entry.profile_id, new Set());
    }
    profileKinds.get(entry.profile_id).add(entry.kind);

    if (entry.kind === "profile") {
      profileEntryPoints.set(entry.profile_id, entry.recommended_entrypoints ?? []);
      continue;
    }

    const detectedDomain = extractSeedDomain(entry);
    if (detectedDomain !== null) {
      if (!profileDomains.has(entry.profile_id)) {
        profileDomains.set(entry.profile_id, new Set());
      }
      profileDomains.get(entry.profile_id).add(detectedDomain);
    }

    if (entry.kind === "remember") {
      if (!entry.schema_id.startsWith("demo:")) {
        addError(
          `Portable seed remember entry for profile ${entry.profile_id} must use demo:* schema_id namespace.`
        );
      }
    }

    if (entry.kind === "learn_edge") {
      if (!/^[A-Z][A-Z0-9_]*$/.test(entry.edge.label)) {
        addError(
          `Portable seed learn_edge label ${entry.edge.label} for profile ${entry.profile_id} must be uppercase snake case.`
        );
      }
    }

    if (entry.kind === "projection" && !entry.projection.agent_id.startsWith("agent:demo:")) {
      addError(
        `Portable seed projection agent_id ${entry.projection.agent_id} for profile ${entry.profile_id} must start with agent:demo:.`
      );
    }
  }

  for (const toolName of allRequiredTools) {
    if (!productContext.tools.has(toolName)) {
      addError(`Portable seed compatibility requires ${toolName}, but sibling ghostcrab does not expose it.`);
    }
  }

  for (const [profileId, domains] of profileDomains.entries()) {
    if (domains.size > 1) {
      addError(
        `Portable seed profile ${profileId} mixes multiple domains: ${Array.from(domains).sort().join(", ")}.`
      );
    }
  }

  for (const [profileId, kinds] of profileKinds.entries()) {
    const entrypoints = profileEntryPoints.get(profileId) ?? [];
    if (entrypoints.length === 0) {
      addError(`Portable seed profile ${profileId} is missing recommended entrypoints.`);
      continue;
    }

    const requiredTools = new Set();
    for (const kind of kinds) {
      for (const toolName of requiredToolsForSeedEntry({ kind })) {
        requiredTools.add(toolName);
      }
    }

    const supported = entrypoints.some((entrypoint) => {
      const capabilities = ENTRYPOINT_CAPABILITIES.get(entrypoint);
      if (!capabilities) {
        return false;
      }
      return Array.from(requiredTools).every((toolName) => capabilities.has(toolName));
    });

    if (!supported) {
      addError(
        `Portable seed profile ${profileId} does not have a single recommended entrypoint that covers its required tool flow: ${Array.from(requiredTools).sort().join(", ")}.`
      );
    }

    for (const entrypoint of entrypoints) {
      const capabilities = ENTRYPOINT_CAPABILITIES.get(entrypoint);
      if (!capabilities) {
        addError(`Portable seed profile ${profileId} references unsupported entrypoint ${entrypoint}.`);
        continue;
      }

      const missingProductTools = Array.from(capabilities).filter(
        (toolName) => !productContext.tools.has(toolName)
      );
      if (missingProductTools.length > 0) {
        addError(
          `Entry point ${entrypoint} for profile ${profileId} expects missing sibling GhostCrab tools: ${missingProductTools.sort().join(", ")}.`
        );
      }
    }
  }
}

function extractSeedDomain(entry) {
  if (entry.kind === "remember") {
    return typeof entry.facets?.domain === "string" ? entry.facets.domain : null;
  }

  if (entry.kind === "learn_node") {
    return typeof entry.node?.properties?.domain === "string"
      ? entry.node.properties.domain
      : null;
  }

  if (entry.kind === "learn_edge") {
    return typeof entry.edge?.properties?.domain === "string"
      ? entry.edge.properties.domain
      : null;
  }

  return null;
}

function main() {
  assertRequiredPaths();
  validateJsonFiles();
  validateMarkdownLinks();
  const seedEntries = validatePortableSeedFiles() ?? [];

  const productContext = extractProductContext();
  validateToolReferences(productContext.tools);
  validateSeedCompatibility(seedEntries, productContext);

  for (const message of infos) {
    console.log(`info: ${message}`);
  }

  if (strictMode && warnings.length > 0) {
    for (const message of warnings) {
      errors.push(`Strict mode promoted warning: ${message}`);
    }
    warnings.length = 0;
  }

  for (const message of warnings) {
    console.warn(`warning: ${message}`);
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`error: ${message}`);
    }
    console.error(`\nValidation failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(
    `Validation passed for ${relativeRepoPath(repoRoot)} with ${warnings.length} warning(s). strict=${strictMode}.`
  );
}

main();
