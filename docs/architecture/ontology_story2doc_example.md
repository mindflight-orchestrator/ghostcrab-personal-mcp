Voici la **procédure détaillée** que tu décris, reformulée comme un process opérationnel pour modéliser une application comme **Story2doc** dans **MindBrain**, à partir d’un crawl / scraper, puis générer des graphes, projections et rapports exploitables par des agents IA.

---

# Procédure de modélisation Story2doc dans MindBrain

## 1. Préparer le périmètre fonctionnel de l’application

La première étape consiste à identifier les écrans, objets métiers et actions principales de l’application à modéliser.

Dans ton exemple, tu pars d’un CRM / Story2doc avec des éléments comme :

* Dashboard
* Création de contact
* Création de société
* Création d’opportunité
* Ajout de note sur une opportunité
* Pages de détails
* Formulaires
* Boutons
* Sections
* Champs
* Modales éventuelles

L’objectif est de transformer l’application en un ensemble structuré d’objets compréhensibles par MindBrain.

À ce stade, tu définis déjà les premières briques :

* page
* section
* objet UI
* type de section
* niveau hiérarchique
* description
* action possible
* relation entre objets

Cette base sert ensuite à l’analyse automatique.

---

## 2. Lancer le crawl / scraping de l’application

Ensuite, le scraper passe sur une série de pages de l’application.

Le but du crawl est de produire un **snapshot** de l’interface à un instant donné.

Ce snapshot doit idéalement contenir :

* les pages détectées
* les sections visibles
* les champs
* les boutons
* les formulaires
* les modales
* les liens de navigation
* les textes visibles
* les états d’écran
* les captures d’écran
* éventuellement le DOM
* éventuellement les sélecteurs techniques
* les endpoints déclenchés
* les permissions ou rôles concernés

Dans ton MVP, les données sont encore partielles ou simulées, mais la logique cible est celle-ci :
le crawler observe réellement l’application et fournit une matière première structurée.

---

## 3. Créer un workspace MindBrain

Dans MindBrain, tu crées un **workspace**.

Le workspace n’est pas une seule ontologie. C’est plutôt un espace de travail dans lequel tu peux superposer plusieurs ontologies sur un même ensemble de données.

Un workspace peut donc contenir :

* plusieurs ontologies appliquées au même jeu de données ;
* plusieurs jeux de données séparés ;
* des relations entre plusieurs ontologies ;
* des projections pour exploiter ces graphes ;
* des rapports et sorties générées à partir des graphes.

C’est important parce que tu ne modèles pas seulement une interface : tu modèles plusieurs lectures possibles de cette interface.

---

## 4. Définir plusieurs ontologies

Tu expliques que le système crée plusieurs ontologies, par exemple cinq dans ton test.

Chaque ontologie est une manière de représenter les concepts et leurs relations.

Dans ton cas, les grandes familles sont :

## 4.1 Ontologie structurelle UI

Elle décrit la structure de l’interface.

Elle contient par exemple :

* pages
* écrans
* sections
* titres
* champs
* boutons
* formulaires
* modales
* composants
* groupes de champs
* menus
* cartes
* tableaux

Elle sert à comprendre la hiérarchie d’un écran.

Exemple :

```text
Page Dashboard
 └── Section Opportunités
      ├── Bouton Nouvelle opportunité
      ├── Liste Opportunités
      └── Filtre Statut
```

Cette ontologie permet à l’agent de savoir où se trouve un objet, dans quel contexte il apparaît, et avec quoi il est connecté.

---

## 4.2 Ontologie comportementale

Elle décrit les actions possibles et les parcours utilisateur.

Elle contient par exemple :

* naviguer vers une page
* cliquer sur un bouton
* remplir un champ
* sélectionner une option
* valider un formulaire
* attendre une réponse
* suivre une branche alternative
* gérer une erreur
* revenir à un écran précédent

Dans l’exemple “créer une opportunité”, le graphe comportemental peut représenter :

```text
Dashboard
 → cliquer sur Nouvelle opportunité
 → ouvrir le formulaire
 → remplir le nom
 → sélectionner le contact
 → sélectionner la société
 → choisir le statut
 → valider
 → arriver sur la fiche opportunité
```

Cette partie permet de transformer une application en **user stories navigables**.

---

## 4.3 Ontologie narrative et documentaire

Elle sert à générer de la documentation, des scripts, des guides, des players ou des PDF.

Un même step de user story devient une unité documentaire.

Chaque étape peut être liée à :

