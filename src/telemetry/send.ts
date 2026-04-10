import type { TelemetryPingPayload } from "./types.js";

export async function sendTelemetryPing(
  endpoint: string,
  payload: TelemetryPingPayload,
  timeoutMs: number,
  debug: boolean
): Promise<void> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (debug && !response.ok) {
      console.error(
        `[ghostcrab] Telemetry request failed with status ${response.status}`
      );
    }
  } catch (error) {
    if (debug) {
      const message =
        error instanceof Error ? error.message : "Unknown telemetry error";

      console.error(`[ghostcrab] Telemetry request error: ${message}`);
    }
  }
}
