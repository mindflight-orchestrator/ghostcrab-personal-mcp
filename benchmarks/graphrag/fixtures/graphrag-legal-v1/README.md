# Pilote juridique français : sources et annotations

Ce jeu est une **tranche de développement**, sélectionnée et annotée pendant la conception. Il ne constitue ni un test indépendant ni une évaluation générale du droit belge. Les traductions et versions des deux Works appartiennent au même groupe : aucun découpage aléatoire entre chunks ne crée un lot réservé.

Le [corpus figé](corpus.json) est produit par [graphrag_legal_fixture.py](../../../scripts/graphrag_legal_fixture.py), à partir de deux fichiers Akoma Ntoso français de l'archive DATA2T et d'un jeu de citations du dépôt juridique. Le constructeur vérifie leurs SHA256 contre l'audit antérieur et refuse d'écraser une sortie existante. Il ouvre uniquement les fichiers sources en lecture. Il n'intervient pas dans le catalogue ni dans la collecte.

Trois extraits continus ont été choisis avant les scores : articles 10 à 23 et 144 à 161 de la Constitution, paragraphes `motivation_p_60` à `motivation_p_75` de l'arrêt 91/2024. Les articles bis/ter présents sont conservés : **53 unités**, dont 37 articles et 16 paragraphes. Les passages supplémentaires servent de distracteurs. Cette sélection autour d'une citation déjà connue favorise un diagnostic local, pas une conclusion de généralisation.

Le XML source est normalisé en texte avec espaces simples entre fragments et deux sauts de ligne entre unités. Les offsets sont des **positions de caractères Unicode dans ce texte dérivé**. Ils ne sont pas des positions binaires dans le PDF ou dans le XML. Chaque unité conserve son `eId`, l'expression, le Work et l'empreinte AKN. Le contexte documentaire fourni au modèle contient le texte canonique de l'ensemble de l'acte ou du corps de la décision, borné selon le protocole du runner ; les passages récupérables restent ceux des trois extraits. La préparation peut donc consulter plus de texte que la recherche n'en restitue : ce périmètre est identique pour les variantes contextualisées.

Le jeu comprend 12 questions françaises : six localisations de disposition, deux formulations du même cas de citation, deux rapprochements entre documents et deux contrôles de limites. Les deux formulations d'une citation ne sont pas deux faits juridiques indépendants. Les annotations sont des brouillons d'auteur, sans relecture juridique indépendante.

Les preuves attendues sont des spans de texte original. La couverture repose sur l'union des intervalles restitués, quelle que soit la taille des chunks. Le préfixe généré et les descripteurs ne comptent jamais comme preuve du texte source. Les deux questions sans preuve positive ne contribuent pas au dénominateur de récupération ; sans générateur de réponse, on ne mesure pas leur abstention.

Le seul lien juridique asserté est `cites`, avec sa citation, son paragraphe de quotation et l'article cible. Le lien technique `has_quotation` relie les deux paragraphes identifiés par la source de provenance ; il n'est pas une relation de droit supplémentaire. Les mêmes faits sont rendus textuellement accessibles à la variante avec descripteurs et à celle avec graphe. La cible constitutionnelle est l'expression de 2025 ; aucune applicabilité historique à 2024 n'est inférée.

Reconstruction, lorsque les sources locales sont présentes :

```sh
python3 scripts/graphrag_legal_fixture.py --out /tmp/legal-corpus-rebuilt.json
cmp test/fixtures/graphrag-legal-v1/corpus.json /tmp/legal-corpus-rebuilt.json
```

Le corpus figé permet ensuite de relancer le benchmark sans accéder au fonds en cours de traitement. Voir le [protocole et les résultats](../../../docs/benchmarks/graphrag-legal-v1/README.md).
