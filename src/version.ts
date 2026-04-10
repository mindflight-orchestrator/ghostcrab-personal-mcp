import { readFile } from "node:fs/promises";

const FALLBACK_VERSION = "0.1.0";

export async function getPackageVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const packageJsonContents = await readFile(packageJsonPath, "utf8");
    const parsedPackageJson = JSON.parse(packageJsonContents) as {
      version?: unknown;
    };

    return typeof parsedPackageJson.version === "string"
      ? parsedPackageJson.version
      : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}