* un titre
* une description
* une instruction utilisateur
* un screenshot
* une zone d’écran
* un voice-over
* un bloc PDF
* un événement dans un player HTML
* une entrée dans un JSON player

Exemple :

```text
Step : Cliquer sur “Nouvelle opportunité”

Lié à :
- Screenshot du dashboard
- Zone du bouton
- Titre : Créer une opportunité
- Instruction : Cliquez sur “Nouvelle opportunité”
- Voice-over : Depuis le tableau de bord, cliquez sur...
- Bloc PDF : Étape 1
- Event player : highlight_button_new_opportunity
```

L’intérêt est que tous les artefacts documentaires sont générés depuis le même graphe source.

---

## 4.4 Ontologie d’artefacts

Elle décrit les sorties générables à partir des user stories et graphes.

Par exemple :

* PDF illustré
* documentation HTML
* script voice-over
* JSON player
* rapport d’audit
* rapport de comparaison
* guide utilisateur
* checklist QA
* documentation onboarding
* support chatbot

Chaque user story peut produire plusieurs artefacts liés au même graphe.

L’idée centrale est : **une seule structure de connaissance, plusieurs sorties possibles**.

---

## 4.5 Ontologie d’évidence / preuves

Elle permet de distinguer ce que l’interface “devrait être” de ce que le crawler a réellement observé.

Elle peut contenir :

* screenshots
* DOM capturé
* assets
* sélecteurs
* viewport
* bounding boxes
* données de crawl
* rôle utilisé pendant le crawl
* état dynamique de l’écran
* permissions visibles
* erreurs observées
* branches réellement testées

Cette ontologie sert à fiabiliser la documentation et à faire des audits.

---

# 5. Faire analyser le projet par un agent IA

Tu utilises Codex, mais tu précises que ça pourrait être Claude Code ou un autre agent.

L’agent reçoit :

* les fichiers du projet ;
* le starter kit ;
* les données issues de GoScrap ;
* les modèles existants ;
* les configurations disponibles ;
* les objectifs de modélisation.

Il analyse les fichiers et reformule le projet.

Il doit comprendre :

* l’environnement GoScrap ;
* le workspace MindBrain ;
* les schémas ;
* le job to be done ;
* les objets disponibles ;
* les graphes à construire ;
* les projections à préparer.

Dans ton exemple, l’agent commence par vérifier l’environnement, repérer les fichiers, puis proposer une structure de graphes.

---

# 6. Corriger et enrichir l’analyse de l’agent

L’agent peut se tromper ou ne pas voir toutes les configurations.

Dans ton cas, il détecte une version de GoScrap mais pas l’autre. Tu lui rappelles qu’il existe déjà des configurations.

Il corrige ensuite son analyse.

Cette étape est importante :
tu utilises l’agent comme partenaire de modélisation, mais tu gardes le contrôle métier et technique.

Tu lui fais préciser :

* ce qu’il a compris ;
* les modèles proposés ;
* les manques ;
* les hypothèses ;
* les données nécessaires ;
* les angles morts.

---

# 7. Construire les graphes principaux

L’agent propose ensuite de créer plusieurs graphes.

## 7.1 Graphe structurel UI

Ce graphe relie les objets d’interface entre eux.

Il permet de représenter :

```text
Page
 → Section
   → Formulaire
     → Champ
     → Bouton
```

Ou encore :

```text
Écran Opportunité
 → Section Informations générales
 → Section Contact lié
 → Section Notes
 → Bouton Ajouter une note
```

Ce graphe permet à l’agent de retrouver le contexte d’un objet.

Par exemple, si l’agent tombe sur le bouton “Créer”, il peut savoir :

* dans quel formulaire il se trouve ;
* sur quelle page ;
* dans quelle section ;
* quel objet métier est concerné ;
* quelle action utilisateur est déclenchée.

---

## 7.2 Graphe comportemental

Ce graphe décrit les parcours.

Il relie :

* les écrans traversés ;
* les actions atomiques ;
* les champs manipulés ;
* les conditions ;
* les branches possibles ;
* les erreurs ;
* les résultats attendus.

Exemple :

```text
User Story : Créer une opportunité

1. Aller sur le dashboard
2. Cliquer sur “Nouvelle opportunité”
3. Remplir le nom de l’opportunité
4. Associer un contact
5. Associer une société
6. Définir un statut
7. Enregistrer
8. Afficher la fiche opportunité
```

Ce graphe devient la base des guides, tests, aides contextuelles et agents actifs.

---

## 7.3 Graphe narratif / documentaire

