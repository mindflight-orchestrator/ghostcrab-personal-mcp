# Claude Code Natural Test Pack

Use this pack for the first natural GhostCrab pass in Claude Code.

The principle is the same as for Codex:

- do not mention skill names
- do not mention tool names
- do not mention schema names
- let the user talk about GhostCrab as a product in plain language

## Context To Paste First

```text
Contexte GhostCrab

Le produit public s'appelle GhostCrab.
Les outils MCP publics sont ghostcrab_*.
Les schémas publics sont ghostcrab:*.
Le contrat visé est :

1. Sur une demande floue d'onboarding :
- analyse d'intention
- 2 à 4 questions max
- offre de prompt
- pas d'implémentation immédiate
- pas de ghostcrab_schema_register au premier tour

2. Pour les trackers vivants :
- ghostcrab:task = source of truth du statut courant
- ghostcrab_upsert = mutation du présent
- agent:observation = contexte, pas état principal

3. Pour les projets longs :
- reprise depuis l'état courant canonique
- puis lecture des ghostcrab:source et ghostcrab:note
- puis vue compacte adaptée

La suite utile maintenant n'est plus d'ajouter de la structure.
La suite utile est de lancer des scénarios naturels réels pour voir comment l'agent se comporte avec cette base.
```

## What We Want From Claude Code

On a first-turn fuzzy request, Claude Code should:

1. infer the likely activity family
2. state a short intent hypothesis
3. ask 2 to 4 clarification questions
4. make at least half of them family-specific
5. mention the likely compact view when visible
6. explicitly offer help writing the next structured GhostCrab prompt
7. avoid implementation and schema freeze

## Natural Scenario Order

1. multi-phase onboarding
2. external API integration
3. external PostgreSQL integration
4. environment-specific deployment
5. mini CRM
6. knowledge memory

## Scenario 1

```text
J'ai besoin d'utiliser GhostCrab pour piloter un projet qui va durer plusieurs phases, avec des tâches, des blocages, des handoffs et probablement des changements de priorités en route.

Je ne sais pas encore quelle structure je veux.
Je veux surtout ne pas perdre le fil au bout de plusieurs sessions.
```

## Scenario 2

```text
Je dois connecter une API partenaire à notre produit.
Il y aura sûrement des problèmes d'auth, du mapping de payload, des endpoints à suivre, des docs externes et plusieurs étapes avant que ce soit fiable.

Je veux que GhostCrab m'aide à garder l'état courant, les preuves utiles et le prochain pas, mais je ne veux pas figer un schéma trop tôt.
```

## Scenario 3

```text
Je dois brancher une base PostgreSQL externe dans un flux existant.
Je vais devoir retenir ce qu'on observe sur le schéma, les contraintes d'accès, les blocages, les décisions prises et ce qu'il faut faire ensuite.

Je veux quelque chose de durable, mais pas un design rigide dès le départ.
```

## Scenario 4

```text
Je dois suivre un déploiement dans un environnement spécifique avec des contraintes locales, des validations, des points de blocage et des prochaines étapes sûres.

Je veux pouvoir reprendre plus tard sans relire tout l'historique.
```

## Scenario 5

```text
J'ai besoin d'un petit suivi commercial dans GhostCrab.
Je veux garder les leads, quelques opportunités, ce qui est bloqué et la prochaine relance utile, sans transformer ça en gros CRM.
```

## Scenario 6

```text
Je veux utiliser GhostCrab comme mémoire de travail pour un sujet que j'explore sur plusieurs sessions.
Je veux retenir les sources utiles, les notes importantes, les questions ouvertes et ce qu'il faut clarifier ensuite.
```

## Quick Scoring

Score each run from 0 to 2 on:

- intent detection
- question quality
- family-specificity
- anti-pattern avoidance
- compact-view guidance
- prompt-help offer

## Immediate Next Step

Start with scenario 1 in a fresh Claude Code thread and evaluate whether Claude:

- stays in onboarding mode
- avoids early schema design
- avoids `ghostcrab_status` too early
- offers a prompt help line naturally
