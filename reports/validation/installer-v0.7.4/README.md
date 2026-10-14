# Correctif d'installation v0.7.4

Base : GhostCrab 006bd3d ; moteur facb0af, inchangé.

## Reproduction et cause

La publication v0.7.3 est effective, mais l'installation depuis npm échouait avec
SIGTERM. Deux exécutions et le contournement réussi sont consignés dans
`../publication-v0.7.3/`. L'ancienne sélection par sous-chaîne accepte
`npm install @mindflight/ghostcrab-personal-mcp@0.7.3` comme processus à arrêter.
Le parent immédiat du postinstall est le shell ; exclure seulement process.ppid
ne protège donc pas npm, son ancêtre.

## Correction

- Protéger toute la chaîne d'ancêtres, avec arrêt de parcours si le snapshot
  de processus comporte un cycle.
- Reconnaître l'exécutable ou l'entrypoint Node puis les sous-commandes serveur.
  Ne pas interpréter le nom d'un paquet dans un argument comme une identité de
  processus serveur. Les commandes npm/pnpm/npx, shells, postinstall, setup,
  upgrade et recherche textuelle ne sont pas des cibles.
- Conserver les lancements backend, gcp brain up/serve/up/start, l'ancien shim
  ghostcrab et l'entrypoint dist/index.js qualifié par le chemin du paquet.
- Les wrappers inconnus et les options Node non reconnues restent en fonctionnement
  par prudence ; une migration pourra alors signaler un backend encore actif.

Les 25 nouveaux cas couvrent les faux positifs, les serveurs reconnus, les chemins
Windows entre guillemets, les ancêtres indirects et un snapshot cyclique.
La sélection est commune aux snapshots ps Unix et Win32_Process Windows.

## Vérification de l'installation réelle

Le smoke `verify:local-install` utilise désormais des arguments npm
`@mindflight/ghostcrab-personal-mcp@file:...` au lieu de simples chemins file:.
Le nom scoped est ainsi présent dans la commande, comme lors d'une installation
publique. Le postinstall complet s'exécute sans GHOSTCRAB_SKIP_INSTALL_UPGRADE.
Le gate Linux natif du workflow Publish exécute obligatoirement ce smoke après
construction des archives. Le test Windows existant reste obligatoire.

## Résultats locaux

- Suite complète/couverture : 934 succès, 16 skips optionnels.
- Suite install-upgrade : 39 succès, dont 25 nouveaux cas.
- Installation nommée : succès ; CLI, authorize, tools verify, bootstrap hôte,
  configuration Cursor, permissions et skills.
- Mutation complète : 475/517 détectées (91,88 %), 42 exceptions revues ;
  dix mutations critiques supplémentaires détectées. Ce périmètre TypeScript
  est inchangé ; le sélecteur JS est couvert par les tests de régression ci-dessus.
- Lint, typecheck, formatage ciblé, build et vérification npm pack : succès.
- Lockfile pnpm gelé/hors ligne vérifié ; manifests et lockfiles alignés en 0.7.4.
- Sept archives 0.7.4 préparées. Les douze binaires ont les mêmes SHA-256 que
  ceux de la v0.7.3 ; le moteur n'a pas été modifié.

Les résultats CI et la publication effective seront consignés dans un reçu
séparé de publication v0.7.4. Les archives pnpm locales et npm publiées peuvent
avoir des empreintes différentes à cause des métadonnées d'empaquetage ; comparer
les contenus et consigner les SHA-256 des archives réellement stagées.
