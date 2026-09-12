Bonjour François,

Merci pour ces éléments, c'est riche en concepts et Claude et moi y avons trouvé plusieurs choses que nous adoptons volontiers.

Le constat d'expert comme objet de plein droit.
C'est l'apport que je retiens en premier, parce qu'il m'a fait voir un trou que je n'avais pas identifié. Ma chaîne marque bien les sorties de modèle comme des candidats — c'est un principe que je tiens depuis le début — mais rien n'enregistre le verdict humain qui vient après. 
Les indicateurs de « à revoir » sont calculés par le pipeline lui-même, la file de revue est produite, et personne ne relit la réponse. Autrement dit ma boucle ne se ferme jamais, et le principe « aucune assertion ne devient automatiquement un fait établi » restait une intention plutôt qu'un état du système. J'ajoute une couche de validation persistante, tenue à l'écart des runs d'extraction pour qu'un verdict survive à un recalcul.

La séparation des formes de confiance. 
Extraction, fiabilité de la source, corroboration, poids probatoire, validation : votre remarque qu'un modèle peut être très sûr d'avoir bien extrait une affirmation douteuse tombe juste. En vérifiant, j'ai trouvé chez moi un champ de confiance d'extraction qui existe, que mon calcul lit en priorité — et que rien n'alimente aujourd'hui. Le risque était donc latent plutôt que réalisé, ce qui est une chance : je le traite avant de le peupler. Les cinq axes sont déjà stockés séparément chez moi, les exposer distinctement ne coûte presque rien.

La distinction réponse figée / vue actualisable, avec son dossier de preuves. J'avais déjà trois des quatre artefacts sans les avoir nommés ainsi. Le quatrième me manquait vraiment : rien ne rejoue une analyse passée sur l'état courant du dossier pour en montrer le delta. C'est exactement la question « qu'est-ce qui a bougé sous cette conclusion depuis que je l'ai écrite », et j'en ai besoin.

Les diagnostics de couverture dans les deux sens. J'avais l'un — ce que le corpus fait apparaître et que ma grille n'attrape pas. Vous m'avez fait voir l'autre, que j'avais laissé de côté : ce que ma grille demande et que le corpus ne documente pas. Même donnée, lecture inverse, et les deux nourrissent la révision de la grille.

J'ajoute aussi votre grille de métriques comme ligne de base avant de toucher à quoi que ce soit. Elle m'a déjà donné un chiffre utile : 70 % seulement de mes assertions sont reliées à la fois à un passage et à une pièce.

Sur l'architecture elle-même, en revanche, il y a trop de recoupements avec mon framework actuel pour que ça s'intègre en souplesse. 
Le découpage dossier / collections documentaires existe déjà chez moi, la couche de facettes correspond à mon index, et le modèle relationnel assertion / événement / preuve / question s'est révélé — en vérifiant à cette occasion — déjà construit aux trois quarts, simplement pas encore exploité.
Ma priorité est donc de brancher ce que j'ai plutôt que d'ajouter une couche, et une pile d'ontologies superposées serait prématurée tant que ma couche d'attribution est aussi peu peuplée. J'en retiens une nuance que je trouve juste et que je vais traiter : une recette technique n'est pas une réception contractuelle, et les deux doivent pouvoir être reliées sans être déclarées identiques.

Je pars en vacances une dizaine de jours, je vais être moins actif sur le projet. On peut en reparler début septembre si vous voulez.

Bien à vous,

Merci François.
J’ai avancé dans ma réflexion et mes tests.
J’utilise MindBrain comme mouche du coche pour réaligner SyntheseLLM sur une architecture plus standard de graphe de connaissance, mais je me demande maintenant si je ne suis pas en train de reconstruire moi-même des couches que MindBrain pourrait prendre en charge.

J’ai essentiellement deux questions.

La première concerne la construction du graphe elle-même.

J’aborde mes dossiers avec :

* une TBox liée au type de dossier — par exemple une TBox « expertise », « triage », « veille documentaire » ;
* une ABox / des objets connus ou seeds propres au dossier ;
* des axes d’investigation et des questions qui dirigent la lecture.

