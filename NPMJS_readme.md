# GhostCrab — npm package & CLI reference

## Part 1 — npmjs: split packages, beta zip, and how to publish

### Package identity

- **Scope / name:** `@mindflight/ghostcrab-personal-mcp` (see root `package.json` for the current **version**).
- **Binaries:** `gcp`, `ghostcrab` (shim).

### Split architecture (six npm packages)

The **root** package is a small installer: it does **not** ship `prebuilds/` inside the same tarball.

| Package | Role |
|--------|------|
| `@mindflight/ghostcrab-personal-mcp` | JS/CLI, docs, skills, `postinstall`; declares **optionalDependencies** on the five platform packages below |
| `…-linux-x64`, `…-linux-arm64`, `…-darwin-x64`, `…-darwin-arm64`, `…-win32-x64` | One native build each (`ghostcrab-backend` + `ghostcrab-document` where applicable) |

At **`npm install`**, the client tries to install the **optional** package matching the current OS/CPU. The root **`postinstall`** ([`bin/lib/postinstall-prebuilds.mjs`](bin/lib/postinstall-prebuilds.mjs)) locates that binary, fixes permissions / quarantine when needed, runs a small smoke (`gcp --help`, backend `--help`). On success it may print **next steps** for IDE wiring (unless `GHOSTCRAB_POSTINSTALL_QUIET=1`):

- `npx gcp brain setup cursor`
- `npx gcp brain setup codex`
- `npx gcp brain setup claude`

**Maintainer / CI** still produce **`prebuilds/<platform-key>/`** under the repo (e.g. via [`scripts/cross-build-all.sh`](scripts/cross-build-all.sh)); [`scripts/stage-platform-packages.mjs`](scripts/stage-platform-packages.mjs) copies those into `packages/prebuild-*` before packing or publishing.

### What the root tarball includes

Aligned with `package.json` **`files`**: `bin/`, `dist/`, `ghostcrab-skills/`, `docs/`, `examples/`, `README.md`, **`INSTALL.md`**, `Licence.md`, `README_CLAUDE_CODE_MCP.md`, `README_CURSOR_MCP.md`, **`README_CODEX_MCP.md`**, `.env.example`.  
**Not** shipped in the root pack: `prebuilds/`, `src/`, `tests/`, `scripts/` (see [`scripts/verify-pack.mjs`](scripts/verify-pack.mjs)).

### Beta zip vs npm registry (two parallel channels)

| Channel | What users get |
|--------|----------------|
| **npmjs** | Install root → optional platform package from registry → `postinstall` |
| **Beta zip** (`pnpm run beta:bundle`) | Same six `.tgz` files as local [`pack:local`](scripts/pack-local.mjs), plus **`install-beta.mjs`**, tester **README** (from `docs/dev/beta_testers_readme.md`), **`INSTALL.md`**, Makefile helpers, `SHA256SUMS.txt` |

The zip path stays **separate** from npm: offline testers, pre-registry validation, or teams that avoid the public registry. See [`docs/dev/npm_split_release_process.md`](docs/dev/npm_split_release_process.md).

### Local maintainer workflow (before publishing)

```bash
# Cross-build backends → prebuilds/ (Zig 0.16.x — see cross-build-all.sh)
pnpm run prebuild:all    # or Makefile equivalent

# TypeScript
pnpm run build

# Assert root tarball contents (no prebuilds/, required docs present)
pnpm run verify:pack

# Produce dist-pack/*.tgz + pack-manifest.json (root + 5 platform tarballs)
pnpm run pack:local
# or reuse existing prebuilds:
pnpm run pack:local:reuse-prebuilds

# Optional: beta zip and smoke (uses dist-pack/)
pnpm run beta:bundle
pnpm run beta:smoke
```

### Publishing to npmjs (manual)

1. **Align versions (lockstep)** — Root `package.json` **version**, all five **`packages/prebuild-*/package.json`** versions, and root **`optionalDependencies`** must be **identical** for that release. [`scripts/publish-npm-split.mjs`](scripts/publish-npm-split.mjs) aborts if they differ.

2. **Build** — `prebuilds/` populated, then `npm ci` + `npm run build` (same idea as CI).

3. **Authenticate for non-interactive publish** — Set an npm **access token** (not your account password):

   ```bash
   export NODE_AUTH_TOKEN=npm_xxxxxxxx   # granular or classic publish token from npmjs.com
   npm run publish:npm-split
   # equivalent: node scripts/publish-npm-split.mjs
   ```

   The script runs **`npm publish --provenance --access public`** in order:

   1. `packages/prebuild-linux-x64`
   2. `packages/prebuild-linux-arm64`
   3. `packages/prebuild-darwin-x64`
   4. `packages/prebuild-darwin-arm64`
   5. `packages/prebuild-win32-x64`
   6. repository **root** (`@mindflight/ghostcrab-personal-mcp`)

   Publishing the **root before** the platform packages breaks installs that rely on `optionalDependencies`.

4. **Interactive alternative** — If you prefer not to use `NODE_AUTH_TOKEN`, run **`npm login`** once; npm stores a token in `~/.npmrc`. Then run `npm run publish:npm-split` in the same environment where `npm whoami` succeeds.

