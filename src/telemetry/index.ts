import type { GhostcrabConfig } from "../config/env.js";
import { isTelemetryActive } from "./config.js";
import {
  getOrCreateTelemetryId,
  getOrCreateTelemetryMeta
} from "./identity.js";
import { buildPingPayload } from "./payload.js";
import { sendTelemetryPing } from "./send.js";

/**
 * Sends an anonymous startup ping when telemetry is enabled.
 * Never throws and returns immediately; all filesystem and network work runs
 * in the background.
 */
export async function maybeSendStartupPing(
  config: GhostcrabConfig,
  dbConfigured: boolean
): Promise<void> {
  try {
    if (!isTelemetryActive(config)) {
      return;
    }

    const endpoint = config.telemetryEndpoint;

    if (endpoint === undefined || endpoint === "") {
      return;
    }

    void (async (): Promise<void> => {
      try {
        const telemetryId = await getOrCreateTelemetryId(
          config.telemetryStateDir,
          config.telemetryDebug
        );
        const meta = await getOrCreateTelemetryMeta(
          config.telemetryStateDir,
          config.telemetryDebug
        );
        const payload = await buildPingPayload(
          config,
          telemetryId,
          meta,
          dbConfigured
        );

        await sendTelemetryPing(
          endpoint,
          payload,
          config.telemetryTimeoutMs,
          config.telemetryDebug
        );
      } catch {
        // Never block or fail server startup for telemetry.
      }
    })();
  } catch {
    // Never block or fail server startup for telemetry.
  }
}
