export type TelemetrySchemaVersion = "1.1";

export type TelemetryEventType = "server_start";

export type TelemetryProduct = "ghostcrab";

export type TelemetryRuntime = "node" | "unknown";

export type TelemetryExecutionMode =
  | "standalone"
  | "docker"
  | "k8s"
  | "systemd"
  | "unknown";

export type TelemetryAgentHost =
  | "claude-code"
  | "cursor"
  | "openclaw"
  | "codex"
  | "crewai"
  | "other"
  | "unknown";

export type TelemetryAgentHostSource =
  | "explicit_env"
  | "explicit_config"
  | "heuristic"
  | "unknown";

/**
 * Anonymous startup ping contract (v1.1).
 * See docs/telemetry and product telemetry plan.
 */
export interface TelemetryPingPayload {
  schema_version: TelemetrySchemaVersion;
  telemetry_id: string;
  event_type: TelemetryEventType;
  product: TelemetryProduct;
  product_version: string;
  os: string;
  os_arch: string;
  runtime: TelemetryRuntime;
  runtime_version: string;
  db_configured: boolean;
  execution_mode: TelemetryExecutionMode;
  agent_host: TelemetryAgentHost;
  agent_host_source: TelemetryAgentHostSource;
  first_installed_at: string;
  sent_at: string;
}
