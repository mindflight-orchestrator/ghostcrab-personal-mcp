/**
 * gcp path — install a cross-platform PATH shim for the GhostCrab CLI.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findOnPath } from "../lib/mcp-global-setup.mjs";
import { installPathShim, runPathDoctor } from "../lib/path-shim.mjs";
import {
  auditCliInvocation,
  formatGcpCommand
} from "../lib/cli-invocation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..", "..");

export async function cmdPath(args) {
  const sub = args[0];
  if (!sub || sub === "--help" || sub === "-h") {
    printPathHelp();
    return;
  }

  if (sub === "install") {
    await runPathInstall(args.slice(1));
    return;
  }
  if (sub === "print") {
    runPathPrint(args.slice(1));
    return;
  }
  if (sub === "doctor") {
    await runPathDoctorCmd();
    return;
  }

  console.error(
    `gcp path: unknown subcommand "${sub}". Run "gcp path --help".`
  );
  process.exit(1);
}

function printPathHelp() {
  console.log(
    `
Usage: gcp path <subcommand>

Subcommands:
  install [--dry-run] [--write-profile]
          Write ~/.ghostcrab/bin/gcp shim (Windows: gcp.cmd).
          Use --write-profile to append PATH snippet to your shell profile.
  print   Show the PATH export line without writing files.
  doctor  Check gcp on PATH, shim presence, and ghostcrab-document engine.

Examples:
  gcp path install
  gcp path install --write-profile
  gcp path doctor
`.trim()
  );
}

async function runPathInstall(rest) {
  const dryRun = rest.includes("--dry-run");
  const writeProfile = rest.includes("--write-profile");

  const result = installPathShim({ pkgRoot, writeProfile, dryRun });

  if (dryRun) {
    console.log("[ghostcrab] path install (dry-run)");
    console.log(`  shim: ${result.shimPath}`);
    console.log(`  node: ${result.nodePath}`);
    console.log(`  gcp.mjs: ${result.gcpMjsPath}`);
    console.log(`  snippet (${result.shell}): ${result.snippet}`);
    console.log(`  profile: ${result.profilePath}`);
    return;
  }

  console.log(`[ghostcrab] path shim installed: ${result.shimPath}`);
  if (writeProfile) {
    console.log(
      `[ghostcrab] profile ${result.profilePath}: ${result.profileStatus}`
    );
  } else {
    console.log(
      `[ghostcrab] Add to your shell profile (${result.shell}) or run once per session:\n` +
        `  ${result.snippet}`
    );
    console.log(`[ghostcrab] Or re-run: gcp path install --write-profile`);
  }

  if (!result.onPath && !findOnPath("gcp")) {
    console.error(
      `[ghostcrab] ~/.ghostcrab/bin is not on PATH yet. Open a new terminal after updating your profile.`
    );
  }
}

function runPathPrint(rest) {
  if (rest.includes("--help") || rest.includes("-h")) {
    printPathHelp();
    return;
  }
  const result = installPathShim({ pkgRoot, dryRun: true });
  console.log(`# shell: ${result.shell}`);
  console.log(result.snippet);
  console.log(`# shim target: ${result.shimPath}`);
}

async function runPathDoctorCmd() {
  const report = await runPathDoctor(pkgRoot);
  const audit = auditCliInvocation({ pkgRoot, cwd: process.cwd() });
  const lines = [
    `gcp on PATH: ${report.gcpOnPath ? "yes" : "no"}`,
    `shim exists: ${report.shimExists ? "yes" : "no"} (${report.shimPath})`,
    `~/.ghostcrab/bin on PATH: ${report.binDirOnPath ? "yes" : "no"}`,
    `ghostcrab-document: ${report.documentOk ? "yes" : "missing"}${report.documentPath ? ` (${report.documentPath})` : ""}`,
    `install kind: ${audit.installKind}`,
    `running version: ${audit.runningVersion ?? "unknown"}`
  ];
  console.log(lines.join("\n"));

  if (!audit.ok) {
    console.error("\n[ghostcrab] Install issues detected:");
    for (const issue of audit.issues) {
      console.error(`  - ${issue}`);
    }
    console.error(
      `  Recommended: ${formatGcpCommand("brain setup cursor --force")}`
    );
    for (const fix of audit.fixes) {
      console.error(`  Fix: ${fix}`);
    }
  }

  if (!report.gcpOnPath && !report.binDirOnPath) {
    console.error("\n[ghostcrab] Run: gcp path install --write-profile");
  }
  if (!report.documentOk) {
    console.error(
      "\n[ghostcrab] Document engine missing — MCP works; ontology/document/structured-import CLI will fail.\n" +
        "  Install the platform optional package for your OS/arch, then run: gcp authorize"
    );
  }
}
