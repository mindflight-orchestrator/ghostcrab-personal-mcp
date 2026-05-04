import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import type {
  TelemetryAgentHost,
  TelemetryAgentHostSource,
  TelemetryExecutionMode
} from "../telemetry/types.js";

export type NativeExtensionsMode = "auto" | "native" | "sql-only";
export type EmbeddingsMode =
  | "disabled"
  | "fake"
  | "fixture"
  | "null"
  | "openrouter";
export type GhostcrabNodeEnv = "development" | "test" | "production";

export interface GhostcrabConfig {
  embeddingApiKey?: string;
  embeddingBaseUrl?: string;
  embeddingDimensions: number;
  embeddingFixturePath?: string;
  embeddingModel?: string;
  embeddingTimeoutMs: number;
  embeddingsMode: EmbeddingsMode;
  hybridBm25Weight: number;
  hybridVectorWeight: number;
  nativeExtensionsMode: NativeExtensionsMode;
  nodeEnv: GhostcrabNodeEnv;
  resolvedConfigPath?: string;
  telemetryEnabled: boolean;
  telemetryEndpoint?: string;
  telemetryTimeoutMs: number;
  telemetryStateDir: string;
  telemetryDebug: boolean;
  mindbrainUrl: string;
  sqlitePath: string;
  agentHost?: TelemetryAgentHost;
  agentHostSource?: TelemetryAgentHostSource;
  executionMode?: TelemetryExecutionMode;
}

const DEFAULT_SQLITE_PATH = path.join(process.cwd(), "ghostcrab.sqlite");
const DEFAULT_EMBEDDING_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;
const DEFAULT_EMBEDDINGS_MODE = "disabled";
const DEFAULT_HYBRID_BM25_WEIGHT = 0.6;
const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.4;
const DEFAULT_ENV_FILE_PATH = ".env";
const DEFAULT_CONFIG_FILE_PATH = "config.yaml";
const DEFAULT_NATIVE_EXTENSIONS_MODE = "auto";
const DEFAULT_NODE_ENV = "development";
const DEFAULT_TELEMETRY_TIMEOUT_MS = 1500;
const DEFAULT_TELEMETRY_STATE_DIR = path.join(os.homedir(), ".ghostcrab");
const DEFAULT_MINDBRAIN_URL = "http://127.0.0.1:8091";

const TELEMETRY_AGENT_HOSTS: readonly TelemetryAgentHost[] = [
  "claude-code",
  "cursor",
  "openclaw",
  "codex",
  "crewai",
  "other",
  "unknown"
] as const;

const TELEMETRY_AGENT_HOST_SOURCES: readonly TelemetryAgentHostSource[] = [
  "explicit_env",
  "explicit_config",
  "heuristic",
  "unknown"
] as const;

const TELEMETRY_EXECUTION_MODES: readonly TelemetryExecutionMode[] = [
  "standalone",
  "docker",
  "k8s",
  "systemd",
  "unknown"
] as const;

interface EmbeddingsFileConfig {
  api_key?: unknown;
  base_url?: unknown;
  dimensions?: unknown;
  enabled?: unknown;
  fixture_path?: unknown;
  model?: unknown;
  provider?: unknown;
  timeout_ms?: unknown;
}

interface RawGhostcrabFileConfig {
  embeddings?: EmbeddingsFileConfig;
  retrieval?: {
    hybrid_bm25_weight?: unknown;
    hybrid_vector_weight?: unknown;
  };
}

interface ResolveConfigOptions {
  configFilePath?: string | null;
  cwd?: string;
  envFilePath?: string | null;
}

