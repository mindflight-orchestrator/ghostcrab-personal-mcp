/**
 * Best-effort IDE detection for Cursor, Claude Code, and Codex.
 *
 * Override: GHOSTCRAB_IDE=cursor | claude-code | codex
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/** @typedef {'cursor' | 'claude-code' | 'codex'} IdeId */

/**
 * @param {string} cwd
 * @returns {{ id: IdeId | null, reason: string }}
 */
export function detectIde(cwd) {
  const override = normalizeIdeEnv(process.env.GHOSTCRAB_IDE);
  if (override) {
    return { id: override, reason: "GHOSTCRAB_IDE" };
  }

  // Strong signals from the spawning editor (MCP / agent host)
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_AGENT) {
    return { id: "cursor", reason: "CURSOR_* env" };
  }

  const hasClaude = existsSync(join(cwd, ".claude"));
  const hasCursor = existsSync(join(cwd, ".cursor"));
  const hasCodex = existsSync(join(cwd, ".codex"));

  if (hasClaude && !hasCursor && !hasCodex) {
    return { id: "claude-code", reason: ".claude" };
  }
  if (hasCursor && !hasClaude && !hasCodex) {
    return { id: "cursor", reason: ".cursor" };
  }
  if (hasCodex && !hasClaude && !hasCursor) {
    return { id: "codex", reason: ".codex" };
  }

  // Ambiguous: multiple marker dirs — stable precedence
  if (hasClaude) {
    return { id: "claude-code", reason: ".claude (multi-IDE markers)" };
  }
  if (hasCursor) {
    return { id: "cursor", reason: ".cursor (multi-IDE markers)" };
  }
  if (hasCodex) {
    return { id: "codex", reason: ".codex (multi-IDE markers)" };
  }

  return { id: null, reason: "no marker" };
}

/** @param {string | undefined} raw */
function normalizeIdeEnv(raw) {
  if (!raw || typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "cursor") return "cursor";
  if (v === "claude-code" || v === "claude" || v === "claude_code") {
    return "claude-code";
  }
  if (v === "codex") return "codex";
  return null;
}
