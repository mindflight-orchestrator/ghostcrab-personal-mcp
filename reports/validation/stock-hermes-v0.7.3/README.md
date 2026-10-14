# Revue stock-hermes et préparation v0.7.3 — 14 octobre 2026

**Verdict : proposition intégrable après corrections.** Les suites exécutées ne
montrent pas de régression. Il ne s'agit pas d'une preuve exhaustive de toutes
les applications clientes ni d'une validation de production.

Baselines : GhostCrab main `073b6d4`, proposition `1212764` ; MindBrain main
`bf3230e`, proposition `a582663`. Les deux dépôts étaient propres. Le moteur
corrigé est `facb0af` et le sous-module GhostCrab pointe sur ce même commit.
Le correctif GhostCrab et ses tests sont enregistrés dans `6062366`.

## Changements proposés et impact

| Dépôt / surface | Comportement et impact |
| --- | --- |
| MindBrain facts | Nouvel endpoint POST facts/delete : identité exacte workspace/schema/id, version obligatoire, suppression atomique du fact et des copies FTS/BM25/vecteurs. Les versions historiques fermées restent stockées. |
| MindBrain graph | Reconstruction ciblée des adjacences et degrés d'un workspace, sans rejouer les données raw ni modifier l'ontologie. |
| MindBrain workspace | Démarrage HTTP et commande workspace-create --if-absent préservent les métadonnées existantes. Les valeurs par défaut initialisent seulement les nouveaux espaces. L'upsert explicite reste disponible. |
| GhostCrab facts | record_get, record_delete et expected_version optionnel dans upsert. Les anciens appels upsert sans version gardent leur comportement. |
| GhostCrab graph | Quatre outils CRUD pour types métier déjà représentés/déclarés. Les écritures synchronisent données raw et runtime, alias et liens ; les relations étrangères interdisent une suppression. Aucun passage par learn ni création automatique de modèle. |
| Distribution | 74 → 80 outils, enveloppe 2026-10-14, sept paquets 0.7.3, moteur épinglé. Aucune modification du schéma SQL livré. Le MCP et son moteur doivent être mis à niveau ensemble. |

L'identifiant fourni à graph_record_create est externe ; l'identifiant retourné
est le numéro interne utilisé par get/update/delete. Les propriétés sont
fusionnées lors d'une mise à jour. Le fingerprint de version représente le
contenu public, pas un compteur de toutes les écritures.

## Défauts corrigés pendant la revue

1. **Suppression du graphe validée trop tôt.** La branche faisait COMMIT avant
   reconstruction des index. Un trigger de panne a reproduit une erreur MCP
   accompagnée d'un nœud déjà supprimé (`graph-rollback-before.log`). La nouvelle
   session native joint le rebuild à la transaction ; la panne annule désormais
   nœud, relations et index (`graph-rollback-after.log`, tests natifs obligatoires).
2. **Réutilisation des identifiants supprimés.** MAX(id)+1 pouvait recycler le
   dernier ID ; un ancien fingerprint pouvait viser un nouvel objet identique.
   L'allocation tient compte de sqlite_sequence. Test suppression/recréation.
3. **Gates incomplets.** Les scripts natifs de la proposition n'étaient pas
   exécutés en CI, la matrice all-tools restait à 74 et les tests SQLite graphe
   ne couvraient pas les mutations. Les scénarios sont reliés au gate natif
   obligatoire et au workflow de publication, et les tests SQLite au gate
   intégrité. Le job natif utilise Node 22 pour node:sqlite ; le test CLI sait
   être ignoré sur Node 20 dans les suites optionnelles.
4. **Erreurs HTTP du nouveau helper.** JSON malformé/champ inconnu → 400,
   corps trop grand → 413, session inconnue/expirée refusée. Tests natifs des
   entrées malformées et des sessions invalides.

## Preuves

| Contrôle | Résultat |
| --- | --- |
| MindBrain zig build test | 469/469 |
| GhostCrab test:coverage | 892 réussis, 16 explicitement ignorés |
| test:integrity | 70/70 |
| test:integrity:native | 17/17, également sur le binaire Linux x64 empaqueté |
| Intégration/e2e | 106/106 |
| GraphRAG | 35 cas, 2 optionnels ignorés |
| Mutation (périmètre pilote historique) | 205/241 détectées, 85,06 %, 36 non détectées avec revues explicites |
| MCP all-tools | 80 listés et appelés, zéro erreur technique ; erreurs métier attendues conservées dans le reçu |
| Scénarios mémoire et graphe incomplet | Réussis sur fixtures préparées |
| Mise à niveau v0.7.2 → v0.7.3 | Ancienne archive Linux exécutée : espaces, facts et table applicative conservés ; nouvelle suppression utilisable |
| Distribution | 12 binaires compilés, formats ELF/Mach-O/PE vérifiés ; 7 archives ; npm pack 692 fichiers |
| Installation locale des archives | CLI, authorize, outils MCP, bootstrap hôte, configuration Cursor réussis |
| Statique | Typecheck, lint, Prettier ciblé, zig fmt, git diff --check, lockfile pnpm gelé/hors ligne et cohérence npm/manifests réussis |

Couverture globale : lignes 68,75 %, branches 56,87 %, fonctions 76,08 %.
Nouveaux handlers : graph business-records 97,02 % lignes / 83,33 % branches ;
facts records 100 % / 90 %. Les scénarios MCP natifs s'exécutent hors du processus
instrumenté : leur preuve est distincte de la métrique de couverture Vitest.
Le score de mutation concerne le pilote existant, pas tous les nouveaux handlers.

Les tests nouveaux couvrent : identité et scope exacts, version périmée,
concurrence (un seul gagnant), type inconnu, doublon externe, propriétés réservées,
rollback create/update/delete, panne pendant reconstruction, relations étrangères,
alias et raw/runtime, conservation des propriétés et de l'historique,
non-résurrection au redémarrage/réindexage, contraintes FK et persistance des
métadonnées de workspace. Les bases sont synthétiques et jetables.

## Limites et déploiement

- Linux x64 exécuté ; autres plateformes compilées et formats vérifiés seulement.
  Les jobs CI macOS/Windows doivent compléter la preuve de distribution.
- Le rebuild tient le verrou d'écriture et parcourt le workspace ; aucune mesure
  de latence sur un gros graphe Basecamp réel n'a été faite.
- Le fingerprint n'est pas monotone : A → B → A sur le même nœud redonne la même
  version. Une perte de réponse COMMIT reste ambiguë : relire avant de réessayer.
- L'isolation workspace n'est pas une autorisation utilisateur. Le host applique
  les droits applicatifs. La suppression facts n'est pas une purge d'historique.
- Les smoke tests historiques exigent leurs fixtures. Lancer immédiatement un
  appel pendant le bootstrap optionnel asynchrone peut produire sql_session_busy
  (chemin préexistant de server.ts, non modifié). Les preuves finales préparent
  explicitement les données, puis exécutent avec bootstrap désactivé.
- Les anciennes archives ont été conservées dans
  `/tmp/ghostcrab-v072-dist-pack-preserved-20261014/`. Les nouvelles sont dans
  `dist-pack/`, avec SHA-256 dans `docs/release-v0.7.3-artifacts.json`.
- Fusion locale demandée ; aucun push, tag, staging npm ou déploiement live
  n'est inclus. Publier d'abord le commit moteur pour rendre le sous-module
  récupérable, puis le consommateur. Voir `docs/release-v0.7.3.md`.
