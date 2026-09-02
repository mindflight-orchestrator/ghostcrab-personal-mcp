# GhostCrab Beta Test v{{VERSION}}

Merci de tester cette build avant sa publication npm. Le guide complet
d'installation est fourni dans `INSTALL.md` à côté de ce fichier.

## Installation rapide

Avec Node.js 20+ et npm :

```bash
node install-beta.mjs
```

Sous PowerShell :

```powershell
.\install-beta.ps1
```

Sous macOS, Linux, WSL ou Git Bash avec GNU Make :

```bash
make
```

Le bundle contient le paquet principal et les six paquets de binaires pour
Linux, macOS et Windows. L'installateur sélectionne automatiquement celui qui
correspond à la plateforme courante.

## Vérifications

```bash
node smoke-ide-install.mjs
npx gcp --help
npx gcp authorize
```

Le smoke IDE installe les tarballs dans un dossier temporaire, vérifie le CLI,
puis teste les configurations Cursor, Codex, Claude et générique en mode
`--dry-run`, sans écrire dans les configurations utilisateur.

Pour démarrer le serveur MCP :

```bash
npx gcp brain up
```

Les embeddings et les clés API sont optionnels. Pour les activer, copiez
`.env.example` depuis le paquet installé vers un fichier `.env`, puis adaptez
les valeurs nécessaires.

## Retour attendu

Merci d'indiquer l'OS et l'architecture, la commande d'installation utilisée,
la sortie complète en cas d'échec, et si `gcp --help`, `gcp authorize`, le smoke
IDE et `gcp brain up` fonctionnent comme prévu.
