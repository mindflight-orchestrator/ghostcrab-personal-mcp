# Publication corrective v0.7.4 — 14 octobre 2026

Source : `41bedc824935d41f43fb630f2a883fcb071aa24b`.
Moteur : `facb0afb69b8ae0b83289c6010f1d00bbe5f59da`, inchangé.

- main et tag v0.7.4 poussés sur GitHub et GitLab.
- Sept paquets soumis par `pnpm run publish:npm-split`.
- Sept archives téléchargées depuis le staging et vérifiées : sources exécutables
  identiques aux archives validées ; douze empreintes natives inchangées.
- Les écarts npm/pnpm sont les mêmes que pour v0.7.3 : métadonnées packageManager
  et scripts prepack, mode exécutable des binaires, README d'exemple ajouté.
  `staged-archives.json` consigne les SHA-256 exacts des archives npm.
- Installation réelle des archives stagées avec des specs npm nommées
  `@mindflight/...@file:...`, postinstall et upgrade actifs : succès. CLI,
  authorize, version 0.7.4, bootstrap et empreintes des binaires vérifiés.

CI du tag : https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp/actions/runs/38568568595
CI main : https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp/actions/runs/38568558740
Tests Node : https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp/actions/runs/38568558682

La correction et les preuves locales sont détaillées dans
`../installer-v0.7.4/README.md`. La v0.7.3 reste dans l'historique npm ; v0.7.4
corrige son installation standard et ne nécessite pas le contournement
GHOSTCRAB_SKIP_INSTALL_UPGRADE=1.

## Publication et installation depuis le registre

Le mainteneur a approuvé les sept stages npm. Les sept versions 0.7.4 et le tag
latest sont vérifiés sur registry.npmjs.org, avec les empreintes des stages revus.
Voir `published-packages.json`.

Le premier essai a utilisé le cache du test prépublication, dont les métadonnées
natives ne contenaient pas encore 0.7.4 : la dépendance optionnelle manquait.
Npm 11.18 a également indiqué que le postinstall nécessitait une décision
allowScripts. Ce reçu conserve cet essai, sans le compter comme validation.

Le test final utilise un projet et un cache neufs, avec allowScripts limité à
`@mindflight/ghostcrab-personal-mcp@0.7.4`. L'installation standard de cette version
publique réussit, avec résolution automatique du paquet Linux x64. Le postinstall,
son smoke et la routine d'upgrade s'exécutent ; aucun contournement
GHOSTCRAB_SKIP_INSTALL_UPGRADE n'est utilisé. CLI, authorize, bootstrap, versions
et SHA-256 natifs passent. Voir `registry-install-fresh.log`.

La routine d'upgrade conserve son comportement fonctionnel : elle a arrêté deux
processus identifiés GhostCrab, sauvegardé la base locale trouvée et vérifié ses
migrations (aucune migration supplémentaire appliquée). Ce test n'est pas un
rollout d'un service cible de production.

Politique npm : https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/
L'approbation de publication sur npmjs et l'autorisation des scripts dans le
projet consommateur sont deux étapes distinctes.

Le test a également réécrit la section GhostCrab de la configuration Codex
locale vers le consommateur temporaire conservé. La mise à jour automatique de
Cursor a signalé une erreur : cette intégration ne compte pas comme validée par
ce test. Les chemins du répertoire personnel sont remplacés par `<HOME>` dans
les journaux archivés ; les journaux bruts restent dans le répertoire temporaire.

## Résultat final de la CI

CI du tag réussie : compilation des six plateformes, intégrité SQLite et
mutations, intégrité native Linux avec installation nommée, installation Windows.
Le job de staging CI est ignoré comme prévu : les sept paquets ont été stagés
localement puis approuvés sur npmjs. Les CI main et Node ont également réussi.
Voir `release-ci.json`.
