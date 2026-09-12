# Jeu pilote de fiabilité métier pour RAG / GraphRAG

Version `graphrag-business-v1`, créée le 12 septembre 2026. **24 documents, 48 passages et 48 questions en français**. Corpus entièrement fictif : entreprises, personnes, sites, événements et montants ne décrivent aucune donnée opérationnelle réelle.

Ce jeu accompagne le [rapport comparatif](../../../docs/benchmarks/2026-09-12-graphrag-mindbrain-comparison.md). Il permet de qualifier un protocole et de préparer des adaptateurs. À la création du jeu, aucun système RAG n'avait été exécuté. Un premier [pilote de retrieval natif](../../../docs/benchmarks/graphrag-business-v1/README.md) a depuis été réalisé sur le lot de développement ; aucune réponse générée ni variante graphe/ontologie n'a encore été évaluée. Les tests du validateur ci-dessous contrôlent les fichiers et les annotations, pas les réponses d'un moteur.

## Contenu et séparation des entrées

| Fichier | Usage |
|---|---|
| [corpus.jsonl](corpus.jsonl) | Documents à indexer : `id`, `workspace_id`, `title`, `published_at`, `visibility`, `passages` avec identifiants stables et texte. |
| [questions.dev.jsonl](questions.dev.jsonl) | 24 questions du workspace `aster` pour développer et régler les adaptateurs. |
| [questions.test.jsonl](questions.test.jsonl) | 24 questions du workspace `boreal`, réservées à l'évaluation après gel des configurations. |
| [judgments.jsonl](judgments.jsonl) | Réponses de référence, affirmations nécessaires, ensembles de preuves et erreurs à éviter ; fichier réservé à l'évaluateur. |
| [manifest.json](manifest.json) | Version, effectifs, catégories, rôles, séparation des workspaces et empreintes SHA256 des quatre fichiers de données. |

Seuls les textes et métadonnées documentaires autorisés peuvent alimenter les index, embeddings, graphes, résumés et prompts. **Ne jamais ingérer les questions, annotations, ce README ou le rapport comme documents métier.** Le modèle reçoit la question et son contexte de confiance ; `id`, `category` et nom du split restent des données de l'évaluateur et ne doivent pas décider du mode de retrieval. Le champ `reference_answer` ne doit jamais être envoyé au système évalué.

Chaque split contient trois questions dans chacune des huit catégories : `factual`, `constraints`, `multi_hop`, `temporal`, `uncertainty`, `access`, `synthesis`, `robustness`. Cette pondération égale est un choix de construction, pas une estimation de la fréquence des demandes réelles.

Les deux workspaces ont des entités homonymes, des identifiants de contrats identiques mais locaux, des montants et responsables différents. Les chaînes, bornes et reformulations d'un même workspace restent dans un seul split. Les deux lots partagent toutefois des motifs rédactionnels : **le test est public, synthétique et corrélé au développement ; ce n'est pas un test aveugle indépendant**. Ne pas régler un adaptateur sur les réponses du lot réservé. Après consultation pour corriger un système, considérer ce lot comme une régression et créer un nouveau test décisionnel indépendant.

## Contexte et sémantique

Une question contient `context.workspace_id`, `principal`, `known_at` et `business_at`. Le contexte est injecté par le banc d'essai, pas déduit de la phrase « en tant que finance ».

- `operator` dispose du rôle `operations` ; `finance` dispose de `operations` et `finance`. Les rôles valent exclusivement dans le workspace de la requête.
- Un document est accessible si son workspace correspond, si un rôle du principal appartient à `visibility` et si `published_at <= known_at`.
- `known_at` est la limite inclusive de connaissance à la fin de la journée indiquée. Pour ce pilote seulement, publication et disponibilité documentaire coïncident. Le temps d'ingestion réel n'est pas modélisé.
- `business_at` est la date métier visée. Ne pas la remplacer par `known_at` et ne pas éliminer une rectification simplement parce qu'elle a été publiée après la date métier, si elle était connue à la date de connaissance demandée.
- Les tests temporels comparent la décision initiale, une rectification rétroactive et une période non documentée. Un index ou résumé construit avec une correction future ne peut servir à une question dont `known_at` la précède. Construire des instantanés autorisés ou un mécanisme temporel équivalent.
- Les registres déclarent explicitement leur exhaustivité **au 12 septembre 2026**. Les requêtes d'ensembles et de sommes portent sur cette date. L'absence dans les autres documents est une absence de preuve, pas une preuve de non-existence.
- Deux constats contemporains incompatibles, sans priorité ni remplacement établi, doivent rester un conflit. La décision de direction corrigée est, elle, explicitement remplacée.

Les filtrages d'accès doivent s'appliquer avant toute exposition au générateur, y compris les expansions de graphe et résumés précalculés. Si un framework nécessite une couche hôte pour le faire, utiliser la même politique, en consigner l'implémentation et en mesurer le coût. Ces cas testent une intégration future ; ils ne certifient pas les autorisations d'un produit déjà déployé.

## Lire les réponses et preuves

Une annotation contient :

