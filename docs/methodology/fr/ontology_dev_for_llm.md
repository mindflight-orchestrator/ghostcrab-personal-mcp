# Compétence : Développement d'ontologies pour les LLM

> Version française — version anglaise : [`../ontology_dev_for_llm.md`](../ontology_dev_for_llm.md)

## Objectif

Utiliser cette compétence pour aider un utilisateur à concevoir, réviser, affiner ou documenter une ontologie pour un domaine. L'ontologie doit définir un vocabulaire partagé des concepts du domaine, leurs relations, leurs propriétés, les contraintes sur ces propriétés, ainsi que des instances représentatives.

## Quand utiliser cette compétence

Utiliser cette compétence lorsque l'utilisateur demande à :

- Créer une ontologie
- Définir un modèle de domaine ou un modèle de connaissance
- Construire une taxonomie, une hiérarchie de classes, un vocabulaire contrôlé, un schéma ou un modèle sémantique
- Convertir des connaissances métier en classes, propriétés, relations et instances
- Réviser ou améliorer une ontologie existante
- Générer des questions de compétence pour une base de connaissances
- Préparer une ontologie à l'usage d'un LLM, d'un agent logiciel, d'une base de données ou d'un graphe de connaissances

## Principes fondamentaux

1. Il n'existe pas d'ontologie unique et correcte.
   Le meilleur modèle dépend de l'application visée, des utilisateurs attendus, des extensions futures et des besoins de maintenance.

2. Le développement d'ontologies est itératif.
   Commencer par une version approximative, la tester sur des cas d'usage et des questions de compétence, puis la réviser.

3. Modéliser le domaine, pas l'implémentation.
   Les concepts doivent correspondre à des objets physiques ou logiques significatifs, et les relations à des liens métier réels.

4. Séparer la connaissance du domaine de la logique opérationnelle.
   L'ontologie décrit ce qui existe dans le domaine, sans coder en dur le fonctionnement d'une application.

5. Privilégier la réutilisation.
   Avant d'inventer une nouvelle ontologie, vérifier si des ontologies, vocabulaires, taxonomies, standards ou schémas existants peuvent être réutilisés ou étendus.

## Workflow

### Étape 1 : Déterminer le domaine et le périmètre

Questions à poser :

- Quel domaine l'ontologie couvre-t-elle ?
- À quoi servira-t-elle ?
- Quelles questions doit-elle permettre de répondre ?
- Qui l'utilisera ?
- Qui la maintiendra ?
- Qu'est-ce qui est explicitement hors périmètre ?

Produire :

- Énoncé du domaine
- Limites du périmètre
- Utilisateurs cibles
- Applications visées
- Concepts dans le périmètre
- Concepts hors périmètre

### Étape 2 : Créer les questions de compétence

Les questions de compétence sont des questions en langage naturel auxquelles l'ontologie doit pouvoir répondre.

Exemples :

- Quels types d'entités existent dans ce domaine ?
- Quelles entités appartiennent à quelles catégories ?
- Quelles propriétés décrivent chaque entité ?
- Quelles relations existent entre les entités ?
- Quelles contraintes déterminent les données valides ou invalides ?
- Quels cas doivent être inférables depuis l'ontologie ?

Utiliser ces questions comme tests ultérieurement.

Produire :

- Une liste numérotée de questions de compétence
- Une note expliquant quelles parties de l'ontologie chaque question requiert

### Étape 3 : Rechercher des ontologies réutilisables

Rechercher :

- Des ontologies de domaine existantes
- Des taxonomies sectorielles
- Des vocabulaires contrôlés
- Des schémas de métadonnées
- Des schémas de base de données
- Des modèles d'objets API
- Des organismes de normalisation ou des jeux de données publics

Pour chaque candidat, évaluer :

- La pertinence
- La couverture
- La licence ou les restrictions d'utilisation
- La maintenabilité
- La compatibilité avec la représentation cible
- Si on doit le réutiliser, l'étendre, le mapper ou l'ignorer

Produire :

| Candidat | Source | Termes utiles | Décision de réutilisation | Raison |
|---|---|---|---|---|

### Étape 4 : Énumérer les termes importants

Lister tous les termes importants du domaine avant d'imposer une structure.

Inclure :

- Entités
- Concepts
- Attributs
- Relations
- Événements
- Rôles
- États
- Valeurs
- Synonymes
- Instances exemples

