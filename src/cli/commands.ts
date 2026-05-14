import type { ParseArgsConfig } from "node:util";

export interface CliCommand {
  cliName: string;
  mcpToolName: string;
  description: string;
  parseArgsOptions: NonNullable<ParseArgsConfig["options"]>;
  subcommand?: string;
}

export const CLI_COMMANDS: CliCommand[] = [
  {
    cliName: "status",
    mcpToolName: "ghostcrab_status",
    description: "Return an operational snapshot with directives",
    parseArgsOptions: {
      "agent-id": { type: "string" }
    }
  }
];

export function resolveCommand(argv: string[]): CliCommand | undefined {
  const [cmd, sub] = argv;
  if (!cmd) {
    return undefined;
  }

  const withSub = CLI_COMMANDS.find(
    (c) => c.cliName === cmd && c.subcommand === sub
  );
  if (withSub) {
    return withSub;
  }

  return CLI_COMMANDS.find((c) => c.cliName === cmd && !c.subcommand);
}