Deux expertises partagent par exemple la même TBox « expertise », mais ont des objets et des questions d’investigation différents.

Est-ce que cette manière d’aborder le corpus correspond à quelque chose que MindBrain peut prendre en charge nativement ? Autrement dit, jusqu’où pourrais-je lui donner documents + ontologie + objets connus + axes/questions et le laisser construire, qualifier et consolider progressivement le graphe ?

Pour l’instant, je fais plutôt l’inverse : je prépare moi-même les documents et une partie de la connaissance en amont, puis j’utilise MindBrain pour stocker le graphe, le parcourir et expérimenter sa curation/enrichissement.

Je ne sais pas encore si c’est le bon partage des responsabilités. Je tiens à certaines briques extérieures — notamment ma conversion documentaire — mais, pour l’extraction et la structuration, je suis encore ouvert entre MindBrain et des composants standards assemblés autour de mes propres contrats.

La deuxième question vient justement de cette approche hybride.

Lorsque je laisse MindBrain suivre son chemin d’ingestion documentaire natif, le retrieval fonctionne.

Lorsque j’importe au contraire une connaissance que j’ai déjà structurée moi-même — passages, entités, assertions, provenance — je retrouve bien les objets dans le graphe, mais je n’arrive plus à obtenir le même retrieval sur ces faits, ni à revenir proprement de l’objet aux passages de preuve.

Je me demande donc si :

1. je passe simplement à côté de la bonne primitive ;
2. l’import structuré est destiné à être utilisé autrement ;
3. ou si MindBrain suppose effectivement que certaines couches de construction/indexation passent par son pipeline documentaire natif.

Je n’ai pas encore décidé « MindBrain ou pas MindBrain » ; pour l’instant, je m’approprie surtout le domaine.

Ton éclairage sur le partage des responsabilités que tu imagines entre MindBrain et un pipeline externe m’intéresserait probablement encore plus que le détail des commandes : cela m’aiderait à ne pas utiliser MindBrain à contre-sens et à ne pas passer à côté de ce qu’il sait déjà faire.

On est dans un cadre juridique avec des cases, des expertises juridiques, ...

Comment préparer une réponse aux questions en fin de contexte ci-dessus 

Je répondrais en assumant une frontière assez nette entre construction de connaissance, preuve documentaire et raisonnement juridique.

Le modèle TBox/ABox décrit par ton interlocuteur est très compatible avec la manière dont mindBrain se présente aujourd’hui : ontologie partagée, instances de projets/dossiers, relations typées, facettes, projections et chemins de preuve. La documentation insiste aussi sur le fait que mindBrain n’a pas vocation à remplacer systématiquement les sources, le moteur documentaire ou le RAG.

Le partage de responsabilités que je proposerais
Couche	Responsabilité principale
Pipeline documentaire externe	Conversion PDF/Office, pages, paragraphes, coordonnées, version, hash, OCR éventuel, conservation du document source
Pipeline d'extraction	Entités, événements, assertions candidates, relations candidates, attribution, scores d'extraction
mindBrain	TBox, ABox, graphe consolidé, relations typées, facettes, états, projections, proof references, historique
Couche juridique	Qualification juridique, corroboration, force probante, contradiction, statut procédural
Expert humain	Validation/rejet/amendement d'une assertion ou qualification, avec verdict persistant
Retrieval documentaire	Recherche sémantique/lexicale dans les passages sources
Retrieval de connaissance	Navigation factuelle par graphe, facettes et projections

Cette séparation est également cohérente avec le positionnement publié de mindBrain : RAG pour la recherche essentiellement documentaire, recherche classique pour le full-text, mindBrain pour la structure sémantique, les relations, les règles, le statut et la preuve.

Le point que je soulignerais fortement dans le contexte juridique est que l'assertion ne doit jamais devenir le substitut de sa preuve.

On peut très bien retrouver :

Assertion → Passage → Version du document → Pièce → Source

