# GhostCrab Rename Plan

This repository now treats `GhostCrab` as the public product name everywhere user-facing.

## Public Naming Rules

The following surfaces must use `ghostcrab`:

- package: `@mindflight/ghostcrab`
- CLI binary: `ghostcrab`
- MCP server name: `ghostcrab`
- public MCP tools: `ghostcrab_*`
- public env vars: `GHOSTCRAB_*`
- public schema ids: `ghostcrab:*`
- seeded product domain: `ghostcrab-product`
- client integration repo naming: `ghostcrab-skills`

## Internal Naming Rules

The following surfaces remain unchanged:

- SQL tables: `mfo_*`
- SQL functions: `mfo_*`
- internal namespace: `mfo:`
- extension packages: `pg_facets`, `pg_dgraph`, `pg_pragma`

## Verification Rules

After the rename:

1. product build, lint, tests, and MCP smokes must pass
2. skills validation must pass in strict mode
3. repo sweeps must not return stray public `strata` surfaces except in archived historical notes
4. docs, prompts, hooks, and examples must refer to `ghostcrab_*`

## Explicit Non-Goals

- no migration layer
- no backward-compatible `strata_*` aliases
- no rename of `mfo_*`
