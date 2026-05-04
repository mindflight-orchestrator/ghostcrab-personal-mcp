# GhostCrab beta bundle — Makefile workflow

## Where this runs

| OS | `make` supported? | Notes |
|----|-------------------|--------|
| **macOS** | Yes | `make` is Xcode CLT / default build tools. |
| **Linux** | Yes | `make`, `uname`, `grep` from distro packages. |
| **Windows (WSL2)** | Yes | Use Linux workflow; `uname` → `linux-x64` or `linux-arm64`. |
| **Windows (Git Bash / MSYS2)** | Yes* | GNU `make` + Unix tools required. `uname` reports `MINGW*/*MSYS*` → Makefile maps to **`win32-x64`**. |
| **Windows (PowerShell only)** | No | No POSIX shell for recipes. Use **`node install-beta.mjs`** or install WSL / Git Bash + make. |

\*If auto-detect ever fails on Windows, run: `make PLATFORM=win32-x64`.

For the full guide (three install paths, npm, `.env`, IDE), see **[INSTALL.md](../../INSTALL.md)** in the repository root (also shipped in the beta zip).

## Bundle layout

After unzip, a **flat** folder should contain the `.tgz` files, `install-beta.mjs`, `Makefile`, `INSTALL.md`, etc. Default **`BUNDLE_DIR=.`** (current directory).

## Quick install

**Node (all platforms):**

```bash
node install-beta.mjs
```

**Makefile (macOS / Linux / WSL / Git Bash + make):**

```bash
make
```

Then: `make mcp` for the Cursor JSON snippet.

## Makefile targets

| Target | Purpose |
|--------|---------|
| `make` | `install` → `authorize` → `env` → `check` |
| `make install` | npm: main `.tgz` + platform `.tgz` (`--no-package-lock` on platform) |
| `make authorize` | `gcp authorize` |
| `make env` | Create `.env` from package `.env.example` if missing |
| `make check` | `gcp --help` smoke test |
| `make mcp` | Print Cursor `mcp.json` block; `grep` checks `~/.cursor/mcp.json` |
| `make clean` | Remove `node_modules` + `package-lock.json` |

Variables: **`VERSION`**, **`BUNDLE_DIR`**, **`PLATFORM`** (override if detection is wrong).

## IDE

```bash
npx gcp brain setup cursor
npx gcp brain setup codex
npx gcp brain setup claude
```

See [README_CURSOR_MCP.md](../../README_CURSOR_MCP.md), [README_CODEX_MCP.md](../../README_CODEX_MCP.md), [README_CLAUDE_CODE_MCP.md](../../README_CLAUDE_CODE_MCP.md).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Windows: `uname` / `make` not found | Use `node install-beta.mjs` or WSL. |
| Windows Git Bash: wrong platform tarball | `make PLATFORM=win32-x64` |
| `Invalid Version` on second npm install | Stale lockfile — `make clean && make` or rely on `install-beta.mjs`. |
