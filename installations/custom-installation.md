# Create a new GhostCrab installation guide

Use this checklist when adding a new file under `installations/`.

## 1. Classify the client

Choose one:

- **MCP client with JSON config:** adapt [universal-mcp-client.md](universal-mcp-client.md).
- **MCP client with CLI registry:** document the exact add/list/show/remove commands.
- **Agent runtime with skill/profile support:** include both MCP config and a pointer to the universal skill template.
- **No MCP support:** document that GhostCrab cannot be connected directly yet; do not invent a bridge.

## 2. Pin the GhostCrab command

Use the current package:

```bash
@mindflight/ghostcrab-personal-mcp
```

Preferred stdio command:

```bash
gcp brain up
```

Portable `npx` command:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

Do not use:

```bash
npx -y @mindflight/ghostcrab-personal-mcp@latest gcp brain up
```

That form is fragile for scoped packages whose package name differs from the binary name.

## 3. Include a verification path

Every guide should include:

- where to inspect the client's MCP server list
- where to inspect logs
- how to run the GhostCrab command manually
- how to confirm the agent sees GhostCrab tools

## 4. Include persistence decisions

State whether the install relies on:

- the client's working directory
- an explicit `cwd`
- `GHOSTCRAB_SQLITE_PATH`
- a named `--workspace`

For long-lived agents, prefer an explicit SQLite path or explicit working directory.

## 5. Add skill adaptation notes

If the client supports skills, copy or adapt:

- [templates/universal-ghostcrab-skill/SKILL.md](templates/universal-ghostcrab-skill/SKILL.md)

Keep client-specific loader metadata outside the portable skill body unless that metadata is required by the target agent.
