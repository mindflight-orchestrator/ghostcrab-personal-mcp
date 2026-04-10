import type { GhostcrabConfig } from "../config/env.js";
import { getPackageVersion } from "../version.js";
import type {
  TelemetryAgentHost,
  TelemetryAgentHostSource,
  TelemetryExecutionMode,
  TelemetryPingPayload
} from "./types.js";
import type { TelemetryMeta } from "./identity.js";

function resolveAgentHost(config: GhostcrabConfig): TelemetryAgentHost {
  return config.agentHost ?? "unknown";
}

function resolveAgentHostSource(config: GhostcrabConfig): TelemetryAgentHostSource {
  return config.agentHostSource ?? "unknown";
}

function resolveExecutionMode(config: GhostcrabConfig): TelemetryExecutionMode {
  return config.executionMode ?? "unknown";
}

export async function buildPingPayload(
  config: GhostcrabConfig,
  telemetryId: string,
  meta: TelemetryMeta,
  dbConfigured: boolean
): Promise<TelemetryPingPayload> {
  const productVersion = await getPackageVersion();

  return {
    schema_version: "1.1",
    telemetry_id: telemetryId,
    event_type: "server_start",
    product: "ghostcrab",
    product_version: productVersion,
    os: process.platform,
    os_arch: process.arch,
    runtime: "node",
    runtime_version: process.versions.node,
    db_configured: dbConfigured,
    execution_mode: resolveExecutionMode(config),
    agent_host: resolveAgentHost(config),
    agent_host_source: resolveAgentHostSource(config),
    first_installed_at: meta.first_installed_at,
    sent_at: new Date().toISOString()
  };
}
