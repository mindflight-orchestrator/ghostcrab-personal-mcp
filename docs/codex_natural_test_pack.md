# Codex Natural Test Pack

This pack is the default starting point for a fresh Codex pass against GhostCrab.

Goal:

1. test natural user requests before evaluation-style prompts
2. observe intent detection, question quality, and current-state discipline
3. compare later with Claude Code and OpenClaw using the same scenarios

## Natural Prompt Rule

For the first pass, do not mention:

- any GhostCrab skill name
- any MCP tool name
- any schema name
- any expected compact-view name

The user should talk about GhostCrab as a product and describe the need in plain language.

Keep a second pass later for guided prompts if needed.

## Test Setup

Use a fresh Codex thread with GhostCrab MCP enabled.

Paste this context block first:

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
- puis vue compacte adaptée :
  - mini-heartbeat
  - phase-heartbeat
  - deployment-brief
  - integration-health-brief
  - knowledge-snapshot

La base actuelle contient maintenant aussi :
- ghostcrab:source
- ghostcrab:note
- ghostcrab:integration-endpoint
- ghostcrab:environment-context
- activity families :
  - integration-operations
  - environment-delivery

La suite utile maintenant n'est plus d'ajouter de la structure.
La suite utile est de lancer des scénarios naturels réels sur Codex / Claude / OpenClaw pour voir comment ils se comportent avec cette base.

Objectif du flux :
- tester les scénarios naturels
- comparer les comportements
- identifier les derniers écarts de prompting, routing ou modeling
```

## Run Order

Run the scenarios in this order:

1. fuzzy multi-phase onboarding
2. external API integration
3. external PostgreSQL integration
4. environment-specific deployment
5. mini CRM
6. knowledge memory and later recovery

This order stresses:

- first-turn intake discipline
- family detection
- current-state mutation behavior
- use of the new long-running primitives
- compact-view quality

## Scenario 1: Fuzzy Multi-Phase Onboarding

Expected family:

- `workflow-tracking`

Expected behavior:

- no immediate implementation
- 2 to 4 good clarification questions
- one offered starter prompt
- no `ghostcrab_schema_register` on first turn

Paste:

```text
J'ai besoin d'utiliser GhostCrab pour piloter un projet qui va durer plusieurs phases, avec des tâches, des blocages, des handoffs et probablement des changements de priorités en route.

Je ne sais pas encore quelle structure je veux.
Je veux surtout ne pas perdre le fil au bout de plusieurs sessions.
```

Red flags:

- jumps into schema design immediately
- calls `ghostcrab_status` too early
- writes records before intake is complete
- asks broad or generic questions instead of targeted ones

## Scenario 2: External API Integration

Expected family:

- `integration-operations`

Expected behavior:

- recognizes endpoint, mapping, blockers, evidence, and next step concerns
- asks intake questions before trying to freeze a model
- recommends `integration-health-brief` for compact status

Paste:

```text
Je dois connecter une API partenaire à notre produit.
Il y aura sûrement des problèmes d'auth, du mapping de payload, des endpoints à suivre, des docs externes et plusieurs étapes avant que ce soit fiable.

Je veux que GhostCrab m'aide à garder l'état courant, les preuves utiles et le prochain pas, mais je ne veux pas figer un schéma trop tôt.
```

Red flags:

- invents a canonical schema on turn one
- ignores `ghostcrab:integration-endpoint`, `ghostcrab:source`, or `ghostcrab:note`
- proposes a heavy dashboard instead of a compact operational view

## Scenario 3: External PostgreSQL Integration

Expected family:

- `integration-operations`

Expected behavior:

- recognizes schema observations, connection blockers, and environment context
- avoids premature schema freeze
- recommends a compact recovery view after clarification

Paste:

```text
Je dois brancher une base PostgreSQL externe dans un flux existant.
Je vais devoir retenir ce qu'on observe sur le schéma, les contraintes d'accès, les blocages, les décisions prises et ce qu'il faut faire ensuite.

Je veux quelque chose de durable, mais pas un design rigide dès le départ.
```

Red flags:

- treats the task like a one-shot database answer
- stores observations only as loose notes without a present-state model
- starts proposing enum sets or canonical schemas before intake

## Scenario 4: Environment-Specific Deployment

Expected family:

- `environment-delivery`

Expected behavior:

- detects environment-sensitive rollout work
- asks about target environment, blockers, safety constraints, and rollout stage
- recommends `deployment-brief`

Paste:

```text
Je dois suivre un déploiement dans un environnement spécifique avec des contraintes locales, des validations, des points de blocage et des prochaines étapes sûres.

Je veux pouvoir reprendre plus tard sans relire tout l'historique.
```

Red flags:

- no mention of environment context
- falls back to a generic task list only
- forgets compact rollout recovery

## Scenario 5: Mini CRM

Expected family:

- `crm-pipeline`

Expected behavior:

- identifies opportunities, stages, blocked deals, and next outreach
- keeps the model light
- recommends a compact pipeline-style view

Paste:

```text
J'ai besoin d'un petit suivi commercial dans GhostCrab.
Je veux garder les leads, quelques opportunités, ce qui est bloqué et la prochaine relance utile, sans transformer ça en gros CRM.
```

Red flags:

- over-engineers the domain immediately
- misses blocked opportunities as a first-class concern
- pushes custom schema design before confirming the lightweight need

## Scenario 6: Knowledge Memory And Recovery

This scenario is intentionally two-step.

### 6a. Natural Intake

Expected family:

- `knowledge-base`

Paste:

```text
Je veux utiliser GhostCrab comme mémoire de travail pour un sujet que j'explore sur plusieurs sessions.
Je veux retenir les sources utiles, les notes importantes, les questions ouvertes et ce qu'il faut clarifier ensuite.
```

### 6b. Later Recovery

Expected behavior:

- current-state-first recovery
- then sources and notes
- then `knowledge-snapshot`

Paste later in the same thread or after a pause:

```text
On reprend après une pause.
Relis d'abord l'état courant canonique, puis les sources et notes utiles, puis donne-moi la plus petite vue de reprise utile.

Je veux :
- le sujet actif
- les sources les plus fortes
- les questions ouvertes
- la prochaine clarification utile
```

Red flags:

- jumps straight into raw source dumps
- ignores current state
- returns a bloated recap instead of a compact snapshot

## Lightweight Scoring Grid

Score each run from 0 to 2 on each dimension:

- intent detection
- question quality
- reading discipline
- modeling discipline
- current-state discipline
- recovery quality
- compact-view quality
- anti-pattern avoidance

Quick interpretation:

- `2` = solid and aligned
- `1` = usable with drift
- `0` = clear failure or contract break

## What To Note During Each Run

- Did Codex ask 2 to 4 useful questions or too many?
- Did it delay writes on fuzzy onboarding?
- Did it avoid `ghostcrab_schema_register` on first turn?
- Did it choose the right family?
- Did it keep current state on canonical records?
- Did it suggest the right compact view?
- Did it over-read, over-model, or over-explain?

## Recommended Codex Pass

Minimum pass:

1. run scenario 1
2. run scenarios 2 to 4
3. run either 5 or 6 if time is short
4. write findings immediately after each run

Full pass:

1. run all six scenarios
2. repeat scenario 1 once with a slightly different fuzzy phrasing
3. repeat scenario 6b after a break to test recovery quality

## Notes For Cross-Host Comparison

Keep the prompts identical across hosts as much as possible.

Only adapt:

- skill invocation syntax if needed
- host-specific startup wording

Do not tighten the prompt for Claude Code or OpenClaw just to make them pass. First compare natural behavior, then add stricter rails in a second pass.
