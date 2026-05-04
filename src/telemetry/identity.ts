import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const TELEMETRY_ID_FILENAME = "telemetry-id";
const TELEMETRY_META_FILENAME = "telemetry-meta.json";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface TelemetryMeta {
  first_installed_at: string;
}

function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

async function writeFileAtomically(
  targetPath: string,
  content: string
): Promise<void> {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, targetPath);
}

function logTelemetryDebug(debug: boolean, message: string): void {
  if (debug) {
    console.error(`[ghostcrab] ${message}`);
  }
}

export async function getOrCreateTelemetryId(
  stateDir: string,
  debug = false
): Promise<string> {
  await mkdir(stateDir, { recursive: true });
  const idPath = path.join(stateDir, TELEMETRY_ID_FILENAME);

  try {
    const existing = await readFile(idPath, "utf8");
    const trimmed = existing.trim();

    if (trimmed !== "" && isUuidV4(trimmed)) {
      return trimmed;
    }

    if (trimmed !== "") {
      logTelemetryDebug(
        debug,
        "Telemetry state contained an invalid telemetry-id; regenerating."
      );
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error)) {
      throw error;
    }

    const code = (error as { code?: string }).code;

    if (code !== "ENOENT") {
      throw error;
    }
  }

  const newId = randomUUID();

  await writeFileAtomically(idPath, `${newId}\n`);

  return newId;
}

export async function getOrCreateTelemetryMeta(
  stateDir: string,
  debug = false
): Promise<TelemetryMeta> {
  await mkdir(stateDir, { recursive: true });
  const metaPath = path.join(stateDir, TELEMETRY_META_FILENAME);

  try {
    const raw = await readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "first_installed_at" in parsed &&
      typeof (parsed as { first_installed_at?: unknown }).first_installed_at ===
        "string" &&
      isIsoTimestamp((parsed as { first_installed_at: string }).first_installed_at)
    ) {
      return {
        first_installed_at: (parsed as { first_installed_at: string })
          .first_installed_at
      };
    }

    logTelemetryDebug(
      debug,
      "Telemetry state contained an invalid telemetry-meta.json; regenerating."
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: string }).code;

      if (code === "ENOENT") {
        // Fall through to create a new meta file.
      } else {
        throw error;
      }
    } else {
      logTelemetryDebug(
        debug,
        "Telemetry state contained an invalid telemetry-meta.json; regenerating."
      );
    }
  }

  const meta: TelemetryMeta = {
    first_installed_at: new Date().toISOString()
  };

  await writeFileAtomically(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  return meta;
}
