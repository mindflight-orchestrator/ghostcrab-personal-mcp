import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveGhostcrabConfig } from "../../src/config/env.js";
import { isTelemetryActive } from "../../src/telemetry/config.js";
import {
  getOrCreateTelemetryId,
  getOrCreateTelemetryMeta
} from "../../src/telemetry/identity.js";
import { maybeSendStartupPing } from "../../src/telemetry/index.js";
import { buildPingPayload } from "../../src/telemetry/payload.js";
import { sendTelemetryPing } from "../../src/telemetry/send.js";

describe("isTelemetryActive", () => {
  it("returns false when telemetry is disabled", () => {
    const config = resolveGhostcrabConfig({
      MCP_TELEMETRY: "0",
      GHOSTCRAB_TELEMETRY_ENDPOINT: "https://telemetry.example.com/v1/ping",
      NODE_ENV: "test"
    });

    expect(isTelemetryActive(config)).toBe(false);
  });

  it("returns false when endpoint is empty", () => {
    const config = resolveGhostcrabConfig({
      MCP_TELEMETRY: "1",
      GHOSTCRAB_TELEMETRY_ENDPOINT: "",
      NODE_ENV: "test"
    });

    expect(isTelemetryActive(config)).toBe(false);
  });

  it("returns false when endpoint is not HTTPS", () => {
    const config = resolveGhostcrabConfig({
      MCP_TELEMETRY: "1",
      GHOSTCRAB_TELEMETRY_ENDPOINT: "http://telemetry.example.com/v1/ping",
      NODE_ENV: "test"
    });

    expect(isTelemetryActive(config)).toBe(false);
  });

  it("returns true when enabled and endpoint is HTTPS", () => {
    const config = resolveGhostcrabConfig({
      MCP_TELEMETRY: "1",
      GHOSTCRAB_TELEMETRY_ENDPOINT: "https://telemetry.example.com/v1/ping",
      NODE_ENV: "test"
    });

    expect(isTelemetryActive(config)).toBe(true);
  });
});

