# Publication v0.7.3 — 14 octobre 2026

Release source : GhostCrab `783f3c8d06ff42e80e4e2e6ef0ee5858b4c13b2f`,
MindBrain `facb0afb69b8ae0b83289c6010f1d00bbe5f59da`.

- MindBrain main poussé sur GitHub avant GhostCrab ; SHA distant vérifié.
- GhostCrab main et tag annoté v0.7.3 poussés sur GitHub et GitLab.
- `pnpm run publish:npm-split` a soumis les sept paquets v0.7.3 au staging npm.
- Les sept archives ont été téléchargées depuis le staging et vérifiées.
  `staged-archives.json` conserve leurs identifiants et SHA-256 exacts.
- Les douze binaires ont les mêmes SHA-256 que ceux qualifiés localement.
  Les autres fichiers exécutables sont identiques aux archives locales.
- Les différences npm/pnpm sont explicites : npm conserve packageManager dans
  le paquet principal et le script prepack des paquets natifs ; il inclut le
  README existant d'examples/immeuble et applique le mode 0755 aux binaires
  (contre 0644 dans les archives pnpm). Aucun octet des binaires ne change.
  Le script prepack ne s'exécute pas lors de l'installation d'une archive.

CI release : https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp/actions/runs/38564519304
CI main : https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp/actions/runs/38564470182
Tests Node : https://github.com/mindflight-orchestrator/ghostcrab-personal-mcp/actions/runs/38564469813

Les états de préparation consignés dans les rapports antérieurs sont historiques.
Les archives stagées sont distinctes des archives pnpm de `dist-pack/` : leurs
empreintes de référence sont celles du présent reçu.

L'installation npm des archives exactes du staging (principal et Linux x64),
la version installée, `gcp --help` et le bootstrap `.env`/`data` ont été vérifiés
dans un projet temporaire. Résultat : succès, voir `staged-install.log`.

## Résultat de publication

La CI principale, les tests Node et la CI du tag ont réussi. Les jobs du tag
compilation, intégrité SQLite/mutations, intégrité native Linux et installation
Windows sont verts. Le job de staging CI est volontairement ignoré : la soumission
a été effectuée localement par `publish:npm-split`.

Le mainteneur a approuvé les sept stages dans npm. La tentative CLI d'approbation
Linux x64 a retourné 404 parce que le stage n'était plus présent ; la vérification
publique confirme ensuite les sept paquets en version **0.7.3**, tag **latest**,
avec les mêmes empreintes que les archives revues. `published-packages.json`
conserve les métadonnées lues directement sur registry.npmjs.org.

Aucun service applicatif existant ni aucune base de production n'a été déployé
ou modifié. La publication permet désormais l'installation de v0.7.3.

## Défaut découvert par le test du registre public

L'installation standard `npm install @mindflight/ghostcrab-personal-mcp@0.7.3`
a échoué deux fois avec SIGTERM après le postinstall. Le sélecteur de processus
de `install-upgrade.mjs` accepte toute commande contenant le nom du paquet,
y compris le processus npm ancêtre de son postinstall. La reproduction pure
avec une ligne ps npm install confirme cette sélection incorrecte.

Le test sur archives file: ne contient pas ce nom de paquet scoped dans la
commande npm, ce qui explique le défaut de couverture. L'installation publique,
la CLI, authorize et les empreintes natives réussissent avec :

```sh
GHOSTCRAB_SKIP_INSTALL_UPGRADE=1 npm install @mindflight/ghostcrab-personal-mcp@0.7.3
```

Ce contournement désactive la routine d'upgrade automatique, pas le bootstrap ni
la préparation des binaires. Le mainteneur a autorisé la correction et la
publication d'une v0.7.4. La publication 0.7.3 est effective ; son installation
standard n'est pas qualifiée et doit être corrigée dans cette nouvelle version.
