# GhostCrab Personal MCP — installation (SQLite)

This document covers **`@mindflight/ghostcrab-personal-mcp`**: the Node CLI (`gcp`), the MCP server, and the **Zig MindBrain backend** shipped as platform-specific optional packages.

---

## FR — Démarrage rapide

### Parcours par défaut (npmjs)

1. **Prérequis:** Node.js **20+**, accès Internet pour les dépendances JS.
2. **Installer:** `npm install -g @mindflight/ghostcrab-personal-mcp@latest` *ou* tester avec `npx -y @mindflight/ghostcrab-personal-mcp@latest gcp --help`.
3. Si besoin après `postinstall` : **`npx gcp authorize`**.
4. **Avant l’IDE :** depuis la racine du projet, `npx gcp brain up --help` ; optionnel : `timeout 8 npx gcp brain up` (Ctrl+C — attente stdio MCP). Si Cursor affiche **`spawn gcp ENOENT`** ou **`npm error could not determine executable to run`**, relancez le setup (étape 5) — cela reconfigure l'entrée avec un chemin absolu. Détails : [README_CURSOR_MCP.md](README_CURSOR_MCP.md).
5. **IDE :** `npx gcp brain setup cursor --force` | `npx gcp brain setup codex` | `npx gcp brain setup claude` — enregistre le MCP sous **`ghostcrab-personal-mcp`** avec un chemin absolu vers `bin/gcp.mjs` (supprime automatiquement l’ancienne entrée `ghostcrab`). Détails : [README_CURSOR_MCP.md](README_CURSOR_MCP.md), [README_CODEX_MCP.md](README_CODEX_MCP.md), [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md).
6. **Optionnel :** un `.env` est souvent créé à l’install locale ; sinon copiez depuis le paquet (voir § Fichier `.env` ci‑dessous).
7. Au run, le client MCP lance **`gcp brain up`** / **`gcp serve`** (MindBrain + stdio MCP).

Les **autres voies** (zip bêta, dépôt Git, optional manquant) suivent dans **Trois façons d’installer**.

### Prérequis

- **Node.js 20+** et `npm` (ou `pnpm`).
- **Accès Internet** pour les dépendances JS du paquet principal.
- **`make` (optionnel)** : macOS et Linux — oui. Windows — plutôt **WSL**, **Git Bash + GNU Make**, ou utilisez uniquement **`node install-beta.mjs`** (recommandé sous Windows sans outils Unix). Détails : [docs/installer-question/README.md](docs/installer-question/README.md).
- Voie **dépôt Git** : voir le [Makefile](Makefile) (`make help`) — Zig 0.16, `pnpm`, etc. selon ce que vous construisez.

### Trois façons d’installer

**1 — Bêta (zip)**  
Dézipper le bundle, puis dans le dossier qui contient les `.tgz` et `install-beta.mjs` :

```bash
node install-beta.mjs
```

Cela installe le paquet **principal** et le **binaire natif** pour votre OS (Linux x64/ARM64, macOS Intel/Apple Silicon, Windows x64). Sans la plateforme, le backend Zig n’est pas présent — le MCP ne pourra pas démarrer le serveur HTTP MindBrain.

Dans le **zip bêta**, un `Makefile` et `README_MAKE.md` sont fournis à côté des `.tgz` (`make` puis `make mcp`). Dans le dépôt : [docs/installer-question/](docs/installer-question/README.md).

**2 — npm (npmjs)**  
Si les paquets **plateforme** sont publiés pour votre version, npm peut les tirer comme `optionalDependencies` :

```bash
npm install -g @mindflight/ghostcrab-personal-mcp@latest
# ou sans global :
npx -y @mindflight/ghostcrab-personal-mcp@latest gcp --help
```

Si l’optional échoue (paquet absent du registry, offline, etc.), installez aussi le tarball plateforme depuis une build locale ou un zip bêta, comme en voie 1.

**Après `npm install @mindflight/ghostcrab-personal-mcp` dans un projet** (un `package.json` existe déjà à la racine) : le `postinstall` crée **`./data/`**, copie **`.env`** à partir de `.env.example` du paquet si `.env` est absent, et pose des **liens symboliques** vers `README.md`, `INSTALL.md`, `Licence.md` et les `README_*_MCP.md` du paquet — pour ne pas se retrouver seulement avec `node_modules`. Désactiver : `GHOSTCRAB_SKIP_HOST_BOOTSTRAP=1`.

