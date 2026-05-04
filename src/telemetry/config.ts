import type { GhostcrabConfig } from "../config/env.js";

export function isTelemetryActive(config: GhostcrabConfig): boolean {
  if (!config.telemetryEnabled) {
    return false;
  }

  const endpoint = config.telemetryEndpoint;

  if (endpoint === undefined || endpoint === "") {
    return false;
  }

  return endpoint.startsWith("https://");
}
