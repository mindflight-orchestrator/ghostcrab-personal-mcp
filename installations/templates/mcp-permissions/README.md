# MCP permission templates

Generated reference for preset **`basic`** (12 recommended GhostCrab tools).

Regenerate live output:

```bash
pnpm run build
gcp brain permissions print --preset basic --client all
```

## Claude Code (`permissions.allow`)

```json
{
  "permissions": {
    "allow": [
      "mcp__ghostcrab-personal-mcp__ghostcrab_status",
      "mcp__ghostcrab-personal-mcp__ghostcrab_search",
      "mcp__ghostcrab-personal-mcp__ghostcrab_count",
      "mcp__ghostcrab-personal-mcp__ghostcrab_combined_search",
      "mcp__ghostcrab-personal-mcp__ghostcrab_remember",
      "mcp__ghostcrab-personal-mcp__ghostcrab_upsert",
      "mcp__ghostcrab-personal-mcp__ghostcrab_schema_list",
      "mcp__ghostcrab-personal-mcp__ghostcrab_schema_inspect",
      "mcp__ghostcrab-personal-mcp__ghostcrab_pack",
      "mcp__ghostcrab-personal-mcp__ghostcrab_project",
      "mcp__ghostcrab-personal-mcp__ghostcrab_modeling_guidance",
      "mcp__ghostcrab-personal-mcp__ghostcrab_tool_search"
    ]
  }
}
```

## Cursor (`~/.cursor/permissions.json`)

```json
{
  "mcpAllowlist": [
    "ghostcrab-personal-mcp:ghostcrab_status",
    "ghostcrab-personal-mcp:ghostcrab_search",
    "ghostcrab-personal-mcp:ghostcrab_count",
    "ghostcrab-personal-mcp:ghostcrab_combined_search",
    "ghostcrab-personal-mcp:ghostcrab_remember",
    "ghostcrab-personal-mcp:ghostcrab_upsert",
    "ghostcrab-personal-mcp:ghostcrab_schema_list",
    "ghostcrab-personal-mcp:ghostcrab_schema_inspect",
    "ghostcrab-personal-mcp:ghostcrab_pack",
    "ghostcrab-personal-mcp:ghostcrab_project",
    "ghostcrab-personal-mcp:ghostcrab_modeling_guidance",
    "ghostcrab-personal-mcp:ghostcrab_tool_search"
  ]
}
```

See [README_MCP_PERMISSIONS.md](../../README_MCP_PERMISSIONS.md) for presets, setup defaults, and skill bundles.
