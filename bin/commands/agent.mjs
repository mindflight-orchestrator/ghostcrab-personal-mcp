/**
 * gcp agent — agent-facing axis: skills / capabilities the MCP client can use.
 *
 * JTBD: equip agents with actions (skills), not structure (see gcp brain schema).
 */

export async function cmdAgent(args) {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub || sub === "--help" || sub === "-h") {
    printAgentHelp();
    return;
  }

  switch (sub) {
    case "skills": {
      const { cmdSkills } = await import("./skills.mjs");
      await cmdSkills(rest);
      break;
    }
    case "equip": {
      const id = rest[0];
      if (!id || id.startsWith("-")) {
        console.error(
          'gcp agent equip: resource ID required (e.g. mindflight/coding-assistant)\n' +
            "  This runs the same as: gcp agent skills pull <owner/name>"
        );
        process.exit(1);
      }
      const extra = rest.slice(1);
      const { cmdSkills } = await import("./skills.mjs");
      await cmdSkills(["pull", id, ...extra]);
      break;
    }
    default:
      console.error(
        `gcp agent: unknown subcommand "${sub}". Run "gcp agent --help".`
      );
      process.exit(1);
  }
}

function printAgentHelp() {
  console.log(`
Usage: gcp agent <subcommand>

Equip agents (skills = executable guidance / prompts for MCP), distinct from brain schema.

Subcommands:
  skills <list|pull|remove|show>   Manage registry-backed skills
  equip <owner/name>               Shortcut for: gcp agent skills pull <owner/name>

Examples:
  gcp agent skills list --remote
  gcp agent skills pull mindflight/coding-assistant
  gcp agent equip mindflight/coding-assistant

Legacy:  gcp skills …  (same as gcp agent skills …)
`.trim());
}