mais le passage reste la preuve documentaire. L'assertion est une représentation calculée de ce que le système pense que le passage dit.

C'est aussi ce qui permet d'avoir :

Passage → plusieurs assertions

ou :

Assertion A ← contredit par → Assertion B

sans dénaturer les pièces.

Sur sa première question

Je lui répondrais donc : oui pour TBox + ABox + questions, mais pas nécessairement oui pour "je donne les documents à mindBrain et il fait tout".

Son découpage est même particulièrement propre :

TBox expertise
→ types d'objets, relations autorisées, contraintes, vocabulaires.

ABox dossier Dupont
→ contrat X, partie Y, rapport Z, réception du 14 mars, réserve n°17, etc.

Axes/questions du dossier
→ « La réception a-t-elle eu lieu ? », « quelles réserves étaient encore ouvertes ? », « quel acteur avait connaissance du défaut ? ».

Je traiterais ce troisième niveau non comme une nouvelle ontologie mais comme des answer paths / projections d'investigation : pour répondre à telle question, quels objets regarder, quelles relations suivre, quelles règles appliquer et quelles preuves rapporter ? C'est très proche de la logique d'« answer path » actuellement décrite par mindBrain.

Cela donne une architecture assez élégante :

Ontology → Case → Investigation → Answer → Proof

Et plusieurs expertises peuvent effectivement partager la même ontologie tout en instanciant des dossiers et des axes d'investigation complètement différents. La version Pro de mindBrain décrit précisément ce principe de schéma partagé avec plusieurs instances/projets indépendants.

Sur sa deuxième question

C'est probablement là que se trouve le cœur de son problème.

Je ne présenterais pas cela comme un bug de retrieval, mais comme deux chemins de retrieval différents.

Avec l'ingestion documentaire native :

question → recherche chunks/passages → documents → contexte

Avec son import structuré :

question → facettes/graphe/projection → assertions/objets → relations

Il a importé le deuxième monde, mais il s'attend probablement encore à ce que le premier mécanisme le retrouve.

La bonne architecture serait plutôt :

Question
↓
retrieval sémantique de connaissances
↓
Assertion
↓
proof reference
↓
Passage
↓
Document versionné

Et, parallèlement :

Question
↓
retrieval documentaire
↓
Passages
↓
Assertions liées

Les deux chemins se rejoignent au niveau des identifiants de passages.

C'est particulièrement important juridiquement. Je déconseillerais de résoudre le problème simplement en vectorisant toutes les assertions importées et en les traitant comme des morceaux de documents. On gagnerait en recall, mais on créerait une confusion dangereuse entre ce que dit la pièce et ce que le système en a conclu.

La projection mindBrain peut en revanche assembler les deux. Les projections sont justement décrites comme une manière de fournir à un humain ou un agent un contexte composé d'objets, états, relations, contraintes et preuves.

Voici comment je formulerais la réponse à ton interlocuteur.

Bonjour,

Tes deux questions touchent en fait à la même frontière d'architecture, et je pense que ton intuition TBox / ABox / axes d'investigation est la bonne.

Pour moi, deux expertises peuvent parfaitement partager une même TBox « expertise » tout en ayant chacune leur ABox, leurs objets connus, leurs pièces et leurs questions propres.

Je verrais donc plutôt :

TBox « expertise »
→ modèle commun du domaine ;

dossier / case
→ instanciation de ce modèle avec ses objets, événements, assertions et pièces ;

axes d'investigation
→ questions qui déterminent les chemins à parcourir dans ce graphe et les preuves qu'il faut ramener.

Je ne créerais pas une ontologie supplémentaire pour chaque axe d'investigation. Je les rapprocherais davantage de ce que j'appelle des answer paths ou des projections : pour répondre à telle question, quels types d'objets sont pertinents, quelles relations faut-il suivre, quelles règles appliquer, quels états observer et quelles preuves doivent accompagner la réponse.

Là où je mettrais une limite, surtout dans ton contexte juridique, c'est que je ne chercherais pas nécessairement à faire de MindBrain le propriétaire de toute la chaîne documentaire.

