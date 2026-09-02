# GhostCrab beta bundle — Makefile workflow

## Where this runs

| OS | `make` supported? | Notes |
|----|-------------------|--------|
| **macOS** | Yes | `make` is Xcode CLT / default build tools. |
| **Linux** | Yes | `make`, `uname`, `grep` from distro packages. |
| **Windows (WSL2)** | Yes | Use Linux workflow; `uname` → `linux-x64` or `linux-arm64`. |
| **Windows (Git Bash / MSYS2)** | Yes* | GNU `make` + Unix tools required. `uname` reports `MINGW*/*MSYS*` → **`win32-x64`** or **`win32-arm64`** (aarch64). |
| **Windows (PowerShell only)** | Yes (install) | No POSIX shell for `make`. Use **`.\install-beta.ps1`** or **`node install-beta.mjs`**. |

\*If auto-detect ever fails on Windows, run: `make PLATFORM=win32-x64` or `make PLATFORM=win32-arm64`.

For the full guide (three install paths, npm, `.env`, IDE), see **[INSTALL.md](../../../INSTALL.md)** in the repository root (also shipped in the beta zip).

## Bundle layout

After unzip, a **flat** folder should contain the `.tgz` files, a private `package.json`, `install-beta.mjs`, `install-beta.ps1`, `lib/spawn-npm.mjs`, `Makefile`, `INSTALL.md`, etc. Default **`BUNDLE_DIR=.`** (current directory).

## Quick install

**Node (all platforms):**

```bash
node install-beta.mjs
```

**PowerShell (Windows):**

```powershell
.\install-beta.ps1
```

Or: `node install-beta.mjs` (same script; uses Windows-safe npm spawn internally).

**Makefile (macOS / Linux / WSL / Git Bash + make):**

```bash
make
```

Then: `make mcp` for the Cursor JSON snippet.

## Makefile targets

| Target | Purpose |
|--------|---------|
| `make` | `install` → `authorize` → `env` → `check` |
| `make install` | npm: main `.tgz` + platform `.tgz` in one transaction (`--no-package-lock`) |
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

See [installations/gcp-brain-setup.md](../../../installations/gcp-brain-setup.md).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Windows: `uname` / `make` not found | Use `.\install-beta.ps1`, `node install-beta.mjs`, or WSL. |
| Windows Git Bash: wrong platform tarball | `make PLATFORM=win32-x64` or `make PLATFORM=win32-arm64` |
| PowerShell: `npm.ps1` / script execution disabled | Use `install-beta.ps1` or `node install-beta.mjs` — do not rely on bare `npm` in PowerShell. |
| `spawnSync npm.cmd EINVAL` / `npm failed (exit null)` | Re-run with a current zip (`install-beta.mjs` uses `node` + `npm-cli.js`). Manual fallback: install the root and platform `.tgz` files together with `--no-package-lock`. |
| `Invalid Version` / npm `edgesOut` error | Stale partial install — `make clean && make` or remove `node_modules` and run `node install-beta.mjs` again. |
| After install, `npx gcp` fails in PowerShell | Use `node .\node_modules\@mindflight\ghostcrab-personal-mcp\bin\gcp.mjs` or `npx.cmd gcp`. |
