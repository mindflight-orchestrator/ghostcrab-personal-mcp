# NPM Split Package Release Process

Ce document décrit le nouveau flux de publication "installer + packages binaires par plateforme" pour `@mindflight/ghostcrab-personal-mcp`.

## Objectif

Avant:

- un seul package npm contenait `prebuilds/`
- le tarball principal pesait environ `11.5 MB`
- chaque installation téléchargeait les binaires de toutes les plateformes

Maintenant:

- le package principal est un installeur léger
- 6 packages npm contiennent chacun un seul binaire natif
- le package principal déclare ces packages en `optionalDependencies`
- le runtime résout automatiquement le package binaire installé pour la plateforme courante

## Packages produits

Le split actuel produit 7 tarballs:

- `@mindflight/ghostcrab-personal-mcp`
- `@mindflight/ghostcrab-personal-mcp-linux-x64`
- `@mindflight/ghostcrab-personal-mcp-linux-arm64`
- `@mindflight/ghostcrab-personal-mcp-darwin-x64`
- `@mindflight/ghostcrab-personal-mcp-darwin-arm64`
- `@mindflight/ghostcrab-personal-mcp-win32-x64`
- `@mindflight/ghostcrab-personal-mcp-win32-arm64`

Le package principal ne contient plus `prebuilds/`.

## Fichiers et scripts impliqués

Packaging:

- [package.json](../../package.json)
- [pnpm-workspace.yaml](../../pnpm-workspace.yaml)
- [scripts/stage-platform-packages.mjs](../../scripts/stage-platform-packages.mjs)
- [scripts/pack-local.mjs](../../scripts/pack-local.mjs)
- [scripts/make-beta-bundle.mjs](../../scripts/make-beta-bundle.mjs)
- [scripts/publish-npm-split.mjs](../../scripts/publish-npm-split.mjs) — staging registry (`npm stage publish`) dans l’ordre : 6 paquets plateforme, puis racine (aligné sur `pack:local`) ; mise en ligne uniquement après approbation 2FA

**Canal zip bêta (séparé)** — `pnpm run beta:bundle` reste maintenu en parallèle de npm : zip avec `install-beta.mjs`, Makefile optionnel, `SHA256SUMS.txt`, README testeurs. Ce n’est pas fusionné dans le flux `npm publish` ; les testeurs hors-registry ou hors ligne gardent ce chemin.

Runtime:

- [bin/lib/prebuild-permissions.mjs](../../bin/lib/prebuild-permissions.mjs)
- [bin/commands/serve.mjs](../../bin/commands/serve.mjs)
- [bin/commands/authorize.mjs](../../bin/commands/authorize.mjs)

Validation:

- [scripts/verify-pack.mjs](../../scripts/verify-pack.mjs)
- [scripts/verify-local-install.mjs](../../scripts/verify-local-install.mjs)
- [scripts/smoke-beta-install.mjs](../../scripts/smoke-beta-install.mjs)

## Résolution du binaire au runtime

Ordre de résolution:

1. package binaire plateforme installé via `optionalDependencies`
2. fallback local vers `prebuilds/<platform-key>/...` pour le développement

Exemple sur Linux x64:

1. recherche de `@mindflight/ghostcrab-personal-mcp-linux-x64`
2. lecture de `bin/ghostcrab-backend` dans ce package
3. si absent, fallback vers `prebuilds/linux-x64/ghostcrab-backend`

## Règle préalable : `vendor/mindbrain` est en lecture seule

`vendor/mindbrain` est un **sous-module épinglé**. Ne jamais l'éditer ni y commiter.

Toute modification du moteur MindBrain suit cet ordre, sans exception :

1. Éditer et commiter dans le dépôt **maître** `../mindbrain-perso`
   (`git@github.com:mindflight-orchestrator/mindbrain-perso.git`).
2. **Pousser d'abord.**
3. Seulement ensuite, synchroniser le sous-module sur le commit poussé et
   enregistrer le nouveau pin :

```bash
git -C vendor/mindbrain fetch origin
git -C vendor/mindbrain checkout --detach <sha-poussé>
git add vendor/mindbrain
```

Pourquoi : le release npm embarque des binaires cross-compilés depuis l'arbre
`vendor/`. Un commit qui n'existe que localement (ou seulement dans `vendor/`)
rend les binaires publiés **irreproductibles** — le SHA épinglé ne contiendrait
pas le code expédié.

