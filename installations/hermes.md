# GhostCrab MCP in Hermes Agent

Use this guide for [Hermes Agent](https://github.com/NousResearch/hermes-agent) interactive CLI (`hermes chat`). Hermes reads MCP servers from `~/.hermes/config.yaml` under `mcp_servers:` and skills from `~/.hermes/skills/`.

## Recommended install (generator)

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@0.6.6 gcp brain setup hermes \
  --package=@mindflight/ghostcrab-personal-mcp@0.6.6
```

This command:

1. Writes `mcp_servers.ghostcrab-personal-mcp` into `~/.hermes/config.yaml` (stdio launch with pinned `--db`).
2. Defaults SQLite to `~/.hermes/ghostcrab/ghostcrab.sqlite`.
3. Installs the 10-skill GhostCrab IDE bundle into `~/.hermes/skills/`.
4. Applies the **`basic`** MCP tool preset via `mcp_servers.<name>.tools.include` (Hermes analog to Cursor/Claude permissions).
5. Drops `~/.hermes/ghostcrab/setup-manifest.json` for profile/preconfig tooling.

Pin the package explicitly with `--package=…@0.6.6` so `npx` does not float to `@latest`.

### Options

```bash
# Preview without writing ~/.hermes
gcp brain setup hermes --dry-run \
  --package=@mindflight/ghostcrab-personal-mcp@0.6.6

# Replace an existing server entry
gcp brain setup hermes --force \
  --package=@mindflight/ghostcrab-personal-mcp@0.6.6

# Pin MindBrain workspace_id inside the SQLite file
gcp brain setup hermes \
  --package=@mindflight/ghostcrab-personal-mcp@0.6.6 \
  --mindbrain-workspace-id my-project

# Custom Hermes profile root (or set HERMES_HOME)
gcp brain setup hermes --hermes-home ~/.hermes-dev \
  --package=@mindflight/ghostcrab-personal-mcp@0.6.6

# Skills-only repair (no config.yaml write)
gcp brain setup_skills hermes
```

### Preconfig hooks (experimental)

Hermes profiles and distributions can ship richer defaults than MCP alone. The installer exposes optional preconfig modes:

| `--preconfig` | Effect |
|---------------|--------|
| `none` (default) | MCP server only |
| `minimal` | Ensures `skills.external_dirs: []` exists in config.yaml |
| `external-dirs` | Adds `~/.agents/skills` to `skills.external_dirs` and installs the skill bundle there instead of `~/.hermes/skills/` |

Future Hermes profile import can read `~/.hermes/ghostcrab/setup-manifest.json` to reconcile package pin, db path, and skills root without re-running setup.

## Generated config shape

After setup, `~/.hermes/config.yaml` contains something like:

```yaml
mcp_servers:
  ghostcrab-personal-mcp:
    command: "/usr/bin/npx"
    args:
      - "-y"
      - "--package=@mindflight/ghostcrab-personal-mcp@0.6.6"
      - "gcp"
      - "brain"
      - "up"
      - "--db"
      - "/home/you/.hermes/ghostcrab/ghostcrab.sqlite"
    env:
      GHOSTCRAB_EMBEDDINGS_MODE: disabled
      GHOSTCRAB_ACTIVE_WORKSPACE_ID: default
    tools:
      include:
        - ghostcrab_status
        - ghostcrab_search
        # … basic preset (13 tools)
```

Hermes discovers MCP tools at startup. Run `/reload-mcp` after changing config.

## Verify

```bash
hermes chat
```

Ask Hermes to call `ghostcrab_status` or list MCP tools. The server should stay up for the session lifetime.

Manual smoke test:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@0.6.6 gcp brain up \
  --db ~/.hermes/ghostcrab/ghostcrab.sqlite
```

Stop with `Ctrl+C` after confirming it starts cleanly.

## Do not confuse with ingest mode

Container fact-ingest overlays (mindbrain-semantic-ingest) run `gcp brain up --no-skills` against `/opt/data/ghostcrab`. That isolation policy is for batch ingest, not interactive Hermes CLI. See [gcp-brain-setup.md](gcp-brain-setup.md).

## Legacy adapter

The older [nous-hermes.md](nous-hermes.md) snippet used `@latest` and omitted `--db`. Prefer `gcp brain setup hermes` instead.

## Related

- Shared setup notes: [gcp-brain-setup.md](gcp-brain-setup.md)
- Hermes MCP reference: [Hermes MCP docs](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md)
- GhostCrab integration notes: [../ghostcrab-integrations/hermes-agent/](../ghostcrab-integrations/hermes-agent/)
