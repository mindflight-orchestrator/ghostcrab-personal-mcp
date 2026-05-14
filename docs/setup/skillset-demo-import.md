# Skillset and demo import

This document describes how to **equip a GhostCrab setup** with a curated **skillset** (registry and/or vendored skills) and **demo data** (JSONL profiles), especially using the companion bundle under [`examples/remote-demos/`](../../examples/remote-demos/).

## What you are importing

| Track | Mechanism | Stored |
|-------|-----------|--------|
| **Ontology / schema** | `gcp brain schema pull owner/name` | Local ontology store under GhostCrab data dir |
| **Registry skills** | `gcp agent skills pull owner/name` | `.../skills/<owner>/<name>/` |
| **Vendored skills** (no registry) | `gcp agent skills install --dir <path>` | Same layout as pull |
| **Demo facts / graph / projections** | `gcp load <file.jsonl>` or `gcp brain load ...` | MindBrain DB (via running backend) |

JSONL line kinds and fields: see [`src/cli/demo-load.ts`](../../src/cli/demo-load.ts) (`profile`, `remember`, `learn_node`, `learn_edge`, `projection`). The `profile` line is metadata only for the file; it is not inserted as a row.

## Bundled example: `examples/remote-demos`

The **remote-demos** tree is a template for "clone, install npm deps, run one script":

1. **`demo-manifest.json`** — ordered lists: `schemas`, `skills`, `local_skills` (directories), `profiles` (JSONL paths).
2. **`npm run setup`** — runs `scripts/setup.mjs`, which chains the `gcp` commands above in that order.
3. **`npm run load`** — runs profile loads only (`--profiles-only`), useful when schemas/skills are already in place.

Full steps and publishing notes: [examples/remote-demos/README.md](../../examples/remote-demos/README.md).

## Prerequisites

- **MindBrain** reachable at `GHOSTCRAB_MINDBRAIN_URL` (e.g. after `gcp brain up` in a project that matches your env). `gcp load` talks to the backend; it does not replace product bootstrap applied at server start.
- **Registry** access for pulls in your manifest: `gcp env set registry.token ...` and optional `registry.url` (see [gcp-client-setup.md](./gcp-client-setup.md)).
- **Built CLI artifact** for `gcp load`: published npm packages ship `dist/`; when using `file:../..` from the monorepo, run `pnpm run build` at the repo root first.

## MCP / IDE

After skills and data are loaded, register GhostCrab in your agent host if needed (`gcp brain setup cursor`, etc.) and start MCP with the workspace you intend to use (`gcp brain up` and `--workspace` as usual).

## See also

- [gcp-commands.md](../reference/gcp-commands.md) — full `gcp` command table
- [gcp-client-setup.md](./gcp-client-setup.md) — config, env, demo profiles overview