Si du travail a déjà eu lieu dans `vendor/` par erreur, le transférer avec
`git format-patch` puis `git am --3way` dans le dépôt maître, pousser, et
réaligner `vendor/` sur le commit poussé.

## Flux local mainteneur

### 1. Construire les prébuilds

```bash
pnpm run prebuild:all
```

Remarque:

- cette étape dépend de Zig et de l’état du vendor
- vérifié sur Zig 0.16.0 : `prebuild:all` produit les 12 binaires (6 plateformes x backend + document)
- passer `BACKEND_VENDOR_UPDATE=0` pour empêcher `ensure-vendor.sh` de toucher au sous-module pendant le build

### 2. Construire la partie TypeScript

```bash
pnpm run build
```

Remarque:

- `build` enchaîne `tsc`, `copy-sql.mjs` et `sync-ide-skill-bundles.mjs`

### 3. Vérifier le contenu du package principal

```bash
pnpm run verify:pack
```

Attendu:

- le tarball principal contient `bin/`, `dist/`, `docs/`, `ghostcrab-skills/`, `examples/`
- il ne contient pas `prebuilds/`

### 4. Générer les 6 tarballs locaux

```bash
pnpm run pack:local
```

Sortie:

- `dist-pack/*.tgz`
- `dist-pack/pack-manifest.json`

Si les `prebuilds/` sont déjà présents et que vous voulez éviter de relancer le cross-build:

```bash
pnpm run pack:local:reuse-prebuilds
```

Ce chemin est utile quand:

- vous validez uniquement le packaging npm
- vous réutilisez des binaires déjà produits
- le cross-build complet est momentanément bloqué sur une toolchain ou un target spécifique

### 5. Générer un zip bêta prêt à envoyer

```bash
pnpm run beta:bundle
```

Sortie:

- `dist-pack/ghostcrab-beta-<version>.zip`
- `dist-pack/beta-bundle/`

## Flux de test local avant publication

### Smoke test mainteneur

Ce test simule une installation du package principal + du package binaire de la machine courante dans un dossier temporaire.

```bash
pnpm run beta:smoke
```

Ce script:

1. lit `dist-pack/pack-manifest.json`
2. détecte la plateforme courante
3. crée un dossier temporaire
4. fait `npm install` du package principal
5. fait `npm install` du package plateforme courant
6. exécute `gcp --help`
7. exécute `gcp authorize`

Pré-requis:

- `dist-pack/` doit déjà exister
- la machine doit avoir accès au registry npm pour installer les dépendances JS du package principal

## Flux bêta testeurs

Le zip bêta contient:

- le package principal
- les 6 packages plateforme
- `pack-manifest.json`
- un README court pour les testeurs
- un fichier `SHA256SUMS.txt`

Le testeur:

1. dézippe l’archive
2. choisit le package plateforme correspondant à son OS
3. installe le package principal
4. installe le package plateforme
5. exécute `gcp --help`
6. exécute `gcp authorize`
7. configure son client MCP avec `gcp brain up`

## Publication npm

### Publication staged obligatoire (nouvelles règles de sécurité)

La publication directe (`npm publish`) n’est **plus autorisée**. Le flux passe par le **staged publishing** npm : les paquets sont soumis dans une zone de staging, puis un mainteneur les **revoit et les approuve avec 2FA** avant qu’ils ne deviennent publics.

Pré-requis (vérifiés au démarrage par `scripts/publish-npm-split.mjs`) :

- npm CLI **>= 11.15.0** (`npm install -g npm@^11.15.0`)
- Node **>= 22.14.0** (`nvm use 22`)
- 2FA activée sur le compte npm (pour l’approbation)
- le paquet existe déjà sur le registry (on ne peut pas stager un paquet inédit)

Les trois étapes :

1. **Stage** — `node scripts/publish-npm-split.mjs` soumet les 7 paquets via `npm stage publish` (pas de 2FA à cette étape ; token `NODE_AUTH_TOKEN` habituel). Rien n’est publié.
2. **Review** — `npm stage list`, puis `npm stage view <stage-id>` / `npm stage download <stage-id>`, ou l’onglet **Staged Packages** sur npmjs.com.
3. **Approve** — `npm stage approve <stage-id>` (2FA demandée), ou le bouton **Approve** sur npmjs.com. **Approuver les 6 paquets plateforme d’abord, la racine en dernier** (voir l’ordre ci-dessous).

### GitHub, GitLab et déclenchement explicite

Le dépôt utilise GitHub (`origin`) et GitLab (`origin2`). Pousser un tag
déclenche les builds et le smoke test Windows de
[`.github/workflows/publish.yml`](../../.github/workflows/publish.yml), sans
soumettre de paquet à npm.