5. **`.env` variables such as `NPMJS_USERNAME`, `NPMJS_EMAIL`, `NPMJS_PASSWORD`** — npm **does not** read these for automation. **Do not** put your password in `NODE_AUTH_TOKEN`. For scripted/CI publishes, create an **npm access token** and use `NODE_AUTH_TOKEN` (or GitHub **`secrets.NPM_TOKEN`**). You can still use username/password **only** through interactive **`npm login`** (and OTP if 2FA is enabled).

### Publishing via GitHub Actions

On push of tag **`vMAJOR.MINOR.PATCH`** (semver), [`.github/workflows/publish.yml`](.github/workflows/publish.yml):

1. **`build-backends`** — vendor mindbrain, download sqlite amalgamation, **`scripts/cross-build-all.sh`**, upload `prebuilds/` artifact.
2. **`publish`** — checkout, `npm ci`, `npm run build`, download `prebuilds/`, **`node scripts/publish-npm-split.mjs`** with **`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`**.

Workflow env (see file for current pins): **Zig `0.16.0`**, **Node `20`**, SQLite **`3490100`**.  
OIDC **trusted publishing** can be configured on npm for GitHub Actions; the workflow still includes a token via the **`npm-publish`** environment for compatibility.

If the canonical remote is still GitLab, mirror the same steps in GitLab CI (`NODE_AUTH_TOKEN` / masked `NPM_TOKEN`); npm OIDC/provenance is GitHub-oriented.

### Runtime: `gcp brain up` (unchanged behavior)

When `gcp brain up` / `gcp up` (or legacy `gcp serve`) is called by an MCP client it:

1. Detects `{platform}-{arch}` and locates the backend binary (installed optional package or dev `prebuilds/` fallback).
2. Reads `<data-dir>/ghostcrab-backend.pid` (`pid:port`) — if the recorded backend is alive and healthy, reuses it.
3. Otherwise starts the backend as a **detached** process, redirecting output to `ghostcrab-backend.log`.
4. Polls `GET /health` until ready; on early exit, tails the log and surfaces the crash reason.
5. Writes `<data-dir>/ghostcrab-backend.pid` with `pid:port`.
6. Starts the MCP server on stdio.

### Pinned versions (change together where duplicated)

| Thing | Where |
|-------|--------|
| SQLite amalgamation | `scripts/download-sqlite3.sh`, `.github/workflows/publish.yml` (`SQLITE_VERSION`, `SQLITE_YEAR`) |
| Zig | **0.16.x** — `.github/workflows/publish.yml` (`ZIG_VERSION`), must match [`scripts/cross-build-all.sh`](scripts/cross-build-all.sh) |
| Node | `.github/workflows/publish.yml` (`NODE_VERSION`), `engines` in `package.json` |

### Security checklist before publish

- [ ] `pnpm run verify:pack` (or `npm pack` + review) — root tarball has **no** `prebuilds/`, **no** `src/`, **no** secrets; includes `INSTALL.md` and per-IDE READMEs as enforced by verify script.
- [ ] No committed `.env`, vendor secrets, or sqlite sources in pack.
- [ ] Platform binaries staged from trusted `prebuilds/` builds.
- [ ] `npm publish` uses **`--provenance`** where your registry/identity supports it.
- [ ] 2FA on the npm account; prefer **tokens** over passwords in CI.

**Further reading:** [`INSTALL.md`](INSTALL.md) (install paths for npm, beta zip, Git), [`README.md`](README.md) (quick “after install” on npm).

---

## Part 2 — `gcp` CLI command reference

Commands are grouped by **job to be done** (MindBrain “brain” vs agent “agent” vs `env` for config). Full table: `docs/reference/gcp-commands.md` in the repo. **Legacy one-word commands** (`serve`, `init`, `config`, `ontologies`, `skills`) stay as aliases.

Install globally:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp
# or
pnpm add -g @mindflight/ghostcrab-personal-mcp
```

The package exposes two binaries:
- **`gcp`** — full CLI (all subcommands below)
- **`ghostcrab`** — backward-compatible shim, equivalent to `gcp brain up` / `gcp serve`

---

### `gcp brain up` (shorthand: `gcp up` — legacy: `gcp serve`)

Start the MindBrain (Zig) backend if needed, then the MCP server on stdio. This is what MCP clients invoke.

```bash
gcp brain up [--workspace <name>]
# or:  gcp up …
# legacy:  gcp serve …
```

**Workspace resolution** (highest priority first):
1. `--workspace` flag → looks up workspace in `~/.config/ghostcrab/config.json`
2. `GHOSTCRAB_SQLITE_PATH` env var → bypasses workspace config entirely
3. `config.defaultWorkspace`
4. Built-in default: `./data/ghostcrab.sqlite` in `cwd`

**MCP client config examples:**

```json
// Cursor / Claude Desktop (default workspace)
{ "command": "gcp", "args": ["brain", "up"] }

// Named workspace
{ "command": "gcp", "args": ["brain", "up", "--workspace", "my-project"] }