Ne pas décider trop tôt si un terme est une classe, une propriété, une valeur ou une instance.

Produire :

| Terme | Signification en langage simple | Type possible | Notes |
|---|---|---|---|

Types possibles :

- Classe
- Propriété
- Relation
- Instance
- Valeur
- Synonyme
- Contrainte
- Hors périmètre

### Étape 5 : Définir les classes et la hiérarchie de classes

Identifier les termes qui représentent des entités indépendamment significatives dans le domaine. Ce sont généralement les classes.

Utiliser l'une des trois approches :

1. Approche descendante (top-down) :
   Commencer par les concepts généraux et les spécialiser.

2. Approche ascendante (bottom-up) :
   Commencer par des exemples concrets et les regrouper en classes générales.

3. Approche combinée :
   Commencer par les concepts de niveau intermédiaire les plus saillants, puis généraliser et spécialiser.

Pour chaque classe, définir :

- Nom
- Définition
- Classe parente
- Classes enfants
- Synonymes
- Critères d'inclusion
- Critères d'exclusion
- Instances exemples

Appliquer le test « est-un » :

> Si A est une sous-classe de B, chaque instance de A doit aussi être une instance de B.

Éviter :

- Mélanger classes et instances
- Créer des sous-classes qui ne sont pas de véritables « types » de leur parent
- Dupliquer les formes singulière et plurielle comme classes distinctes
- Créer des niveaux hiérarchiques sans valeur sémantique ajoutée
- Modéliser des artefacts d'implémentation comme des classes du domaine

Produire :

| Classe | Classe parente | Définition | Instances exemples | Notes |
|---|---|---|---|---|

### Étape 6 : Définir les propriétés et les relations

Les classes seules ne suffisent pas. Définir la structure interne de chaque concept.

Pour chaque propriété ou relation, identifier :

- Nom
- Domaine : quelle classe possède cette propriété ?
- Portée : quel type de valeur est autorisé ?
- Cardinalité : une valeur, optionnelle, requise, plusieurs valeurs ?
- Relation inverse, le cas échéant
- Si elle est héritée par les sous-classes
- Si elle est intrinsèque, extrinsèque, partie-tout ou relationnelle

Catégories de propriétés :

- Propriété intrinsèque : caractéristique inhérente de la chose
- Propriété extrinsèque : nom, étiquette, origine, identifiant ou contexte
- Propriété partie-tout : composants ou sous-parties
- Propriété relationnelle : relie un individu à un autre

Attacher chaque propriété à la classe la plus générale où elle est valide.

Produire :

| Propriété | Classe du domaine | Portée / Type de valeur | Cardinalité | Inverse | Description |
|---|---|---|---|---|---|

### Étape 7 : Définir les facettes / contraintes

Pour chaque propriété, définir les contraintes sur les valeurs valides.

Facettes courantes :

- Type de valeur : chaîne, nombre, booléen, date, énumération, instance de classe
- Valeurs autorisées
- Cardinalité minimale
- Cardinalité maximale
- Requis ou optionnel
- Valeur par défaut
- Unités
- Format de données
- Plage valide
- Règles de disjonction
- Règles de cohérence inverse

Produire :

| Propriété | Type de valeur | Valeurs autorisées | Min | Max | Requis ? | Notes de contrainte |
|---|---|---|---|---|---|---|

### Étape 8 : Créer des instances

Créer des exemples représentatifs pour valider l'ontologie.

Pour chaque instance :

- Choisir la classe correcte
- Créer l'individu
- Remplir les valeurs des propriétés
- Vérifier les propriétés héritées
- Vérifier les contraintes
- Vérifier les questions de compétence

Produire :

| Instance | Classe | Valeurs des propriétés | Notes |
|---|---|---|---|

### Étape 9 : Valider l'ontologie

Valider par rapport à :

1. Questions de compétence
   L'ontologie peut-elle y répondre ?

2. Hiérarchie de classes
   Chaque sous-classe passe-t-elle le test « est-un » ?

3. Placement des propriétés
   Chaque propriété est-elle attachée à la classe valide la plus générale ?

4. Cardinalité et contraintes
   Les valeurs sont-elles complètes, valides et non contradictoires ?

5. Réutilisation et interopérabilité
   L'ontologie s'aligne-t-elle sur les standards pertinents ou les vocabulaires réutilisés ?

6. Maintenabilité
   Les utilisateurs futurs peuvent-ils étendre le modèle sans le casser ?