**Utilisateurs pnpm :** pnpm 10+ ignore les `postinstall` par défaut (message **`Ignored build scripts: @mindflight/ghostcrab-personal-mcp`**). Pour activer la création de `.env`/`data/`/liens symboliques (et le chmod du binaire natif), lancez une fois **`pnpm approve-builds`** et autorisez `@mindflight/ghostcrab-personal-mcp`, ou installez avec **`pnpm add --allow-build=@mindflight/ghostcrab-personal-mcp @mindflight/ghostcrab-personal-mcp@latest`**. Avec **npm**, rien à configurer.

**3 — Dépôt (accès Git)**  
MindBrain est fourni comme **sous-module** sous `vendor/mindbrain` ([sources publiques](https://github.com/mindflight-orchestrator/mindbrain)). Clonez avec :

```bash
git clone --recurse-submodules https://github.com/OWNER/ghostcrab-personal-mcp.git
cd ghostcrab-personal-mcp
```

Sans sous-modules au premier clone : `git submodule update --init --recursive`.

Pour développer ou produire des `.tgz` vous-même :

- `make lib-build` — build JS seul  
- `make local-pack` ou `pnpm run pack:local` — tarball sous `dist-pack/`  
- `make prebuilds` puis `pnpm run pack:local` — inclut les binaires pour les 5 plateformes  

Détails : [Makefile](Makefile), [docs/dev/npm_split_release_process.md](docs/dev/npm_split_release_process.md).

### Base sans rien configurer (LLM optionnel)

Par défaut, **`GHOSTCRAB_EMBEDDINGS_MODE=disabled`** : recherche **BM25** seule, **pas de clé API** requise. Le fichier SQLite est créé au premier **`gcp brain up`** / connexion MCP (souvent `./data/ghostcrab.sqlite` selon le répertoire de travail).

### Fichier `.env` (embeddings / clés API)

Pour activer les embeddings (hybride) ou d’autres réglages, un **`.env`** est souvent déjà présent après install locale ; sinon copiez l’exemple fourni dans le paquet installé :

```bash
# après npm install du paquet principal (projet local)
cp node_modules/@mindflight/ghostcrab-personal-mcp/.env.example .env
```

Puis éditez `.env` (clés, `GHOSTCRAB_EMBEDDINGS_MODE`, etc.). Référence des variables : [.env.example](.env.example).

Installation **globale** : le fichier se trouve sous `$(npm root -g)/@mindflight/ghostcrab-personal-mcp/.env.example`.

### IDE : enregistrer le MCP (une commande)

Depuis la racine du projet où le paquet est installé localement (ou où `gcp` est dans le `PATH`) :

```bash
npx gcp brain setup cursor --force
npx gcp brain setup codex
npx gcp brain setup claude
```

Le générateur utilise un chemin absolu vers `bin/gcp.mjs` quand le paquet est installé localement, et `npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up` en fallback. L’ancienne entrée `ghostcrab` est supprimée automatiquement.

Guides détaillés : [README_CURSOR_MCP.md](README_CURSOR_MCP.md), [README_CODEX_MCP.md](README_CODEX_MCP.md), [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md).

---

## EN — Quick start

### Default install (npm registry)

1. **Prerequisites:** Node.js **20+** and network access for JS dependencies.
2. **Install:** `npm install -g @mindflight/ghostcrab-personal-mcp@latest` **or** try `npx -y @mindflight/ghostcrab-personal-mcp@latest gcp --help`.
3. If `postinstall` asked for it: **`npx gcp authorize`**.
4. **Verify before the IDE:** `npx gcp brain up --help` from your project root; optionally `timeout 8 npx gcp brain up` (Ctrl+C — it waits on stdio for MCP). If Cursor logs **`spawn gcp ENOENT`** or **`npm error could not determine executable to run`**, re-run setup (step 5) — it regenerates the MCP entry with an absolute path. Details: [README_CURSOR_MCP.md](README_CURSOR_MCP.md).
5. **Wire your IDE:** `npx gcp brain setup cursor --force` | `npx gcp brain setup codex` | `npx gcp brain setup claude` — registers the MCP server under **`ghostcrab-personal-mcp`** using an absolute path to `bin/gcp.mjs` (auto-removes any stale `ghostcrab` entry). Details: [README_CURSOR_MCP.md](README_CURSOR_MCP.md), [README_CODEX_MCP.md](README_CODEX_MCP.md), [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md).
6. **Optional `.env`:** often created automatically on local install; otherwise copy from the package (see **`.env` for embeddings / API keys** below).
7. At runtime, MCP clients should start **`gcp brain up`** / **`gcp serve`** (MindBrain + MCP on stdio).

**Other channels** (beta zip, Git checkout, failed optional) are in **Three installation paths** below.

### Prerequisites

- **Node.js 20+** and `npm` (or `pnpm`).
- **Internet** for the main package’s JS dependency tree.
- **`make` (optional):** macOS and Linux — fine. Windows — use **WSL**, **Git Bash + GNU Make**, or skip `make` and use **`node install-beta.mjs`** (simplest on Windows without Unix tools). See [docs/installer-question/README.md](docs/installer-question/README.md).
- **Git / dev path:** see the repo [Makefile](Makefile) (`make help`) for Zig, `pnpm`, etc.

### Three installation paths

**1 — Beta (zip)**  
Unzip the bundle, then in the folder that contains the `.tgz` files and `install-beta.mjs`:

```bash
node install-beta.mjs
```

This installs the **main** package and the **native binary** for your OS. Without the platform package, the Zig backend is missing and MindBrain cannot start.

The **beta zip** includes a `Makefile` and `README_MAKE.md` next to the `.tgz` files (`make`, then `make mcp`). In the repo: [docs/installer-question/](docs/installer-question/README.md).

**2 — npm (npmjs)**  
When platform packages are published for your release, npm may install them as `optionalDependencies`:

```bash
npm install -g @mindflight/ghostcrab-personal-mcp@latest
# or without a global install:
npx -y @mindflight/ghostcrab-personal-mcp@latest gcp --help
```

If the optional install fails, add the platform tarball (local build or beta zip), same as path 1.

**After `npm install @mindflight/ghostcrab-personal-mcp` in a project** (you already have a root `package.json`): `postinstall` creates **`./data/`**, copies **`.env`** from the package `.env.example` if `.env` is missing, and adds **symlinks** to `README.md`, `INSTALL.md`, `Licence.md`, and the `README_*_MCP.md` files from the package. Opt out: `GHOSTCRAB_SKIP_HOST_BOOTSTRAP=1`.

**pnpm users:** pnpm 10+ ignores `postinstall` scripts by default (message **`Ignored build scripts: @mindflight/ghostcrab-personal-mcp`**). To enable `.env`/`data/`/doc symlink creation (and the native backend chmod), run **`pnpm approve-builds`** once and allow `@mindflight/ghostcrab-personal-mcp`, or install with **`pnpm add --allow-build=@mindflight/ghostcrab-personal-mcp @mindflight/ghostcrab-personal-mcp@latest`**. With **npm** no extra step is needed.

**3 — Repository (Git checkout)**  
MindBrain is included as a **submodule** at `vendor/mindbrain` ([public tree](https://github.com/mindflight-orchestrator/mindbrain)). Clone with:

```bash
git clone --recurse-submodules https://github.com/OWNER/ghostcrab-personal-mcp.git
cd ghostcrab-personal-mcp
```

If you cloned without submodules: `git submodule update --init --recursive`.

To develop or produce tarballs yourself:

- `make lib-build` — JS only  
- `make local-pack` or `pnpm run pack:local` — tarball in `dist-pack/`  
- `make prebuilds` then `pnpm run pack:local` — all five platform binaries  

See [Makefile](Makefile) and [docs/dev/npm_split_release_process.md](docs/dev/npm_split_release_process.md).

### Minimal baseline (no LLM keys)

By default **`GHOSTCRAB_EMBEDDINGS_MODE=disabled`**: **BM25-only** search, **no API key** required. SQLite is created on first **`gcp brain up`** / MCP session (typically `./data/ghostcrab.sqlite` relative to the process cwd).

### `.env` for embeddings / API keys

After installing the main package locally, a starter **`.env`** may already exist at the project root. If not:

```bash
cp node_modules/@mindflight/ghostcrab-personal-mcp/.env.example .env
```

Edit `.env` as needed. Variable reference: [.env.example](.env.example).

**Global install:** use `$(npm root -g)/@mindflight/ghostcrab-personal-mcp/.env.example`.

### IDE: register MCP (one command each)

From the project root where the package is installed locally (or where `gcp` is on `PATH`):

```bash
npx gcp brain setup cursor --force
npx gcp brain setup codex
npx gcp brain setup claude
```

The generator uses an absolute path to `bin/gcp.mjs` when the package is installed locally, and falls back to `npx -y --package=@mindflight/ghostcrab-personal-mcp@latest gcp brain up`. The stale `ghostcrab` entry is removed automatically.

Detailed guides: [README_CURSOR_MCP.md](README_CURSOR_MCP.md), [README_CODEX_MCP.md](README_CODEX_MCP.md), [README_CLAUDE_CODE_MCP.md](README_CLAUDE_CODE_MCP.md).
