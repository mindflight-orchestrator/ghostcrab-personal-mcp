# Remote demos (companion bundle)

This folder is a **template** for a small Git repository you can publish elsewhere: it versions **JSONL profiles**, optionally **vendored skills**, and a **manifest** that runs `gcp` after clone.

Conceptual overview (skillset + demo import): see [docs/setup/skillset-demo-import.md](../../docs/setup/skillset-demo-import.md).

## Prereqs

- Node 20+
- GhostCrab CLI from npm: this example depends on `@mindflight/ghostcrab-personal-mcp` via `file:../..` so contributors can run it inside the monorepo. For a standalone remote repo, change `package.json` to:

  `"@mindflight/ghostcrab-personal-mcp": "^0.2.12"`

- **MindBrain reachable** at `GHOSTCRAB_MINDBRAIN_URL` (start your stack with `gcp brain up` from a configured project, or point the URL at your deployment).
- For **registry** pulls listed in `demo-manifest.json`: configure once:

  ```bash
  gcp env set registry.token <token>
  gcp env set registry.url https://registry.ghostcrab.io
  ```

## Quick start (from this path)

```bash
cd examples/remote-demos
cp .env.example .env
# Edit .env if your MindBrain URL differs
```

If you use the monorepo `file:../..` dependency, build the parent package once so `gcp load` can find `dist/cli/demo-load.js`:

```bash
cd ../..
pnpm run build
cd examples/remote-demos
```

```bash
npm install
npm run setup
```

`npm run setup` runs, in order:

1. `gcp brain schema pull` for each id in `schemas`
2. `gcp agent skills pull` for each id in `skills`
3. `gcp agent skills install --dir …` for each path in `local_skills`
4. `gcp load` for each file in `profiles`

Re-running is mostly **idempotent** (demo loader skips duplicate facts/nodes/edges/projections).

### Profiles only

```bash
npm run load
```

## Layout

| Path                 | Purpose                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `demo-manifest.json` | Lists registry schemas/skills, local skill directories, and profile files                                                    |
| `profiles/*.jsonl`   | Demo seeds ([JSONL kinds](https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp/blob/main/src/cli/demo-load.ts)) |
| `vendor/**`          | Vendored skills (`SKILL.md` or `content.md` + optional `manifest.json` with `owner` / `name`)                                |
| `scripts/setup.mjs`  | Orchestration                                                                                                                |

## JSONL format

Each line is JSON with `kind`: `profile` (metadata only, not inserted), `remember`, `learn_node`, `learn_edge`, `projection`. See `src/cli/demo-load.ts` in the main repo for field definitions.

## MCP in your IDE

After data and skills are in place, register GhostCrab in the IDE if needed (`gcp brain setup cursor`, etc.) and start `gcp brain up --workspace <name>` consistent with your environment.

## Publishing as its own repo

1. Copy this tree (or make it a Git template).
2. Replace the `file:../..` dependency with a published `@mindflight/ghostcrab-personal-mcp` semver range.
3. Adjust `demo-manifest.json`, `profiles/`, and `vendor/` for your story.