Après autorisation de la publication, lancer manuellement le workflow **Publish**
sur le tag voulu, avec `stage_npm: true`. Le job npm exige ce déclenchement manuel,
une référence `refs/tags/v*` et la réussite du smoke test Windows. La valeur par
défaut de `stage_npm` est `false`. Le checkout récupère le sous-module moteur
épinglé ; son commit doit donc être poussé avant le tag GhostCrab.

Le job utilise l’environnement GitHub `npm-publish` et OIDC. L’autre chemin reste
la commande locale `pnpm run publish:npm-split`, avec les prérequis ci-dessus.
L’approbation 2FA des sept paquets reste une étape séparée.

### Ordre des paquets sur le registry

Avec le staged publishing, l’ordre s’applique à **l’approbation** (le staging lui-même peut se faire dans n’importe quel ordre) :

1. approuver les 6 packages plateforme (`npm stage approve <stage-id>` × 6)
2. vérifier qu’ils sont bien disponibles sur le registry
3. approuver le package principal

Pourquoi :

- le package principal référence immédiatement les packages plateforme via `optionalDependencies`
- si le package principal sort avant les packages plateforme, certaines installations vont retomber sur le fallback ou échouer selon le contexte

Exemple minimal **GitLab CI** (à adapter : image, cache npm, règles de tag) :

```yaml
# .gitlab-ci.yml (extrait — à fusionner avec votre pipeline)
stage_npm:
  stage: deploy
  image: node:22-bookworm # staged publishing : Node >= 22.14.0
  rules:
    - if: $CI_COMMIT_TAG =~ /^v[0-9]+\.[0-9]+\.[0-9]+/
  script:
    - apt-get update -qq && apt-get install -y -qq wget xz-utils
    - npm install -g npm@^11.15.0 # staged publishing : npm >= 11.15.0
    # 1) Installer Zig 0.16.x, scripts/ensure-vendor.sh, download-sqlite3.sh, cross-build-all.sh
    # 2) npm ci && npm run build
    # 3) node scripts/publish-npm-split.mjs  (stage les 6 paquets sous packages/prebuild-* puis la racine)
    # 4) approbation MANUELLE hors CI : npm stage approve <stage-id> avec 2FA (plateformes d'abord, racine en dernier)
    - echo "Remplacer par la chaîne réelle (p.ex. node scripts/publish-npm-split.mjs)"
  variables:
    NODE_AUTH_TOKEN: $NPM_TOKEN
```

## Checklist bêta avant publication

- [ ] `pnpm run verify:pack`
- [ ] `pnpm run pack:local`
- [ ] `pnpm run beta:bundle`
- [ ] `pnpm run beta:smoke`
- [ ] test réel sur au moins 2 OS
- [ ] validation de `gcp authorize`
- [ ] validation de `gcp brain up`

## Checklist publication publique

- [ ] licence finale décidée et appliquée partout
- [ ] `package.json` et sous-packages alignés sur la licence
- [ ] README public revu
- [ ] docs internes non destinées au public retirées du package ou du repo public
- [ ] historique GitHub nettoyé si nécessaire avant ouverture du repo
- [ ] nom du package et URLs repo/homepage/bugs finalisés
- [ ] CI de build cross-platform stabilisée
- [ ] les 7 paquets stagés revus (`npm stage view` ou onglet Staged Packages) puis approuvés avec 2FA — plateformes d’abord, racine en dernier
- [ ] smoke test post-approbation sur `npm`, `npx` et `pnpm dlx`

## Nettoyage repo avant GitHub public

Points à vérifier avant ouverture publique:

- présence de documents internes sous `docs/dev/`
- présence de notes marketing ou plans internes
- présence de références à des stacks, URLs, workflows ou clients non publics
- cohérence des noms `GhostCrab` / `MindBrain`
- présence de fichiers vendored qui ne doivent pas être republiés tels quels

Un nettoyage raisonnable consiste à:

1. décider ce qui doit rester public
2. déplacer le reste dans un dépôt privé ou une archive interne
3. réduire le package npm aux fichiers réellement utiles à l’utilisateur final

## Limitations connues dans ce checkout

- `pnpm run build` échoue actuellement sur un fichier SQL vendor absent
- `pnpm run prebuild:all` échoue actuellement sur Zig
- ces problèmes ne changent pas le design du split package, mais ils bloquent une validation CI complète tant qu’ils ne sont pas corrigés