Ce graphe transforme chaque action en contenu éditorial.

Pour chaque étape, tu peux associer :

* une explication ;
* une instruction ;
* une capture ;
* un script audio ;
* un bloc HTML ;
* un bloc PDF ;
* un événement player.

Exemple :

```text
Action : remplir le champ “Nom de l’opportunité”

Documentation :
- Titre : Nommer l’opportunité
- Description : Indiquez un nom clair pour retrouver l’opportunité.
- Instruction : Saisissez le nom dans le champ dédié.
- Voice-over : Donnez un nom explicite à votre opportunité commerciale.
- Screenshot : formulaire_opportunite.png
- Zone : champ_nom_opportunite
```

---

## 7.4 Graphe d’artefacts

Ce graphe relie les données source aux sorties générées.

Une user story peut produire :

```text
User Story
 → PDF
 → HTML
 → JSON Player
 → Voice-over
 → Rapport audit
 → Documentation support
```

Le système peut donc générer plusieurs formats sans refaire le travail de modélisation.

---

# 8. Identifier les données manquantes

Une fois les premiers graphes proposés, tu demandes à l’agent ce qui manque.

Il identifie plusieurs absences importantes.

Par exemple :

* `snapshot_id`
* `page_id`
* identifiants stables d’éléments
* granularité d’action atomique
* screenshots liés aux étapes
* zones d’écran
* bounding boxes
* viewport
* sélecteurs CSS / DOM
* modèle de permissions
* rôles utilisateurs
* états dynamiques
* branches négatives
* erreurs possibles
* différences mobile / desktop
* données sensibles
* endpoints déclenchés
* preuves du crawl réel

Cette étape sert à passer d’une modélisation conceptuelle à une modélisation robuste.

---

# 9. Étudier les angles morts

Tu demandes ensuite à l’agent d’identifier les angles morts.

Il relève notamment que le modèle décrit ce que l’interface devrait être, mais pas encore suffisamment ce que le crawler a réellement vu.

Les angles morts typiques sont :

* stabilité des identifiants ;
* écrans dynamiques ;
* permissions variables selon les rôles ;
* données sensibles ;
* vues mobile versus desktop ;
* branches négatives ;
* états d’erreur ;
* champs conditionnels ;
* modales temporaires ;
* messages de validation ;
* différences entre deux snapshots ;
* preuves visuelles ;
* incohérences entre modèle attendu et réalité observée.

À partir de là, tu ajoutes de nouveaux objets au graphe pour mieux qualifier les crawls et les comparaisons.

---

# 10. Générer ou adapter les données

Après l’analyse, tu demandes à l’agent de générer ou adapter les données.

Il prépare un plan de modification des fichiers.

Il peut créer ou modifier :

* les schémas ;
* les objets d’ontologie ;
* les relations ;
* les données de test ;
* les projections ;
* les scripts d’insertion ;
* les requêtes ;
* les validations ;
* les exemples de rapports.

Ensuite, tu lui demandes de se connecter au serveur et de vérifier le data model.

---

# 11. Créer les ontologies dans MindBrain

L’agent crée ensuite les ontologies dans le workspace.

Dans ton exemple, il indique avoir créé cinq ontologies.

Chaque ontologie définit :

* des concepts ;
* des relations ;
* des contraintes ;
* des règles ;
* des objets liés ;
* des types de rapports ou projections possibles.

Le même jeu de données est donc vu à travers plusieurs modèles complémentaires.

---

# 12. Vérifier les modèles créés

Tu demandes ensuite à l’agent de faire des tests.

Il vérifie par exemple :

* nombre de pages détectées ;
* nombre d’écrans ;
* nombre de user stories ;
* présence des étapes ;
* cohérence des relations ;
* disponibilité des objets ;
* qualité des projections ;
* données manquantes.

Dans ton exemple, il confirme avoir :

* 6 pages ;
* plusieurs écrans ;
* 6 user stories ;
* des étapes détaillées ;
* mais pas encore assez de granularité pour certains scénarios.

C’est normal, puisque le modèle initial est encore high-level.

---

# 13. Définir les projections

C’est une partie centrale de ton système.

Une projection est une requête pré-calculée ou pré-structurée qui permet à un agent d’obtenir directement le bon JSON sans devoir réfléchir lui-même à la manière de récupérer les données.

Autrement dit, au lieu que l’agent se demande :

> “Comment dois-je requêter le graphe pour générer la documentation de cette user story ?”

Il demande simplement :

```text
projection.generate_user_story_report(user_story_id)
```

