/**
 * Post-setup: MCP permissions + IDE skill bundles + PATH shim.
 */

import {
  applyClaudePermissions,
  applyCursorPermissions,
  toClaudePermissions,
  buildPolicy
} from "./mcp-permissions-adapters.mjs";
import {
  describeIdeSkillsBundleForTarget,
  installIdeSkillsBundleForTarget,
  setupTargetToIdeSkillsTarget
} from "./install-ide-skills.mjs";
import { installPathShim } from "./path-shim.mjs";

/**
 * @param {object} opts
 * @param {"cursor" | "claude" | "codex" | "generic"} opts.target
 * @param {string} opts.cwd
 * @param {string} opts.pkgRoot
 * @param {string} opts.serverName
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPreset} opts.permissionsPreset
 * @param {"user" | "project"} opts.permissionsScope
 * @param {boolean} opts.skipPermissions
 * @param {boolean} opts.skipSkills
 * @param {boolean} opts.force
 * @param {boolean} opts.dryRun
 * @param {"user" | "project"} [opts.skillsScope]
 * @param {string[]} [opts.allowTools]
 * @param {string[]} [opts.askTools]
 */
export async function runSetupPostInstall(opts) {
  /** @type {string[]} */
  const messages = [];
  /** @type {Record<string, unknown>} */
  const details = {};

  if (!opts.skipPermissions && opts.permissionsPreset !== "none") {
    if (opts.target === "cursor") {
      const perm = await applyCursorPermissions({
        preset: opts.permissionsPreset,
        serverName: opts.serverName,
        force: opts.force,
        dryRun: opts.dryRun,
        allowTools: opts.allowTools
      });
      if (!perm.ok) {
        return { ok: false, message: perm.message ?? "Cursor permissions failed" };
      }
      if (perm.message) messages.push(perm.message);
      if (opts.dryRun && perm.allowCount != null) {
        messages.push(
          `[dry-run] Would write Cursor mcpAllowlist (${opts.permissionsPreset}, ${perm.allowCount} tools) to ${perm.permissionsPath ?? "~/.cursor/permissions.json"}`
        );
      }
      details.cursorPermissions = perm.doc ?? perm.permissionsPath;
    } else if (opts.target === "claude") {
      const perm = await applyClaudePermissions({
        preset: opts.permissionsPreset,
        serverName: opts.serverName,
        permissionsScope: opts.permissionsScope,
        cwd: opts.cwd,
        force: opts.force,
        dryRun: opts.dryRun,
        allowTools: opts.allowTools,
        askTools: opts.askTools
      });
      if (!perm.ok) {
        return { ok: false, message: perm.message ?? "Claude permissions failed" };
      }
      if (perm.message) messages.push(perm.message);
      if (opts.dryRun && perm.allowCount != null) {
        messages.push(
          `[dry-run] Would write Claude permissions (${opts.permissionsPreset}, ${perm.allowCount} tools) to ${perm.settingsPath ?? ".claude/settings.json"}`
        );
      }
      details.claudeSettings = perm.doc ?? perm.settingsPath;
    }
  }

  if (!opts.skipSkills) {
    let permissionsAllow = undefined;
    if (
      opts.target === "claude" &&
      !opts.skipPermissions &&
      opts.permissionsPreset !== "none"
    ) {
      const policy = await buildPolicy(opts.permissionsPreset, {
        serverName: opts.serverName,
        allowTools: opts.allowTools,
        askTools: opts.askTools
      });
      const rendered = await toClaudePermissions(policy);
      permissionsAllow = rendered.allow;
    }

    if (!opts.dryRun) {
      const skills = installIdeSkillsBundleForTarget({
        target: setupTargetToIdeSkillsTarget(opts.target),
        cwd: opts.cwd,
        pkgRoot: opts.pkgRoot,
        skip: false,
        force: opts.force,
        context: "setup",
        scope: opts.skillsScope ?? "user",
        permissionsAllow
      });
      if (!skills.ok && !skills.skipped) {
        return {
          ok: false,
          message: skills.message ?? "IDE skills install failed"
        };
      }
      if (skills.paths?.length) {
        messages.push(
          `Installed IDE skill bundle (${opts.target}): ${skills.paths.join(", ")}`
        );
      } else if (skills.skipped) {
        messages.push(`IDE skills unchanged (${opts.target}).`);
      }
      details.skills = skills.paths ?? [];
    } else {
      const preview = describeIdeSkillsBundleForTarget({
        target: setupTargetToIdeSkillsTarget(opts.target),
        cwd: opts.cwd,
        pkgRoot: opts.pkgRoot,
        scope: opts.skillsScope ?? "user"
      });
      if (!preview.ok) {
        return {
          ok: false,
          message: preview.message ?? "IDE skills preview failed"
        };
      }
      messages.push(
        `[dry-run] Would install ${opts.target} skill bundle from ${preview.bundleRoot}: ${preview.skills.join(", ")} -> ${preview.installedSkillRoot}`
      );
      messages.push(
        `[dry-run] Would write skill reference ${preview.referenceManifest}, ${preview.targetReferenceManifest} and shortcut ${preview.currentShortcut}`
      );
    }
  }

  if (opts.dryRun) {
    const pathPreview = installPathShim({
      pkgRoot: opts.pkgRoot,
      dryRun: true
    });
    messages.push(
      `[dry-run] Would install PATH shim at ${pathPreview.shimPath} and update ${pathPreview.profilePath}`
    );
    details.pathShim = pathPreview.shimPath;
  } else {
    try {
      const pathResult = installPathShim({
        pkgRoot: opts.pkgRoot,
        writeProfile: true
      });
      const profileNote =
        pathResult.profileStatus === "present"
          ? "shell profile already configured"
          : pathResult.profileStatus === "appended"
            ? `updated ${pathResult.profilePath}`
            : "profile unchanged";
      messages.push(`PATH shim: ${pathResult.shimPath} (${profileNote})`);
      if (!pathResult.onPath) {
        messages.push(
          "Open a new terminal (or run the PATH export once) so `gcp` is available."
        );
      }
      details.pathShim = pathResult.shimPath;
    } catch (e) {
      messages.push(
        `PATH shim install failed (non-fatal): ${e instanceof Error ? e.message : e}`
      );
    }
  }

  return { ok: true, messages, details };
}

