# Renforcement des mutations v0.7.3

Baseline livré : 17d7142 (moteur facb0af), aucun push ni staging npm.
Objectif : couvrir les mutations métier utiles, étendre le périmètre aux nouveaux
handlers et à la garde CAS d'upsert, conserver les exceptions prouvées et relever
le seuil uniquement après mesure. Pas d'objectif artificiel de 100% global.

1. Baseline historique : 205/241 détectées, 85,06%.
2. Première mesure élargie, avant nouveaux tests : 405/517, 78,34%.
3. Ajouter tests SQLite sur concurrence, helpers, scope, identités, alias,
   nettoyage relation/diagnostics et erreurs de transport. Mesurer à nouveau.
4. Ajouter un contrôle explicite des mutations critiques que Stryker ne produit
   pas dans les chaînes SQL ; vérifier l'inventaire des exceptions.
5. Valider suites, consigner score/périmètre, mettre à jour la préparation locale.

Les preuves finales complèteront ce journal ; les mesures précédentes restent
conservées sans être remplacées par le nouveau résultat.

## Résultat final

- 475/517 mutations détectées : **91,88 %**, 38 survivantes et 4 sans couverture,
  aucun timeout ni erreur de mutation. Même périmètre que la mesure initiale
  élargie : **70 mutations supplémentaires détectées** (405 -> 475).
- Nouveaux handlers fact/graph et garde de version upsert inclus. Les descriptions
  MCP et les schémas JSON déclaratifs ne sont pas des cibles. Le pilote historique
  205/241 (85,06 %) est une mesure sur un périmètre différent.
- Seuil bloquant relevé de 80 à 90 %. Toutes les mutations non détectées restent
  dans le dénominateur, y compris les exceptions ; aucune exclusion de commodité.
- **10/10 mutations critiques supplémentaires détectées** par leurs tests nommés,
  dans une copie temporaire : scopes workspace/type/schema, transaction, version
  graph/fact, refus relation étrangère, reconstruction dans la transaction et
  absence de réutilisation des identifiants. Les modifications SQL conservent les
  paramètres pour éviter une détection artificielle par erreur de liaison.
  `critical.json` contient les substitutions exactes et les tests qui échouent.
- La commande `pnpm test:mutation` exécute Stryker, la revue des exceptions et ce
  contrôle ciblé. Une mutation nouvelle, une exception obsolète ou dupliquée,
  une erreur de lancement ou un test critique qui ne détecte plus sa mutation
  fait échouer le contrôle.

## Ce que les tests ajoutés protègent

Suppression concurrente entre lecture préalable et transaction ; déplacement
ciblé de workspace ; propriétés de relation vides et confidence omise/zéro ;
représentations génériques/concrètes des nœuds ; types déclarés sans instance ;
limite uint32 ; identités brutes absentes ; labels et alias préservés ; nettoyage
des propriétés et diagnostics en gardant les lignes étrangères à la suppression,
y compris lorsque les identifiants de relations diffèrent entre brut et index ;
historique fermé ; conflits sur création absente ; erreurs de transport distinctes.

## Exceptions et limites

Les 42 mutations restantes sont revues dans `tests/fixtures/mutation-review.json` :
20 concernent le libellé des diagnostics ; 4 des champs inutilisés ou replis
inaccessibles après validation ; 3 une garde d'allocation redondante avec le refus
et rollback de la lecture finale ; 1 le refus équivalent d'un callback absent ;
5 des branches impossibles avec l'agrégat SQL canonique ; 3 des accès JSON qui
aboutissent au même repli d'erreur ; 6 une garde défensive préexistante de `learn`.

Cette dernière garde reste non exercée pour la disparition d'un endpoint après
sa résolution : la transaction SQLite sérialisée l'empêche. Le mode historique
sans session reste une limite de compatibilité explicite, pas une preuve de 100 %.
Les rejets d'adaptateur qui ne sont pas des objets Error ne sont pas qualifiés.
Les diagnostics exacts ne sont pas vérifiés mot à mot. Les tests des erreurs HTTP
utilisent une doublure de transport ; les preuves natives précédentes couvrent
la suppression réelle et son rollback. Le score porte sur sept fichiers/ranges
TypeScript, pas sur tout GhostCrab ni sur le moteur Zig. Les dix mutations ciblées
ne constituent pas un inventaire exhaustif de toutes les régressions possibles.

## Validation et livraison

- Suite complète avec seuils de couverture : **909 succès, 16 skips optionnels**.
- Intégrité SQLite réelle : **86 succès**. Vérificateur de revue : 4 tests réussis.
- Commande CI complète `pnpm run test:mutation` réussie (voir `gate.log`).
- Lint, typecheck, formatage ciblé et build réussis.
- Vérification du contenu npm (692 fichiers) et installation locale Linux x64
  réussies, y compris autorisation, outils et configuration IDE.
- Sept archives v0.7.3 régénérées ; SHA-256 actualisés dans le manifeste de release.
  Les douze binaires natifs sont identiques aux empreintes de la qualification
  stock-hermes précédente. Aucun changement de code de production ni du moteur.
- Les suites moteur/natives/intégration et l'upgrade qualifiés précédemment n'ont
  pas été relancés pour ce changement de tests. Leur périmètre et leurs limites
  restent consignés dans `../stock-hermes-v0.7.3/README.md`.
- Les logs de ce répertoire conservent les mesures intermédiaires et finales.
  Aucun push, tag publié, staging npm ou déploiement effectué.