7. Clarté
   Les définitions de classes et de propriétés sont-elles compréhensibles pour les experts du domaine ?

Produire :

| Vérification | Réussite / Échec | Problème | Correction recommandée |
|---|---|---|---|

## Modèle de sortie

Lors de l'aide à la création d'une ontologie, produire les sections suivantes :

1. Domaine et périmètre
2. Questions de compétence
3. Ontologies ou standards réutilisables
4. Termes importants
5. Hiérarchie de classes
6. Propriétés et relations
7. Facettes et contraintes
8. Instances exemples
9. Notes de validation
10. Questions ouvertes

## Formats de sortie préférés

Utiliser des tableaux pour les éléments ontologiques.

Format pour les classes :

| Classe | Parent | Définition | Exemples | Notes |
|---|---|---|---|---|

Format pour les propriétés :

| Propriété | Domaine | Portée | Cardinalité | Inverse | Description |
|---|---|---|---|---|---|

Format pour les instances :

| Instance | Classe | Valeurs |
|---|---|---|

Pour une sortie lisible par machine, proposer l'un des formats suivants :

- JSON
- YAML
- RDF/Turtle
- Définitions de classes/propriétés style OWL
- Diagramme de classes Mermaid
- Schéma de concepts SKOS

## Checklist qualité

Avant de finaliser, vérifier :

- L'ontologie a un objectif clair.
- Les limites du périmètre sont explicites.
- Les questions de compétence sont listées.
- Les termes importants sont capturés avant la classification.
- Les classes représentent de véritables concepts du domaine.
- Les sous-classes passent le test « est-un ».
- Les instances ne sont pas modélisées comme des classes.
- Les propriétés sont attachées à la classe valide la plus générale.
- Les portées et cardinalités des propriétés sont définies.
- Les relations inverses sont notées là où c'est utile.
- Les contraintes sont explicites.
- Des instances exemples existent.
- Le modèle a été testé par rapport aux questions de compétence.
- Les questions de modélisation ouvertes sont clairement listées.

## Erreurs courantes à éviter

- Traiter chaque terme comme une classe
- Confondre classes et instances
- Créer une hiérarchie basée sur des menus d'interface plutôt que sur le sens du domaine
- Utiliser des classes parentes vagues comme « Autre » ou « Divers »
- Ajouter des propriétés trop bas dans la hiérarchie alors qu'elles s'appliquent plus généralement
- Ignorer la cardinalité et les valeurs autorisées
- Ne pas documenter les hypothèses
- Surconstruire au-delà du périmètre déclaré
- Concevoir pour un seul exemple plutôt que pour le domaine
- Supposer que le premier modèle est définitif

## Style d'interaction

Lorsque le domaine de l'utilisateur est insuffisamment spécifié, poser des questions de clarification concises :

1. Quel domaine l'ontologie doit-elle couvrir ?
2. À quoi servira-t-elle ?
3. Quelles questions doit-elle permettre de répondre ?
4. Qui la maintiendra ou la consommera ?
5. Existe-t-il des standards ou schémas existants à réutiliser ?

Lorsque suffisamment d'informations sont disponibles, procéder de manière itérative :

1. Ébaucher une petite ontologie initiale.
2. Expliquer les choix de modélisation.
3. Signaler les ambiguïtés.
4. Demander la correction par un expert du domaine.
5. Affiner l'ontologie.

## Exemple appliqué — Syndic immeuble

Pour un jeu concret de questions de compétence dans un domaine corpus documentaire, voir [`examples/immeuble/reference/scenarios.yaml`](../../../examples/immeuble/reference/scenarios.yaml). Chaque entrée est une question en langage naturel que le domaine syndic doit permettre de traiter (ex. qui occupe le lot A1, si un paiement CODA correspond à une charge attendue).

Ces questions ont été élicitées via l'approche narrative en 5 actes décrite dans [`universal_methodology.md`](../universal_methodology.md) §1 (scénario comptable le 5 du mois). Elles correspondent à l'artefact optionnel `analysis_plan` dans [`answer-artifacts.seed.jsonl`](../../../examples/immeuble/reference/answer-artifacts.seed.jsonl).

Exécution GhostCrab bout en bout sur ce domaine : [`docs/explanation/README.md`](../../explanation/README.md) (hub lab + architecture) · [`universal_methodology.md`](../universal_methodology.md) §12.