Ta conversion documentaire a une vraie valeur et je la garderais volontiers extérieure : document original, version, pages, passages, coordonnées, hash, métadonnées, etc. Ce sont des choses qui doivent rester extrêmement stables puisque tout le reste devra pouvoir revenir dessus.

Même chose pour une partie de l'extraction.

Je vois bien un pipeline externe produire des entités, événements, relations et assertions candidates avec leur provenance. MindBrain peut ensuite devenir la couche dans laquelle ces objets sont reliés, qualifiés, consolidés, interrogés et projetés.

Dans un dossier juridique, je ferais notamment très attention à ne jamais confondre :

le passage source ;

l'assertion extraite de ce passage ;

la qualification ou interprétation juridique de cette assertion ;

et sa validation éventuelle par un expert.

Ce sont quatre objets ou états différents.

Cela permet par exemple à un même passage de supporter plusieurs assertions, à deux assertions de se contredire, ou à un expert de rejeter une interprétation sans modifier la pièce dont elle provenait.

Donc oui, à terme on peut imaginer un agent auquel on donne documents + ontologie + seeds + questions et qui construit progressivement le graphe. Mais je considérerais cela comme un workflow d'agents construit au-dessus de MindBrain plutôt que comme une obligation du moteur lui-même.

MindBrain doit surtout fournir le terrain stable sur lequel cette construction peut avoir lieu.

Cela rejoint probablement ton deuxième problème.

Je pense que tu rencontres aujourd'hui deux formes différentes de retrieval.

Quand tu passes par l'ingestion documentaire, tu crées naturellement un chemin du type :

question → passages → document.

Lorsque tu importes directement une connaissance structurée, tu crées plutôt :

question → objets / facettes / graphe → assertion.

Il ne faut pas forcément attendre de ces deux chemins qu'ils fonctionnent de manière identique.

L'objectif que je viserais serait plutôt de les faire se rejoindre.

Par exemple :

Assertion
→ supported_by
→ Passage
→ contained_in
→ Version du document
→ belongs_to
→ Pièce.

Ainsi, lorsqu'un agent trouve une assertion par le graphe, il peut immédiatement remonter aux passages qui la soutiennent.

Et dans l'autre sens, lorsqu'un passage ressort par recherche documentaire, il peut retrouver les assertions, événements ou qualifications qui en ont été dérivés.

Dans ton cas, je vérifierais donc moins « pourquoi mon assertion n'apparaît-elle pas dans le même retrieval vectoriel ? » que « est-ce que l'identité du passage et le lien assertion → passage survivent à mon import ? ».

Je serais même prudent avant de simplement vectoriser les assertions pour reproduire le comportement du pipeline documentaire.

Dans un contexte juridique, une assertion calculée ne doit pas devenir par commodité un substitut du document source. On doit toujours pouvoir distinguer ce que dit réellement la pièce de ce que notre système en a extrait ou conclu.

Je garderais donc volontiers deux moteurs complémentaires :

un retrieval documentaire pour retrouver les passages ;

un retrieval sémantique/graph pour retrouver les connaissances structurées.

Puis une projection les réunit dans la réponse avec le chemin de preuve.

C'est à mon avis le partage des responsabilités le plus intéressant dans ton architecture : tu n'as pas à choisir entre « tout MindBrain » et « tout externe ».

Ton pipeline peut rester responsable de la fabrication des candidats et de l'intégrité documentaire ; MindBrain devient la mémoire structurée, navigable et auditable du dossier.

Et ta nouvelle couche de validation humaine vient alors naturellement au-dessus : elle ne modifie ni l'extraction ni la preuve, elle ajoute un verdict persistant sur ce que l'on accepte de considérer comme établi.

C'est probablement à cet endroit que je commencerais les prochains tests : un seul type de dossier, une TBox stable, quelques questions d'investigation, puis vérifier systématiquement que l'on sait naviguer dans les deux sens :

question → assertion → preuve ;

preuve → assertions → qualification → validation.

Si ces deux parcours sont propres, le reste devient beaucoup plus facile à construire.