export function resolveGhostcrabConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveConfigOptions = {}
): GhostcrabConfig {
  const shouldLoadLocalFiles =
    env === process.env ||
    env.GHOSTCRAB_CONFIG_PATH !== undefined ||
    env.GHOSTCRAB_ENV_PATH !== undefined;
  const cwd = options.cwd ?? process.cwd();
  const envFilePath = shouldLoadLocalFiles
    ? resolveOptionalPath(
        options.envFilePath ?? env.GHOSTCRAB_ENV_PATH ?? DEFAULT_ENV_FILE_PATH,
        cwd
      )
    : undefined;
  const fileEnv = envFilePath ? loadEnvFile(envFilePath) : {};
  const mergedEnv = shouldLoadLocalFiles ? { ...fileEnv, ...env } : env;
  const configFilePath = shouldLoadLocalFiles
    ? resolveOptionalPath(
        options.configFilePath ??
          mergedEnv.GHOSTCRAB_CONFIG_PATH ??
          DEFAULT_CONFIG_FILE_PATH,
        cwd
      )
    : undefined;
  const fileConfig = configFilePath
    ? loadYamlConfig(configFilePath)
    : undefined;
  const embeddingsFromFile = fileConfig?.embeddings;
  const retrievalFromFile = fileConfig?.retrieval;
  const hybridBm25Weight = parseUnitInterval(
    env.GHOSTCRAB_HYBRID_BM25_WEIGHT ??
      readOptionalScalar(retrievalFromFile?.hybrid_bm25_weight) ??
      fileEnv.GHOSTCRAB_HYBRID_BM25_WEIGHT,
    DEFAULT_HYBRID_BM25_WEIGHT,
    "GHOSTCRAB_HYBRID_BM25_WEIGHT"
  );
  const hybridVectorWeight = parseUnitInterval(
    env.GHOSTCRAB_HYBRID_VECTOR_WEIGHT ??
      readOptionalScalar(retrievalFromFile?.hybrid_vector_weight) ??
      fileEnv.GHOSTCRAB_HYBRID_VECTOR_WEIGHT,
    DEFAULT_HYBRID_VECTOR_WEIGHT,
    "GHOSTCRAB_HYBRID_VECTOR_WEIGHT"
  );
  assertPositiveWeightSum(hybridBm25Weight, hybridVectorWeight);

  const telemetryEnabled = mergedEnv.MCP_TELEMETRY === "1";
  const telemetryEndpointRaw = mergedEnv.GHOSTCRAB_TELEMETRY_ENDPOINT;
  const telemetryEndpoint =
    telemetryEndpointRaw === undefined || telemetryEndpointRaw === ""
      ? undefined
      : telemetryEndpointRaw;
  const telemetryTimeoutMs = parsePositiveInteger(
    mergedEnv.GHOSTCRAB_TELEMETRY_TIMEOUT_MS,
    DEFAULT_TELEMETRY_TIMEOUT_MS,
    "GHOSTCRAB_TELEMETRY_TIMEOUT_MS"
  );
  const telemetryStateDirRaw = mergedEnv.GHOSTCRAB_TELEMETRY_STATE_DIR;
  const telemetryStateDir =
    telemetryStateDirRaw === undefined || telemetryStateDirRaw === ""
      ? DEFAULT_TELEMETRY_STATE_DIR
      : telemetryStateDirRaw;
  const telemetryDebug = mergedEnv.GHOSTCRAB_TELEMETRY_DEBUG === "1";
  const agentHost = parseOptionalTelemetryAgentHost(mergedEnv.GHOSTCRAB_AGENT_HOST);
  const agentHostSourceFromEnv = parseOptionalTelemetryAgentHostSource(
    mergedEnv.GHOSTCRAB_AGENT_HOST_SOURCE
  );
  const agentHostSource =
    agentHostSourceFromEnv ??
    (agentHost !== undefined ? "explicit_env" : undefined);
  const executionMode = parseOptionalTelemetryExecutionMode(
    mergedEnv.GHOSTCRAB_EXECUTION_MODE
  );

  return {
    embeddingApiKey:
      env.GHOSTCRAB_EMBEDDINGS_API_KEY ??
      readInterpolatedString(embeddingsFromFile?.api_key, mergedEnv) ??
      env.OPENROUTER_API_KEY ??
      fileEnv.GHOSTCRAB_EMBEDDINGS_API_KEY ??
      fileEnv.OPENROUTER_API_KEY,
    embeddingBaseUrl:
      env.GHOSTCRAB_EMBEDDINGS_BASE_URL ??
      readInterpolatedString(embeddingsFromFile?.base_url, mergedEnv) ??
      fileEnv.GHOSTCRAB_EMBEDDINGS_BASE_URL ??
      DEFAULT_EMBEDDING_BASE_URL,
    embeddingDimensions: parsePositiveInteger(
      env.GHOSTCRAB_EMBEDDING_DIMENSIONS ??
        readOptionalScalar(embeddingsFromFile?.dimensions) ??
        fileEnv.GHOSTCRAB_EMBEDDING_DIMENSIONS,
      DEFAULT_EMBEDDING_DIMENSIONS,
      "GHOSTCRAB_EMBEDDING_DIMENSIONS"
    ),
    embeddingFixturePath:
      env.GHOSTCRAB_EMBEDDINGS_FIXTURE_PATH ??
      readInterpolatedString(embeddingsFromFile?.fixture_path, mergedEnv) ??
      fileEnv.GHOSTCRAB_EMBEDDINGS_FIXTURE_PATH,
    embeddingModel:
      env.GHOSTCRAB_EMBEDDINGS_MODEL ??
      readInterpolatedString(embeddingsFromFile?.model, mergedEnv) ??
      fileEnv.GHOSTCRAB_EMBEDDINGS_MODEL,
    embeddingTimeoutMs: parsePositiveInteger(
      env.GHOSTCRAB_EMBEDDINGS_TIMEOUT_MS ??
        readOptionalScalar(embeddingsFromFile?.timeout_ms) ??
        fileEnv.GHOSTCRAB_EMBEDDINGS_TIMEOUT_MS,
      DEFAULT_EMBEDDING_TIMEOUT_MS,
      "GHOSTCRAB_EMBEDDINGS_TIMEOUT_MS"
    ),
    embeddingsMode: parseEmbeddingsMode(
      env.GHOSTCRAB_EMBEDDINGS_MODE ??
        resolveEmbeddingsModeFromFile(embeddingsFromFile, mergedEnv) ??
        fileEnv.GHOSTCRAB_EMBEDDINGS_MODE ??
        DEFAULT_EMBEDDINGS_MODE
    ),
    hybridBm25Weight,
    hybridVectorWeight,
    nativeExtensionsMode: parseNativeExtensionsMode(
      env.MINDBRAIN_NATIVE_EXTENSIONS ??
        fileEnv.MINDBRAIN_NATIVE_EXTENSIONS ??
        DEFAULT_NATIVE_EXTENSIONS_MODE
    ),
    nodeEnv: parseNodeEnv(env.NODE_ENV ?? fileEnv.NODE_ENV ?? DEFAULT_NODE_ENV),
    resolvedConfigPath: fileConfig ? configFilePath : undefined,
    telemetryEnabled,
    telemetryEndpoint,
    telemetryTimeoutMs,
    telemetryStateDir,
    telemetryDebug,
    mindbrainUrl:
      env.GHOSTCRAB_MINDBRAIN_URL ??
      fileEnv.GHOSTCRAB_MINDBRAIN_URL ??
      DEFAULT_MINDBRAIN_URL,
    sqlitePath:
      env.GHOSTCRAB_SQLITE_PATH ??
      fileEnv.GHOSTCRAB_SQLITE_PATH ??
      DEFAULT_SQLITE_PATH,
    agentHost,
    agentHostSource,
    executionMode
  };
}

