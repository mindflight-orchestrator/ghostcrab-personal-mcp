# Corpus juridique élargi : documents complets

Extension demandée après le pilote court, figée **avant consultation des scores sur ce corpus**. Toutes les questions restent de développement, sans relecture juridique indépendante. Quatre Works français, pas quatre juridictions ni quatre domaines indépendants.

| Document | Source complète archivée | Unités |
|---|---|---:|
| Constitution, expression du 20 juin 2025 | Akoma Ntoso, préface et 209 articles, y compris les articles bis/ter | 210 |
| Cour constitutionnelle, arrêt 91/2024 | Akoma Ntoso, en-tête et tous les paragraphes du corps de la décision | 177 |
| Cour constitutionnelle, arrêt 90/2024 | PDF officiel archivé, neuf pages | 9 |
| Cour constitutionnelle, arrêt 92/2024 | PDF officiel archivé, quatorze pages | 14 |

Les deux PDF supplémentaires ont été choisis comme voisins numérotés du cas déjà étudié, avant mesure. Ils portent respectivement sur des recours concernant les pensions et une question relative au règlement collectif de dettes. Leur identité est vérifiée dans le PDF, leur SHA256 est verrouillé, leur extraction utilise `pdftotext -layout`. Les pages, en-têtes et pieds de page sont conservés ; seuls les espaces sont normalisés. **Une page PDF n'est pas une subdivision juridique validée.** Les identifiants de page et les URN de ces deux sources sont locaux au banc, sans prétention au statut d'identifiant officiel AKN.

L'expression constitutionnelle est la version archivée de 2025, pas une garantie de consolidation actuelle en septembre 2026. Aucune applicabilité à une date passée n'est inférée. Le corpus contient le texte complet des dérivés AKN ; les éléments de métadonnées XML sont conservés dans des champs séparés, pas ajoutés au texte juridique.

Le [constructeur](../../../scripts/graphrag_legal_full_fixture.py) n'écrit pas dans les dépôts juridiques, le catalogue ou la collecte. Il vérifie les sources puis crée uniquement le [snapshot local](corpus.json). Celui-ci contient 410 unités, 225 046 caractères de texte canonique et la provenance. La découpe expérimentale produit 189 fenêtres techniques ou 482 passages respectant d'abord les limites des unités.

## Questions et protocole préétabli

Les dix questions positives du premier pilote restent présentes. Quatorze questions positives sont ajoutées : dix localisations constitutionnelles et quatre localisations de pages d'identité ou de dispositif dans les deux nouveaux arrêts. Deux questions sans preuve positive restent exclues du dénominateur. Total : **24 questions positives + 2 contrôles**. Les deux formulations de la citation de l'arrêt 91/2024 portent toujours sur le même lien ; elles ne sont pas deux faits indépendants.

La mesure principale restitue uniquement le texte source avec identifiants, sous un plafond de **6 000 octets UTF-8** commun à toutes les variantes. La vue enrichie est une mesure secondaire du coût des préfixes. Les classements, modèles, paramètres de découpage, RRF, poids vectoriel et politique de graphe restent ceux du pilote court. Aucun seuil ou filtre par identifiant de document n'est réglé sur les nouvelles questions. Le comptage n'est pas un budget exact de tokens LLM.

Les spans attendus sont les unités source demandées, et non les identifiants de chunks produits par une stratégie. Pour les questions demandant une première page, toute cette page est attendue, ce qui est plus exigeant que récupérer uniquement sa phrase d'identification. Chaque échec sera décrit au niveau des spans réellement manquants, afin de distinguer récupération partielle, confusion de document, budget et erreur de contexte généré.

Le seul faisceau de graphe reste la citation sourcée de l'article 159 par l'arrêt 91/2024. Aucun nouveau lien juridique n'est inventé pour les deux PDF. Le banc n'évalue donc pas encore un graphe exhaustif des références du corpus élargi, ni les contrats d'ontologie. La présence de plus de documents ne constitue pas, seule, une extension de la couverture sémantique.

Les contextes générés peuvent contenir des erreurs. Ils servent aux embeddings et à BM25, ne sont pas comptés comme texte source et sont exclus de la restitution principale. Le générateur reçoit le document complet ou son début et sa fin à la limite de 60 000 octets, plus le chunk courant ; le milieu absent peut contenir une référence ou une définition nécessaire.

Reconstruction locale :

```sh
python3 scripts/graphrag_legal_full_fixture.py --out /tmp/legal-full-rebuilt.json
cmp test/fixtures/graphrag-legal-v2/corpus.json /tmp/legal-full-rebuilt.json
```