// Legacy: "args": ["serve", …]  still works
```

**Environment variables (all optional):**

| Variable | Default | Description |
|----------|---------|-------------|
| `GHOSTCRAB_SQLITE_PATH` | (from workspace config) | SQLite file path |
| `GHOSTCRAB_BACKEND_ADDR` | `:8091` | Backend listen address |
| `GHOSTCRAB_MINDBRAIN_URL` | `http://127.0.0.1:8091` | MCP → backend URL |

---

### `gcp brain workspace create` (legacy: `gcp init`)

Create / register a named workspace. Creates the config entry and data directory.
The SQLite database itself is created by the backend on first `gcp brain up`.

```bash
gcp brain workspace create [workspace-name]
# default name: "default"  |  legacy:  gcp init [workspace-name]
```

Example (snippet) — `gcp` now suggests `args` with `brain`, `up`:

```
✓ Workspace "my-project" initialised
  …
Add this to your MCP client config:
{
  "ghostcrab": { "command": "gcp", "args": ["brain", "up", "--workspace", "my-project"] }
}
```

---

### `gcp env` (legacy: `gcp config`)

Read and write `~/.config/ghostcrab/config.json`.

```bash
gcp env list | show                 # Print all values (list and show are aliases)
gcp env get <key>                   # Get a single value (dot notation)
gcp env set <key> <value>          # Set a value
gcp env path                        # Print path to config file
# legacy:  gcp config <sub>   — same subcommands
```

**Common keys:**

| Key | Default | Description |
|-----|---------|-------------|
| `registry.url` | `https://registry.ghostcrab.io` | Registry server URL |
| `registry.token` | `(not set)` | Bearer token for private resources |
| `defaultWorkspace` | `(not set)` | Workspace used when `--workspace` is omitted |

```bash
# Examples
gcp env set registry.token sk_live_xyz
gcp env set registry.url https://my-internal.example.com
gcp env set defaultWorkspace work
gcp env list
```

> `registry.token` is stored in plain text in the config file. Use `chmod 600
> ~/.config/ghostcrab/config.json` or set `GHOSTCRAB_REGISTRY_TOKEN` via your
> secrets manager instead.

---

### `gcp brain schema` (legacy: `gcp ontologies`)

Manage **knowledge / schema** ontologies pulled from the registry (structure in the DB).

```bash
gcp brain schema list [--remote]                 # or: gcp ontologies list …
gcp brain schema pull <owner/name> [--token <t>] [--registry <url>]
gcp brain schema remove <owner/name>
gcp brain schema show <owner/name>               # Print to stdout
```

**Local storage:** `~/.local/share/ghostcrab/ontologies/{owner}/{name}/`

Each installed ontology contains:
- `content.yaml` — the ontology content (may be watermarked if private)
- `manifest.json` — version, access level, pull timestamp

```bash
# Examples
gcp brain schema list
gcp brain schema list --remote
gcp brain schema pull mindflight/mindbrain
gcp brain schema pull company/internal --token sk_live_xyz
gcp brain schema remove mindflight/mindbrain
```

**Privacy model — watermarking:**  
Private ontologies have a header injected by the registry server identifying the
licensee. Redistribution is traceable but not cryptographically prevented.

```yaml
# ghostcrab-license: Company A Inc.
# resource: company/internal
# pulled: 2026-04-14T10:00:00Z
# This file is licensed to the above entity only. Do not redistribute.

# ... ontology content follows ...
```

---

### `gcp agent skills` (legacy: `gcp skills`) and `gcp agent equip`

**Agent skills** — capabilities for MCP agents (Markdown). Same interface as schema/ontologies, different purpose.

```bash
gcp agent skills list [--remote]
gcp agent skills pull <owner/name> [--token <t>] [--registry <url>]
gcp agent skills remove <owner/name>
gcp agent skills show <owner/name>
gcp agent equip <owner/name>        # shortcut for: gcp agent skills pull …
# legacy:  gcp skills …
```

**Local storage:** `~/.local/share/ghostcrab/skills/{owner}/{name}/`

---

### Global pull flags

Both `brain schema pull` / `ontologies pull` and `agent skills pull` / `skills pull` accept:

| Flag | Description |
|------|-------------|
| `--token <tok>` | Override `registry.token` from config for this call |
| `--registry <url>` | Override `registry.url` from config for this call |

---

### Config file location

| Platform | Path |
|----------|------|
| Linux | `$XDG_CONFIG_HOME/ghostcrab/config.json` → `~/.config/ghostcrab/config.json` |
| macOS | `~/Library/Application Support/ghostcrab/config.json` |
| Windows | `%APPDATA%\ghostcrab\config.json` |

Override with `GHOSTCRAB_CONFIG_DIR` env var.

### Data directory location

| Platform | Path |
|----------|------|
| Linux | `$XDG_DATA_HOME/ghostcrab` → `~/.local/share/ghostcrab` |
| macOS | `~/Library/Application Support/ghostcrab` |
| Windows | `%APPDATA%\ghostcrab` |

Override with `GHOSTCRAB_DATA_DIR` env var.