function parseNodeEnv(value: string): GhostcrabNodeEnv {
  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new Error(
    `NODE_ENV must be one of development, test, production. Received: ${value}`
  );
}

function parseEmbeddingsMode(value: string): EmbeddingsMode {
  if (value === "stub") {
    return "fake";
  }

  if (
    value === "disabled" ||
    value === "fake" ||
    value === "fixture" ||
    value === "null" ||
    value === "openrouter"
  ) {
    return value;
  }

  throw new Error(
    "GHOSTCRAB_EMBEDDINGS_MODE must be one of disabled, null, fake, fixture, openrouter."
  );
}

function parseNativeExtensionsMode(value: string): NativeExtensionsMode {
  if (value === "auto" || value === "native" || value === "sql-only") {
    return value;
  }

  throw new Error(
    "MINDBRAIN_NATIVE_EXTENSIONS must be one of auto, native, sql-only."
  );
}

function parseOptionalTelemetryAgentHost(
  value: string | undefined
): TelemetryAgentHost | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  return TELEMETRY_AGENT_HOSTS.includes(value as TelemetryAgentHost)
    ? (value as TelemetryAgentHost)
    : undefined;
}

function parseOptionalTelemetryAgentHostSource(
  value: string | undefined
): TelemetryAgentHostSource | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  return TELEMETRY_AGENT_HOST_SOURCES.includes(value as TelemetryAgentHostSource)
    ? (value as TelemetryAgentHostSource)
    : undefined;
}