Et MindBrain lui retourne directement le JSON prêt à utiliser.

---

# 14. Créer les projections principales

Tu listes plusieurs types de projections.

## 14.1 Projections structurelles

Elles servent à documenter l’interface.

Exemples :

* inventaire des pages ;
* structure de chaque page ;
* graphe UI par page ;
* registre de tous les objets UI ;
* matrice des champs requis ;
* matrice des règles de validation ;
* carte des boutons d’action ;
* carte des endpoints ;
* manifeste des captures d’écran ;
* rapport d’évolution d’interface ;
* rapport des éléments manquants ;
* rapport des éléments apparus ;
* rapport des preuves collectées.

---

## 14.2 Projections comportementales

Elles servent à exploiter les parcours.

Exemples :

* liste des user stories ;
* séquence d’une user story ;
* actions atomiques ;
* branches possibles ;
* champs manipulés ;
* étapes obligatoires ;
* erreurs possibles ;
* parcours alternatifs ;
* parcours par rôle utilisateur ;
* parcours incomplets ;
* parcours testables automatiquement.

---

## 14.3 Projections narratives

Elles servent à générer du contenu.

Exemples :

* brief documentaire par user story ;
* script voice-over ;
* blocs PDF ;
* blocs HTML ;
* instructions utilisateur ;
* texte d’aide contextuelle ;
* contenu pour chatbot ;
* structure de player interactif ;
* titres et descriptions par étape.

---

## 14.4 Projections d’artefacts

Elles servent à produire des livrables.

Exemples :

* PDF illustré ;
* documentation HTML ;
* JSON player ;
* script audio ;
* rapport d’audit ;
* rapport de comparaison ;
* guide onboarding ;
* documentation support ;
* checklist QA.

---

# 15. Utiliser les projections comme webhooks / triggers

Tu expliques aussi que les projections peuvent fonctionner comme des webhooks.

Quand un nouvel objet entre dans le graphe ou qu’un état change, une projection peut notifier un agent.

Exemple :

```text
Nouvelle donnée détectée
 → projection mise à jour
 → JSON streamé
 → agent notifié
 → action déclenchée
```

Cela permet une réaction quasi instantanée.

Cas d’usage :

* un changement d’interface est détecté ;
* une nouvelle user story apparaît ;
* une section disparaît ;
* un utilisateur bloque dans un parcours ;
* une opportunité est créée ;
* un onboarding n’avance pas ;
* un signal de churn est détecté.

L’agent reçoit directement le contexte utile, sans devoir reconstruire la requête.

---

# 16. Générer des rapports depuis les projections

Tu demandes ensuite à l’agent de montrer les résultats.

Par exemple :

## Inventaire des pages

La projection retourne un JSON avec les pages disponibles, leurs structures et leurs relations.

## Séquence de création d’opportunité

La projection retourne la user story :

```text
Depuis le dashboard :
1. cliquer sur “Nouvelle opportunité”
2. remplir les informations
3. associer les objets nécessaires
4. valider
5. arriver sur la fiche détail
```

L’agent explique aussi ce qui manque :

* sélecteurs ;
* champs précis ;
* screenshots ;
* zones d’écran ;
* détails des validations.

Mais la séquence de haut niveau est déjà exploitable.

---

# 17. Générer une documentation minimale

Tu demandes ensuite ce qu’il est possible de générer pour une page comme “Créer une société”.

L’agent répond qu’il peut déjà générer une fiche minimale avec :

* titre ;
* contexte ;
* description ;
* structure approximative ;
* étapes connues ;
* informations disponibles.

Mais il précise qu’une documentation complète écran par écran demanderait :

* screenshots ;
* sélecteurs ;
* zones d’écran ;
* champs détaillés ;
* règles de validation ;
* actions précises ;
* états d’erreur.

C’est un point important : le système sait dire ce qu’il peut produire et ce qu’il ne peut pas encore produire.

---

# 18. Brancher les outils techniques

Tu distingues deux outils :

## `mind.cd`

Il sert à interagir avec la base de données MindBrain / PostgreSQL, les modèles, les projections et les données structurées.

Il permet par exemple d’obtenir directement :

* liste des pages ;
* objets ;
* graphes ;
* projections ;
* rapports ;
* résultats JSON.

## GoScrap

Il reste l’outil spécialisé pour :

* crawler l’application ;
* collecter les écrans ;
* observer l’interface ;
* extraire les structures ;
* alimenter les ontologies ;
* aider à modéliser les objets du SaaS.

