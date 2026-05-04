import { parseArgs } from "node:util";

import type { CliCommand } from "./commands.js";

const GLOBAL_OPTION_KEYS = new Set([
  "help",
  "verbose",
  "text",
  "input",
  "stdin-json",
  "json"
]);

function kebabToSnake(key: string): string {
  return key.replaceAll("-", "_");
}

function coerceValue(key: string, value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => coerceScalar(key, item));
  }

  return coerceScalar(key, value);
}

function coerceScalar(key: string, value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  return value;
}

export class HelpRequested {
  constructor(public command: CliCommand) {}
}

function parseJsonObject(
  raw: string,
  flagName: "--input" | "--stdin-json"
): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${flagName} must contain a JSON object payload.`);
  }

  return parsed as Record<string, unknown>;
}

export function parseCliInput(
  command: CliCommand,
  argv: string[]
): Record<string, unknown> {
  const skipCount = command.subcommand ? 2 : 1;
  const tokens = argv.slice(skipCount);

  const globalOptions = {
    input: { type: "string" as const },
    "stdin-json": { type: "boolean" as const },
    help: { type: "boolean" as const, short: "h" },
    verbose: { type: "boolean" as const, short: "v" },
    text: { type: "boolean" as const },
    json: { type: "boolean" as const }
  };

  const { values } = parseArgs({
    args: tokens,
    options: { ...globalOptions, ...command.parseArgsOptions },
    strict: true
  });

  if (values.help) {
    throw new HelpRequested(command);
  }

  if (values.input && values["stdin-json"]) {
    throw new Error("Cannot use --input and --stdin-json together.");
  }

  if (values.input) {
    return parseJsonObject(values.input as string, "--input");
  }

  if (values["stdin-json"]) {
    throw new Error("--stdin-json requires piped input (handled by runner).");
  }

  const args: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(values)) {
    if (GLOBAL_OPTION_KEYS.has(key)) {
      continue;
    }

    if (val === undefined) {
      continue;
    }

    const snakeKey = kebabToSnake(key);
    args[snakeKey] = coerceValue(snakeKey, val);
  }

  if (typeof args.group_by === "string") {
    args.group_by = [args.group_by];
  }

  if (typeof args.edge_labels === "string") {
    args.edge_labels = [args.edge_labels];
  }

  return args;
}

export const __private__ = {
  coerceScalar,
  parseJsonObject
};