function parseOptionalTelemetryExecutionMode(
  value: string | undefined
): TelemetryExecutionMode | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  return TELEMETRY_EXECUTION_MODES.includes(value as TelemetryExecutionMode)
    ? (value as TelemetryExecutionMode)
    : undefined;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  variableName: string
): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${variableName} must be a positive integer.`);
  }

  return parsedValue;
}

function parseUnitInterval(
  value: string | undefined,
  fallback: number,
  variableName: string
): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsedValue = Number.parseFloat(value);

  if (Number.isNaN(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    throw new Error(`${variableName} must be a number between 0 and 1.`);
  }

  return parsedValue;
}

function assertPositiveWeightSum(
  hybridBm25Weight: number,
  hybridVectorWeight: number
): void {
  if (hybridBm25Weight + hybridVectorWeight <= 0) {
    throw new Error(
      "GHOSTCRAB_HYBRID_BM25_WEIGHT and GHOSTCRAB_HYBRID_VECTOR_WEIGHT must not both be 0."
    );
  }
}

function resolveEmbeddingsModeFromFile(
  embeddings: EmbeddingsFileConfig | undefined,
  env: NodeJS.ProcessEnv
): EmbeddingsMode | undefined {
  if (!embeddings) {
    return undefined;
  }

  const enabled = readBoolean(embeddings.enabled);

  if (enabled === false) {
    return "disabled";
  }

  const provider = readInterpolatedString(embeddings.provider, env);

  if (!provider) {
    return undefined;
  }

  return parseEmbeddingsMode(provider);
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }
  }

  return undefined;
}

function readInterpolatedString(
  value: unknown,
  env: NodeJS.ProcessEnv
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const resolvedValue = value.replaceAll(
    /\$\{([A-Z0-9_]+)\}/g,
    (_, variableName: string) => env[variableName] ?? ""
  );
  const trimmedValue = resolvedValue.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

function readOptionalScalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function resolveOptionalPath(
  filePath: string | null | undefined,
  cwd: string
): string | undefined {
  if (!filePath) {
    return undefined;
  }

  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

function loadEnvFile(filePath: string): NodeJS.ProcessEnv {
  if (!existsSync(filePath)) {
    return {};
  }

  const values: NodeJS.ProcessEnv = {};
  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadYamlConfig(filePath: string): RawGhostcrabFileConfig | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const contents = readFileSync(filePath, "utf8");
  const parsed = parseYaml(contents);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Config file must contain a YAML object: ${filePath}`);
  }

  return parsed as RawGhostcrabFileConfig;
}
