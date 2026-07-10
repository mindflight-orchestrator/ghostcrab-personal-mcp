#!/usr/bin/env node
/**
 * Verify live projection artifacts on a running MindBrain backend.
 *
 * Usage:
 *   node examples/immeuble/scripts/verify-immeuble-live-artifacts.mjs
 *     [--workspace immeuble] [--url http://127.0.0.1:8091]
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { spawnSync } from "node:child_process";

const immeubleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgRoot = resolve(immeubleRoot, "..", "..");
const gcp = join(pkgRoot, "bin", "gcp.mjs");
const reportsDir = join(immeubleRoot, "reports");
const acceptancePath = join(immeubleRoot, "ACCEPTANCE.yaml");

const args = process.argv.slice(2);
const workspaceId = parseFlag(args, "--workspace-id", "immeuble");
const backendUrl = parseFlag(
  args,
  "--url",
  process.env.GHOSTCRAB_MINDBRAIN_URL ?? "http://127.0.0.1:8091"
);

const acceptance = parseYaml(readFileSync(acceptancePath, "utf8"));
const requiredArtifacts = acceptance?.projections?.live_answer_view ?? [];
const result = { ok: true, workspace_id: workspaceId, checks: [] };

try {
  const list = runArtifactCmd([
    "artifact",
    "list",
    "--url",
    backendUrl,
    "--workspace-id",
    workspaceId,
    "--kind",
    "live_answer_view"
  ]);
  result.checks.push({
    name: "artifact.list",
    ok: true,
    detail: `status=${list.status}`
  });

  const listPayload = parseJson(list.stdout);
  const artifacts = Array.isArray(listPayload?.artifacts)
    ? listPayload.artifacts
    : [];
  const present = new Set(artifacts.map((a) => a?.artifact_id).filter(Boolean));

  const missing = requiredArtifacts.filter(
    (artifactId) => !present.has(artifactId)
  );
  result.checks.push({
    name: "required_artifacts_present",
    ok: missing.length === 0,
    detail: missing.length
      ? `missing: ${missing.join(", ")}`
      : "all required ids listed"
  });
  if (missing.length > 0) {
    throw new Error("missing required live_answer_view artifacts");
  }

  const refreshChecks = [];
  for (const artifactId of requiredArtifacts) {
    const refresh = runArtifactCmd([
      "artifact",
      "refresh",
      "--url",
      backendUrl,
      artifactId
    ]);
    const refreshPayload = parseJson(refresh.stdout);
    const refreshArtifactId =
      refreshPayload?.artifact_id || refreshPayload?.artifact?.artifact_id;
    if (typeof refreshArtifactId === "string" && refreshArtifactId.length > 0) {
      result.checks.push({
        name: `artifact.refresh.${artifactId}`,
        ok: true,
        detail: `artifact_id=${refreshArtifactId}`
      });
    } else {
      result.checks.push({
        name: `artifact.refresh.${artifactId}`,
        ok: true,
        detail: "refresh returned JSON payload"
      });
    }
    refreshChecks.push(refreshPayload);

    const get = runArtifactCmd([
      "artifact",
      "get",
      "--url",
      backendUrl,
      artifactId
    ]);
    const getPayload = parseJson(get.stdout);
    const payload =
      extractPayload(getPayload) ?? extractPayload(refreshPayload);
    const artifactSummary =
      typeof payload?.summary === "string" && payload.summary.trim().length > 0;
    const artifactRefreshChecks =
      Array.isArray(payload?.refresh_checks) &&
      payload.refresh_checks.length > 0;
    const refreshedOperational =
      refreshPayload?.ok === true &&
      payload &&
      (typeof payload.graph_entities === "number" ||
        typeof payload.facts === "number" ||
        typeof payload.graph_relations === "number");
    const payloadOk =
      (artifactSummary && artifactRefreshChecks) || refreshedOperational;
    result.checks.push({
      name: `artifact.payload.${artifactId}`,
      ok: payloadOk,
      detail: JSON.stringify({
        has_summary: artifactSummary,
        has_refresh_checks: artifactRefreshChecks,
        refreshed_operational: refreshedOperational
      })
    });
    if (!payloadOk) {
      throw new Error(`artifact payload invalid for ${artifactId}`);
    }
  }

  result.checks.push({
    name: "refresh_count",
    ok: refreshChecks.length === requiredArtifacts.length,
    detail: `${refreshChecks.length}`
  });
  result.ok = result.checks.every((item) => item.ok);
} catch (err) {
  result.ok = false;
  result.error = err instanceof Error ? err.message : String(err);
}

mkdirSync(reportsDir, { recursive: true });
writeFileSync(
  join(reportsDir, "live-artifacts-refresh.validation.json"),
  JSON.stringify(result, null, 2) + "\n",
  "utf8"
);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

function runArtifactCmd(argsList) {
  const res = spawnSync(process.execPath, [gcp, "brain", ...argsList], {
    cwd: pkgRoot,
    env: {
      ...process.env,
      GHOSTCRAB_MINDBRAIN_URL: backendUrl
    },
    encoding: "utf8"
  });
  if (res.status !== 0) {
    throw new Error(
      `gcp brain ${argsList.join(" ")} failed (${res.status}): ${(res.stderr || res.stdout || "").trim()}`
    );
  }
  return {
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || ""
  };
}

function parseJson(text) {
  return JSON.parse(text || "{}");
}

function extractPayload(getPayload) {
  const payloadJson = getPayload?.payload_json;
  if (typeof payloadJson === "string") {
    try {
      return JSON.parse(payloadJson);
    } catch {
      return null;
    }
  }
  if (getPayload?.payload && typeof getPayload.payload === "object") {
    return getPayload.payload;
  }
  return null;
}

function parseFlag(argv, name, defaultValue) {
  const index = argv.indexOf(name);
  if (index === -1) return defaultValue;
  return argv[index + 1] ?? defaultValue;
}
