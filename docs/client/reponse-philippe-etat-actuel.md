# Réponse de François à Philippe — état au 2026-09-11

Contexte : réponse aux deux questions de Philippe (`question-juridique.md`), rédigée sur l'état vérifié du produit Pro (pg_mindbrain 3.1) et de la version Personal. Analyse et vérifications dans `analyse-questions-philippe.md`.

---

Bonjour Philippe,

Merci pour ces deux questions, elles tombent bien : la deuxième met le doigt sur une frontière réelle du produit, pas sur une erreur d'usage de ta part. Je préfère te répondre sur ce qui existe aujourd'hui, ce qui manque, et ce qu'on compte faire, plutôt qu'en principes.

## 1. Partage des responsabilités

Ton découpage TBox « expertise » / ABox par dossier / axes d'investigation est le bon, et il correspond à des objets qui existent réellement.

- **La TBox partagée.** Une ontologie est publiée comme une release versionnée et immuable. Chaque dossier est un workspace qui souscrit à une release, avec la possibilité d'un overlay local. Deux expertises partagent donc la même TBox sans se contaminer, et une mise à jour de la TBox donne un rapport d'impact avant requalification.
- **L'ABox du dossier.** C'est ce que tu importes déjà : entités, relations, assertions, avec provenance vérifiable ligne par ligne. Il n'y a pas de notion de « seed qui guide l'extraction » : les objets connus sont des instances comme les autres.
- **Les axes d'investigation.** Je ne les modéliserais pas comme une ontologie. Ils correspondent à deux choses : des questions métier enregistrées avec leur plan de résolution (quels objets, quelles relations, quelles preuves), et des artefacts de réponse en quatre formes : plan d'analyse, vue vivante, snapshot figé, dossier de preuves. Ton « quatrième artefact », rejouer une analyse sur l'état courant et voir ce qui a bougé, c'est exactement la vue vivante comparée au snapshot, avec l'historique des versions entre les deux.
- **Ta conversion documentaire.** Garde-la. Le moteur attend des passages avec des identifiants stables, pas des PDF. Tout le reste doit pouvoir revenir dessus.
- **L'extraction.** Les deux voies sont légitimes : ton pipeline via l'import structuré, ou le pipeline natif (découpage, profil LLM, qualification proposée puis relue). Mais elles n'aboutissent pas au même endroit, et c'est ta deuxième question.
- **La validation humaine.** Le motif proposé / approuvé / rejeté existe partout dans le moteur (qualifications, patches de graphe, remédiations qualité), mais pas encore comme verdict attaché à une assertion. Ta couche de validation persistante est une spécification que je prendrais volontiers telle quelle.

Donc : oui pour documents + ontologie + objets connus + questions. Mais « et il construit tout seul » est un workflow d'agents au-dessus du moteur, pas une garantie du moteur. Le moteur fournit le terrain stable : identités, versions, fenêtres de validité, provenance, états.

## 2. Pourquoi ton import structuré ne se retrouve pas comme l'ingestion native

Tu ne rates pas une primitive. Les deux routes atterrissent dans deux stores distincts, avec deux surfaces de recherche distinctes. Concrètement, sur la version actuelle :

1. L'import structuré écrit les faits, les entités, les relations et la provenance, puis reconstruit la projection graphe. Il n'écrit aucun passage et ne calcule aucun embedding.
2. Tes faits importés sont trouvables par la recherche lexicale sur le store de faits. Deux réserves : l'analyseur plein texte est configuré en anglais, ce qui dégrade le français juridique, et la recherche sémantique demande un calcul d'embeddings explicite après import.
3. Les documents ingérés par la voie native vivent dans les collections et leurs chunks. On les atteint par les facettes de collection, par les vecteurs de chunks et par le graphe, jamais par la recherche de faits.
4. Le lien objet → passage existe en base et se lit par un outil dédié (`ghostcrab_graph_entity_chunks`). Mais aujourd'hui seul l'extracteur du pipeline natif l'écrit. Rien ne te permet de fournir tes propres liens assertion → passage, alors que tu les as déjà.

Ta troisième hypothèse est donc la bonne : le moteur suppose pour l'instant que la couche « quel objet est soutenu par quel passage » passe par son pipeline. C'est une limite que nous allons ouvrir, dans cet ordre :

- accepter des liens assertion → passage fournis de l'extérieur, via l'import structuré ou un outil dédié. La fonction interne existe, il manque l'exposition et le format ;
- une recherche combinée faits + passages côté Pro. Elle existe déjà dans la version Personal, pas encore dans la version Postgres ;
- passer l'analyse plein texte en configuration française.

Ce que je ne te conseille pas : vectoriser tes assertions comme si c'étaient des morceaux de documents pour retrouver le recall. Tu gagnerais en rappel, mais tu perdrais la distinction entre ce que dit la pièce et ce que ton système en a conclu. En juridique, cette distinction est la valeur.

## 3. Ce que je te propose comme prochain test

Un seul type de dossier, une TBox stable, trois questions d'investigation. Puis vérifier les deux parcours :

- question → assertion → passages liés → version du document → pièce ;
- passage → assertions dérivées → qualification → verdict.

Ton indicateur est déjà le bon : 70 % d'assertions reliées à la fois à un passage et à une pièce. L'objectif est 100 %, avec des identifiants de passage qui survivent à une reconversion.

Pour préparer ça, j'aurais besoin de savoir :

1. à quoi ressemblent tes identifiants de passage (hash de fichier, page, offsets, id de paragraphe) ;
2. par quel chemin tu importes et ce que tu mets dans le contenu textuel des faits ;
3. si tu veux stocker tes cinq axes de confiance comme propriétés de relation, comme facettes, ou comme faits séparés ;
4. la forme que tu veux donner au verdict d'expert : objet séparé qui pointe l'assertion, ou état de l'assertion.

Un dernier point : tes dossiers citent de la législation. De notre côté, on construit une archive de la législation belge avec des articles à identité stable et des passages de preuve (hash, page, citation verbatim, confiance). Une relation « cite » de tes assertions vers ces articles serait un premier pont concret entre ton dossier et le droit applicable.

Bien à toi,
François