Les deux sont complémentaires :

```text
GoScrap collecte et observe.
MindBrain structure, connecte et projette.
Les agents exploitent les projections.
```

---

# 19. Exploiter les graphes avec des agents IA

Une fois le système en place, les agents peuvent utiliser les projections sans devoir reconstruire tout le contexte.

Exemple chatbot :

Un utilisateur demande :

> “Je ne sais pas créer une opportunité.”

L’agent peut :

1. comprendre l’intention ;
2. retrouver la user story correspondante ;
3. récupérer la projection de parcours ;
4. fournir une réponse documentaire ;
5. ouvrir la bonne page ;
6. guider l’utilisateur étape par étape ;
7. éventuellement pré-remplir certains champs ;
8. adapter l’aide selon le rôle et la session.

---

# 20. Étendre vers l’assistance active et l’onboarding

Tu expliques ensuite une extension très puissante : si l’agent est actif dans la session utilisateur, il peut collecter des données comportementales.

Il peut savoir :

* où l’utilisateur est allé ;
* ce qu’il a tenté ;
* où il s’est bloqué ;
* quelles étapes il n’a pas terminées ;
* quels champs posent problème ;
* depuis combien de temps il n’est pas revenu ;
* quels comportements précèdent un churn.

Ces données peuvent à leur tour entrer dans MindBrain.

On obtient alors des projections comportementales utilisateur.

Exemples :

```text
Utilisateur bloqué dans onboarding
 → projection onboarding_risk
 → agent notifié
 → proposition d’aide personnalisée
```

Ou :

```text
Utilisateur inactif depuis X jours
 + n’a jamais terminé l’action clé
 → projection churn_risk
 → agent déclenche une action
```

Cela transforme MindBrain en système d’intelligence produit, support, onboarding et rétention.

---

# 21. Générer plusieurs types de sorties

Une fois les graphes et projections prêts, le système peut produire automatiquement :

* documentation PDF ;
* documentation HTML ;
* player interactif ;
* JSON player ;
* scripts voice-over ;
* guides utilisateurs ;
* rapports d’audit ;
* rapports de comparaison entre versions ;
* matrices de champs ;
* cartographies d’écrans ;
* cartographies d’endpoints ;
* rapports d’onboarding ;
* rapports de churn ;
* aides chatbot ;
* actions agentiques dans l’interface.

La puissance vient du fait que les sorties ne sont pas créées séparément.
Elles sont toutes dérivées du même graphe.

---

# Procédure synthétique en 12 étapes

Voici la version condensée du process :

```text
1. Définir le périmètre fonctionnel de l’application.
2. Crawler les pages avec GoScrap.
3. Produire un snapshot versionné.
4. Créer un workspace MindBrain.
5. Définir plusieurs ontologies : structurelle, comportementale, narrative, artefacts, évidences.
6. Charger les données crawlées dans le workspace.
7. Faire analyser les fichiers et données par un agent IA.
8. Identifier les manques : snapshot_id, page_id, sélecteurs, screenshots, actions atomiques, rôles, permissions.
9. Générer ou adapter les schémas, concepts, relations et données.
10. Créer les projections pré-calculées.
11. Tester les projections : inventaire pages, user stories, rapports, JSON player.
12. Utiliser les projections pour produire documentation, agents actifs, audits, onboarding et support.
```

---

# Le principe clé

Le cœur de la méthode, c’est ceci :

```text
Une application est crawlée.
Le crawl devient un snapshot.
Le snapshot alimente plusieurs graphes.
Les graphes alimentent des projections.
Les projections alimentent des agents et des livrables.
```

Ou encore :

```text
Interface observée
 → Données structurées
 → Ontologies
 → Graphes
 → Projections
 → Documentation / Agents / Audits / Automatisations
```

---

# Ce que ça permet concrètement

Avec cette approche, tu peux prendre une application comme Story2doc et, en une journée de travail bien cadrée, obtenir :

* un modèle fonctionnel de l’application ;
* une cartographie des pages ;
* une cartographie des objets UI ;
* les premières user stories ;
* les relations entre écrans, actions et objets ;
* des projections exploitables par IA ;
* une base de documentation automatique ;
* une base pour un chatbot support ;
* une base pour un agent actif ;
* une base pour auditer les changements d’interface ;
* une base pour analyser onboarding, adoption et churn.

Le MVP peut commencer avec des données high-level, puis être enrichi progressivement avec les screenshots, sélecteurs, DOM, rôles, validations, branches négatives et événements réels de session.
