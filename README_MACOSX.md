# GhostCrab Personal MCP on macOS (Intel & Apple Silicon)

This guide covers **installing and running `@mindflight/ghostcrab-personal-mcp`** on macOS. The Personal edition uses **SQLite + MindBrain (Zig)** — not PostgreSQL extensions.

**Current release:** npm **`0.5.2`** · bundled MindBrain backend **`1.7.1`**

| Platform | npm optional package | Native prebuild |
| -------- | -------------------- | --------------- |
| **Apple Silicon (arm64)** | `@mindflight/ghostcrab-personal-mcp-darwin-arm64` | `ghostcrab-backend`, `ghostcrab-document` |
| **Intel Mac (x86_64)** | `@mindflight/ghostcrab-personal-mcp-darwin-x64` | same |

For architecture, MCP wiring, and tool surface, see the [main README](README.md).

---

## Prerequisites

- **Node.js 20+** (`node --version`)
- **Network access** on first install (JS package + platform optional dependency)
- **Xcode Command Line Tools** recommended (`xcode-select --install`) — required only if you build the Zig backend from source

You do **not** need PostgreSQL, Homebrew Postgres, or `pg_facets` for the Personal SQLite distribution.

---

## Recommended path — npm install

From your project directory:

```bash
npm install @mindflight/ghostcrab-personal-mcp@0.5.2
```

Global install also works:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp@0.5.2
```

**pnpm 10+** blocks postinstall by default — allow it once:

```bash
pnpm add --allow-build=@mindflight/ghostcrab-personal-mcp @mindflight/ghostcrab-personal-mcp@0.5.2
```

After install, `postinstall`:

1. Pulls the matching **darwin-arm64** or **darwin-x64** optional package
2. Runs `gcp authorize` prompts if needed (clears macOS quarantine on native binaries)
3. Creates `./data/`, copies `.env` from `.env.example` when missing, and symlinks key docs at the project root

Verify before wiring your IDE:

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@0.5.2 gcp --info
timeout 8 npx -y --package=@mindflight/ghostcrab-personal-mcp@0.5.2 gcp brain up
```

Register MCP + skills (Cursor example):

```bash
npx -y --package=@mindflight/ghostcrab-personal-mcp@0.5.2 gcp brain setup cursor --force
```

Details: [README_CURSOR_MCP.md](README_CURSOR_MCP.md), [INSTALL.md](INSTALL.md).

---

## macOS-specific notes

### Gatekeeper / quarantine

If the backend fails to start after download, run:

```bash
gcp authorize
```

This adjusts execute permissions and removes quarantine attributes from `ghostcrab-backend` and `ghostcrab-document` inside `node_modules`.

### `spawn gcp ENOENT` in Cursor

Cursor does not inherit your shell `PATH`. Re-run setup so `mcp.json` uses **absolute paths** to your system `node` and `bin/gcp.mjs`:

```bash
gcp brain setup cursor --force
```

See [README_CURSOR_MCP.md](README_CURSOR_MCP.md#cursor-spawn-gcp-enoent--npm-error-could-not-determine-executable-to-run).

### SQLite location

Default resolution order:

1. `GHOSTCRAB_SQLITE_PATH` env var
2. `--db` CLI flag
3. Named `--workspace` mapping in GhostCrab config
4. `./data/ghostcrab.sqlite` (cwd) or `~/.ghostcrab/databases/ghostcrab.sqlite`

Pin a file in MCP config with `--db` or `GHOSTCRAB_SQLITE_PATH` when the IDE's working directory is not your project root.

### Apple Silicon vs Rosetta

Use the **arm64** Node build when possible so npm selects `@mindflight/ghostcrab-personal-mcp-darwin-arm64`. Running x64 Node under Rosetta pulls the Intel prebuild instead.

Check:

```bash
node -p "process.platform + '-' + process.arch"
# expect: darwin-arm64 or darwin-x64
```

---

## Build from source (contributors)

Only needed when developing this repo or producing local `.tgz` packs — not for normal npm consumers.

### Prerequisites

- **Zig 0.16.x** ([ziglang.org](https://ziglang.org/download/) or `brew install zig`)
- **pnpm 10+** and **Node 20+**
- Git submodules: `vendor/mindbrain` (MindBrain **1.7.1**)

```bash
git clone --recurse-submodules https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp.git
cd ghostcrab-personal-mcp
pnpm install
make backend-vendor sqlite3-download
make backend-build          # host darwin-arm64 or darwin-x64
pnpm run build
node bin/gcp.mjs brain up
```

Cross-compile all six platform prebuilds (maintainers):

```bash
pnpm run prebuild:all
# or: make prebuilds
```

Local pack for offline install:

```bash
pnpm run pack:local
# tarballs under dist-pack/
```

Beta zip (same tarballs + `install-beta.mjs`): `pnpm run beta:bundle`

### Cross-compile one macOS target from the other arch

```bash
make backend-build ZIG_TARGET=aarch64-macos    # Intel host → Apple Silicon binary
make backend-build ZIG_TARGET=x86_64-macos       # Apple Silicon host → Intel binary
```

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Native binary missing after install | Install platform tarball manually from a beta zip or `dist-pack/` — see [INSTALL.md](INSTALL.md) |
| `Ignored build scripts` (pnpm) | `pnpm add --allow-build=@mindflight/ghostcrab-personal-mcp …` |
| Backend exits immediately | Check MCP Logs / run `gcp brain up` in a terminal; verify `gcp authorize` |
| Wrong SQLite file | Set `GHOSTCRAB_SQLITE_PATH` or `--db` — see precedence in [README_CURSOR_MCP.md](README_CURSOR_MCP.md) |
| CLI import fails while MCP runs | Stop MCP / backend first, or use `--force` on import commands |

---

## Related docs

- [README.md](README.md) — product overview, MCP tool catalog, agent install sequence
- [README_CURSOR_MCP.md](README_CURSOR_MCP.md) · [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md) · [README_CODEX_MCP.md](README_CODEX_MCP.md)
- [docs/dev/INTERNALS.md](docs/dev/INTERNALS.md) — repository layout (PostgreSQL paths there are maintainer-only)

**Note:** `scripts/build-macos.sh` in this repo targets legacy **PostgreSQL extension** builds (`pg_facets`, `pg_dgraph`) for Pro/maintainer workflows — not the Personal SQLite npm package.