/**
 * @param {object} opts
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPreset} opts.preset
 * @param {"claude" | "cursor" | "all"} opts.client
 * @param {string} opts.serverName
 * @param {string} opts.cwd
 * @param {"user" | "project"} [opts.permissionsScope]
 * @param {boolean} [opts.dryRun]
 * @param {string[]} [opts.allowTools]
 */
export async function runPermissionsPrint(opts) {
  const policy = await buildPolicy(opts.preset, {
    serverName: opts.serverName,
    allowTools: opts.allowTools
  });

  const out = { preset: opts.preset, serverName: opts.serverName, policy: {} };

  if (opts.client === "claude" || opts.client === "all") {
    out.policy.claude = await toClaudePermissions(policy);
  }
  if (opts.client === "cursor" || opts.client === "all") {
    const { toCursorAllowlist } = await import("./mcp-permissions-adapters.mjs");
    out.policy.cursor = {
      mcpAllowlist: await toCursorAllowlist(policy)
    };
  }

  if (opts.dryRun) {
    console.log(JSON.stringify(out, null, 2));
    return { ok: true };
  }

  console.log(JSON.stringify(out, null, 2));
  return { ok: true };
}

/**
 * @param {object} opts
 * @param {import("../../dist/tools/mcp-tool-policy.js").ToolPermissionPreset} opts.preset
 * @param {"claude" | "cursor" | "all"} opts.client
 * @param {string} opts.serverName
 * @param {string} opts.cwd
 * @param {"user" | "project"} [opts.permissionsScope]
 * @param {boolean} [opts.force]
 * @param {boolean} [opts.dryRun]
 * @param {string[]} [opts.allowTools]
 */
export async function runPermissionsApply(opts) {
  /** @type {string[]} */
  const messages = [];

  if (opts.client === "claude" || opts.client === "all") {
    const r = await applyClaudePermissions({
      preset: opts.preset,
      serverName: opts.serverName,
      permissionsScope: opts.permissionsScope ?? "user",
      cwd: opts.cwd,
      force: opts.force,
      dryRun: opts.dryRun,
      allowTools: opts.allowTools
    });
    if (!r.ok) return r;
    if (r.message) messages.push(r.message);
  }

  if (opts.client === "cursor" || opts.client === "all") {
    const r = await applyCursorPermissions({
      preset: opts.preset,
      serverName: opts.serverName,
      force: opts.force,
      dryRun: opts.dryRun,
      allowTools: opts.allowTools
    });
    if (!r.ok) return r;
    if (r.message) messages.push(r.message);
  }

  return { ok: true, messages };
}