describe("telemetry identity", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "ghostcrab-telemetry-"));
  });

  it("creates a UUID and reads it back unchanged", async () => {
    const id1 = await getOrCreateTelemetryId(tempDir);
    const id2 = await getOrCreateTelemetryId(tempDir);

    expect(id1).toBe(id2);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    );
  });

  it("does not overwrite an existing telemetry id", async () => {
    const idPath = path.join(tempDir, "telemetry-id");
    const fixed = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

    writeFileSync(idPath, `${fixed}\n`, "utf8");

    const id = await getOrCreateTelemetryId(tempDir);

    expect(id).toBe(fixed);
  });

  it("regenerates an invalid telemetry id and keeps it stable afterwards", async () => {
    const idPath = path.join(tempDir, "telemetry-id");

    writeFileSync(idPath, "not-a-uuid\n", "utf8");

    const id1 = await getOrCreateTelemetryId(tempDir);
    const id2 = await getOrCreateTelemetryId(tempDir);

    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    );
    expect(id2).toBe(id1);
  });

  it("regenerates an empty telemetry id file", async () => {
    const idPath = path.join(tempDir, "telemetry-id");

    writeFileSync(idPath, "\n", "utf8");

    const id = await getOrCreateTelemetryId(tempDir);

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    );
  });

  it("creates telemetry meta with first_installed_at", async () => {
    const meta = await getOrCreateTelemetryMeta(tempDir);

    expect(meta.first_installed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );

    const raw = readFileSync(
      path.join(tempDir, "telemetry-meta.json"),
      "utf8"
    );
    const parsed = JSON.parse(raw) as { first_installed_at: string };

    expect(parsed.first_installed_at).toBe(meta.first_installed_at);
  });

  it("regenerates telemetry meta when JSON is invalid", async () => {
    const metaPath = path.join(tempDir, "telemetry-meta.json");
    writeFileSync(metaPath, "{invalid json", "utf8");

    const meta = await getOrCreateTelemetryMeta(tempDir);

    expect(meta.first_installed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("regenerates telemetry meta when timestamp is invalid", async () => {
    const metaPath = path.join(tempDir, "telemetry-meta.json");
    writeFileSync(
      metaPath,
      `${JSON.stringify({ first_installed_at: "not-a-date" })}\n`,
      "utf8"
    );

    const meta = await getOrCreateTelemetryMeta(tempDir);

    expect(meta.first_installed_at).not.toBe("not-a-date");
    expect(meta.first_installed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });
});

describe("buildPingPayload", () => {
  it("produces a v1.1 payload with required fields", async () => {
    const config = resolveGhostcrabConfig({ NODE_ENV: "test" });
    const meta = { first_installed_at: "2026-03-28T09:42:00.000Z" };

    const payload = await buildPingPayload(
      config,
      "a3f8c2e1-b4d5-4f6a-9c7e-1234567890ab",
      meta,
      true
    );

    expect(payload.schema_version).toBe("1.1");
    expect(payload.telemetry_id).toBe("a3f8c2e1-b4d5-4f6a-9c7e-1234567890ab");
    expect(payload.event_type).toBe("server_start");
    expect(payload.product).toBe("ghostcrab");
    expect(typeof payload.product_version).toBe("string");
    expect(payload.os).toBe(process.platform);
    expect(payload.os_arch).toBe(process.arch);
    expect(payload.runtime).toBe("node");
    expect(payload.runtime_version).toBe(process.versions.node);
    expect(payload.db_configured).toBe(true);
    expect(payload.execution_mode).toBe("unknown");
    expect(payload.agent_host).toBe("unknown");
    expect(payload.agent_host_source).toBe("unknown");
    expect(payload.first_installed_at).toBe(meta.first_installed_at);
    expect(payload.sent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("respects explicit agent host and source", async () => {
    const config = resolveGhostcrabConfig({
      NODE_ENV: "test",
      GHOSTCRAB_AGENT_HOST: "cursor",
      GHOSTCRAB_AGENT_HOST_SOURCE: "explicit_config"
    });

    const payload = await buildPingPayload(
      config,
      "a3f8c2e1-b4d5-4f6a-9c7e-1234567890ab",
      { first_installed_at: "2026-03-28T09:42:00.000Z" },
      true
    );

    expect(payload.agent_host).toBe("cursor");
    expect(payload.agent_host_source).toBe("explicit_config");
  });

  it("uses explicit_env when only agent host is set", async () => {
    const config = resolveGhostcrabConfig({
      NODE_ENV: "test",
      GHOSTCRAB_AGENT_HOST: "codex"
    });

    const payload = await buildPingPayload(
      config,
      "a3f8c2e1-b4d5-4f6a-9c7e-1234567890ab",
      { first_installed_at: "2026-03-28T09:42:00.000Z" },
      true
    );

    expect(payload.agent_host).toBe("codex");
    expect(payload.agent_host_source).toBe("explicit_env");
  });

  it("uses the injected DB reachability signal", async () => {
    const config = resolveGhostcrabConfig({ NODE_ENV: "test" });

    const payload = await buildPingPayload(
      config,
      "a3f8c2e1-b4d5-4f6a-9c7e-1234567890ab",
      { first_installed_at: "2026-03-28T09:42:00.000Z" },
      false
    );

    expect(payload.db_configured).toBe(false);
  });
});

describe("sendTelemetryPing", () => {
  const samplePayload = {
    schema_version: "1.1" as const,
    telemetry_id: "a3f8c2e1-b4d5-4f6a-9c7e-1234567890ab",
    event_type: "server_start" as const,
    product: "ghostcrab" as const,
    product_version: "0.1.0",
    os: "darwin",
    os_arch: "arm64",
    runtime: "node" as const,
    runtime_version: "22.0.0",
    db_configured: true,
    execution_mode: "unknown" as const,
    agent_host: "unknown" as const,
    agent_host_source: "unknown" as const,
    first_installed_at: "2026-03-28T09:42:00.000Z",
    sent_at: "2026-03-28T10:12:00.000Z"
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not reject when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    await expect(
      sendTelemetryPing(
        "https://telemetry.example.com/v1/ping",
        samplePayload,
        1500,
        false
      )
    ).resolves.toBeUndefined();
  });

  it("respects timeout via AbortSignal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;

        if (!signal) {
          throw new Error("expected AbortSignal");
        }

        return await new Promise<Response>((_resolve, reject) => {
          const onAbort = (): void => {
            reject(new Error("The operation was aborted"));
          };

          if (signal.aborted) {
            onAbort();

            return;
          }

          signal.addEventListener("abort", onAbort, { once: true });
        });
      })
    );

    await expect(
      sendTelemetryPing(
        "https://telemetry.example.com/v1/ping",
        samplePayload,
        50,
        false
      )
    ).resolves.toBeUndefined();
  });
});

describe("maybeSendStartupPing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing when telemetry is disabled", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const config = resolveGhostcrabConfig({ NODE_ENV: "test" });

    await maybeSendStartupPing(config, true);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("passes the DB reachability signal through to the payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { db_configured: boolean };

        expect(body.db_configured).toBe(false);

        return new Response(null, { status: 202 });
      })
    );

    const tempDir = mkdtempSync(path.join(os.tmpdir(), "ghostcrab-telemetry-"));
    const config = resolveGhostcrabConfig({
      NODE_ENV: "test",
      MCP_TELEMETRY: "1",
      GHOSTCRAB_TELEMETRY_ENDPOINT: "https://telemetry.example.com/v1/ping",
      GHOSTCRAB_TELEMETRY_STATE_DIR: tempDir
    });

    await expect(maybeSendStartupPing(config, false)).resolves.toBeUndefined();
  });
});

describe("opt-out contract", () => {
  it("treats MCP_TELEMETRY=0 like the --no-telemetry flag", () => {
    const config = resolveGhostcrabConfig({
      MCP_TELEMETRY: "0",
      GHOSTCRAB_TELEMETRY_ENDPOINT: "https://telemetry.example.com/v1/ping",
      NODE_ENV: "test"
    });

    expect(config.telemetryEnabled).toBe(false);
    expect(isTelemetryActive(config)).toBe(false);
  });
});