- `status` : `answered`, `insufficient_evidence` ou `conflicting_evidence`.
- `reference_answer` : exemple de réponse correcte, pas une chaîne à reproduire mot pour mot.
- `required_claims` : affirmations minimales requises, chacune accompagnée de `evidence_sets`.
- `forbidden_claims` : erreurs sémantiques à rechercher, pas une liste de sous-chaînes interdites. Une réponse qui cite une erreur pour la réfuter ne commet pas cette erreur.
- `response_requirements` : exigences supplémentaires, notamment produire des propositions distinctes et les identifier comme telles.

Dans `evidence_sets`, chaque liste interne est un ensemble de passages nécessaires ensemble (**ET**) ; les listes externes sont des alternatives suffisantes (**OU**). La v1 fournit une alternative par affirmation, mais accepte d'en annoter plusieurs. Pour un ensemble exhaustif, le registre complet est demandé afin de vérifier aussi les exclusions ; la précision et le rappel doivent tenir compte de cette granularité. Plusieurs affirmations peuvent réutiliser les mêmes preuves.

Les assertions d'incertitude peuvent avoir des preuves explicites, par exemple une date annoncée comme non confirmée. Une absence totale de preuve peut avoir `required_claims: []`. Ne pas exiger de citation inventée dans ce cas et ne pas donner automatiquement un rappel de 100 % : les métriques de retrieval sans preuve attendue sont **non applicables** ; noter la bonne abstention séparément.

Une citation doit soutenir l'affirmation, pas seulement être accessible ou mentionner le même objet. La présence des références est une condition mécanique ; **le validateur ne vérifie ni l'implication sémantique, ni les calculs, ni la justesse d'une réponse de modèle**. Pour les synthèses, vérifier tous les constats requis, les ajouts non soutenus et les exigences de réponse. D'autres formulations et recommandations raisonnables sont acceptables si elles restent justifiées et explicitement présentées comme propositions.

### Trois exemples discriminants

| Cas | Attendu | Erreur révélée |
|---|---|---|
| `A-Q04` | C-11 uniquement, avec bornes inclusives. | Retourner un contrat résilié, de nettoyage ou d'un autre site. |
| `A-Q10` / `A-Q11` | Alice au niveau de connaissance du 3 septembre ; Bruno pour cette même date métier avec la correction connue au 12 septembre. | Confondre le passé métier et l'information disponible à une date donnée. |
| `A-Q16` / `A-Q17` | Abstention pour l'opérateur ; budget et code pour finance. | Exposer une preuve inaccessible, ou confondre budget de travaux et redevance annuelle. |

## Vérification locale

Depuis la racine du dépôt, sans base de données, dépendance externe ou appel de modèle :

```sh
python3 scripts/validate_graphrag_business_fixture.py
python3 -m unittest discover -s scripts/tests -p 'test_graphrag_business_fixture.py' -v
```

Le validateur vérifie les empreintes, identifiants, champs, dates, effectifs, catégories, correspondance questions/annotations et admissibilité des références selon workspace, rôle et date de connaissance. Il rejette aussi les champs de réponse ajoutés aux questions. Il affiche `system_benchmark_run: false`.

Les tests injectent des corruptions : pièce absente, preuve future, preuve d'un autre espace, accès finance indu, collision d'identifiants, annotations manquantes et altération du contenu. Une validation verte signifie que le **jeu** respecte ces contrats, pas qu'un moteur répond correctement.

## Protocole de la prochaine campagne

1. Faire relire les annotations et les calculs par une personne métier indépendante ; le manifeste indique actuellement `author_checked_not_independently_reviewed`. Corriger et versionner toute modification avant le gel.
2. Régler seulement sur `dev`, puis enregistrer les empreintes des données, commits/dépendances, modèles, prompts, paramètres, règles de routage et budgets de tous les systèmes. Les configurations futures ne sont pas choisies par ce pilote.
3. Exécuter les questions du test avec la même interface de récupération : question/contexte en entrée ; passages identifiés et classés, métadonnées de dégradation, latence et coûts observés en sortie. Sauvegarder les traces avant la génération.
4. Générer avec un modèle et un budget de contexte communs lorsque compatibles. Séparer les mesures des chaînes natives complètes si elles utilisent d'autres modèles ou stratégies.
5. Évaluer les ensembles, nombres, preuves, contraintes, abstentions et synthèses séparément, avec revue humaine des réponses anonymisées. Publier les effectifs et erreurs par catégorie, pas seulement une moyenne. Mesurer les coûts de préparation humaine et d'indexation aussi.

Ce corpus est petit : ajouter un témoin donnant **tout le corpus autorisé** au générateur lorsqu'il tient dans son contexte, pour quantifier les pertes introduites par le retrieval. Il ne permet pas de conclure sur la scalabilité, une latence p95 stable ou la qualité des synthèses sur de grands corpus. Une campagne décisionnelle demandera des données métier représentatives, un test indépendant, des volumes et des mises à jour supplémentaires. Les cas ci-dessus décrivent des vues temporelles statiques ; ils ne mesurent pas encore la propagation incrémentale ni la suppression des données dans les index et caches.
