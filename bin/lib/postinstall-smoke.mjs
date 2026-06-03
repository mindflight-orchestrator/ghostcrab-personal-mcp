/**
 * Verifies the CLI loads and the native backend executable runs (--help).
 * Fails the process on error so npm install surfaces a broken pack early.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {{ pkgRoot: string, backendPath: string, documentPath?: string | null, quiet: boolean }} opts
 */
export function runPostinstallSmoke(opts) {
  const { pkgRoot, backendPath, documentPath, quiet } = opts;

  if (!existsSync(backendPath)) {
    console.error(
      `[ghostcrab] postinstall smoke: backend binary missing at ${backendPath}`
    );
    process.exit(1);
  }

  const gcpScript = join(pkgRoot, "bin", "gcp.mjs");
  if (!existsSync(gcpScript)) {
    console.error(`[ghostcrab] postinstall smoke: missing ${gcpScript}`);
    process.exit(1);
  }

  const gcp = spawnSync(process.execPath, [gcpScript, "--help"], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024
  });
  if (gcp.error) {
    console.error(
      `[ghostcrab] postinstall smoke: could not run gcp --help: ${gcp.error.message}`
    );
    process.exit(1);
  }
  if (gcp.status !== 0) {
    console.error(
      `[ghostcrab] postinstall smoke: gcp --help exited ${gcp.status}\n${gcp.stderr || gcp.stdout || ""}`
    );
    process.exit(1);
  }

  smokeBackendHelp(backendPath);

  if (documentPath) {
    if (!existsSync(documentPath)) {
      console.error(
        `[ghostcrab] postinstall smoke: document engine missing at ${documentPath}`
      );
      process.exit(1);
    }
    smokeDocumentHelp(documentPath);
  } else if (!quiet) {
    console.error(
      "[ghostcrab] postinstall smoke: ghostcrab-document not installed — skipping document engine check (MCP-only OK)"
    );
  }

  if (!quiet) {
    const docLine = documentPath
      ? ", ghostcrab-document --help"
      : " (document engine skipped)";
    console.log(
      `[ghostcrab] postinstall smoke: OK (gcp --help, ghostcrab-backend --help${docLine})`
    );
  }
}

/**
 * @param {string} backendPath
 */
function smokeBackendHelp(backendPath) {
  const be = spawnSync(backendPath, ["--help"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false
  });
  if (be.error) {
    console.error(
      `[ghostcrab] postinstall smoke: could not run backend --help: ${be.error.message}\n` +
        `  (${backendPath})`
    );
    process.exit(1);
  }

  const combined = `${be.stdout ?? ""}${be.stderr ?? ""}`;
  const looksLikeHelp =
    be.status === 0 ||
    (/usage:/i.test(combined) && /ghostcrab-backend/i.test(combined));
  if (!looksLikeHelp) {
    console.error(
      `[ghostcrab] postinstall smoke: backend --help did not print expected usage.\n` +
        `  Binary: ${backendPath}\n` +
        `  exit: ${be.status ?? "null"}\n` +
        (combined.trim() ? combined.slice(0, 800) : "(no output)")
    );
    process.exit(1);
  }
}

/**
 * @param {string} documentPath
 */
function smokeDocumentHelp(documentPath) {
  const doc = spawnSync(documentPath, ["--help"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false
  });
  if (doc.error) {
    console.error(
      `[ghostcrab] postinstall smoke: could not run ghostcrab-document --help: ${doc.error.message}\n` +
        `  (${documentPath})`
    );
    process.exit(1);
  }

  const combined = `${doc.stdout ?? ""}${doc.stderr ?? ""}`;
  const looksLikeHelp =
    doc.status === 0 || /usage:/i.test(combined);
  if (!looksLikeHelp) {
    console.error(
      `[ghostcrab] postinstall smoke: ghostcrab-document --help did not print expected usage.\n` +
        `  Binary: ${documentPath}\n` +
        `  exit: ${doc.status ?? "null"}\n` +
        (combined.trim() ? combined.slice(0, 800) : "(no output)")
    );
    process.exit(1);
  }
}
