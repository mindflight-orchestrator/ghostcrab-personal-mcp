Non. Trois projets c'est trop de friction pour ce qui est essentiellement **un seul artefact livrable avec des surfaces de distribution différentes** — le produit s’appelle **GhostCrab** (npm `@mindflight/ghostcrab`, image `mindflight/ghostcrab-postgres`). Voir [renommage_strata.md](./renommage_strata.md).

***

## La Bonne Découpe : 2 Repos

```
ghostcrab/          ← Repo 1 — le produit
ghostcrab-skills/              ← Repo 2 — les intégrations
```

***

## Pourquoi pas 3

Le MCP server est **indépendant du client**. Claude Code et OpenClaw consomment les mêmes tools via le même protocole. Séparer les skills Claude Code et OpenClaw dans des repos distincts crée de la duplication sans valeur : les schémas JSONB, les règles de design, les patterns applicatifs sont identiques. Seul le **format d'intégration** diffère.

***

## Repo 1 — `ghostcrab`

Le seul code qui compile et se déploie.

```
ghostcrab/
├── src/
│   ├── index.ts
│   ├── db/
│   ├── tools/
│   │   ├── facets/
│   │   ├── dgraph/
│   │   └── pragma/
│   ├── bootstrap/
│   └── types/
├── docker/
├── tests/
├── package.json
└── README.md
```

**Ce repo ne contient aucun fichier spécifique à Claude Code ou OpenClaw.** Il expose des tools MCP. C'est tout. Il est publié sur npm (`@mindflight/ghostcrab`) et DockerHub (`mindflight/ghostcrab-postgres`).

***

## Repo 2 — `ghostcrab-skills`

Zéro code. Uniquement des fichiers de configuration et de documentation. Organisé par client.

```
ghostcrab-skills/
│
├── claude-code/
│   ├── self-memory/
│   │   ├── CLAUDE.md              ← fragment à coller
│   │   ├── .mcp.json
│   │   └── .claude/settings.json  ← hooks natifs
│   │
│   └── data-architect/
│       ├── CLAUDE.md              ← fragment data-architect
│       ├── SCHEMA_DESIGN_PROJECT.md
│       ├── templates/
│       │   ├── domain.schema.json
│       │   ├── migration.sql.tpl
│       │   └── types.ts.tpl
│       └── examples/
│           ├── project-management/
│           ├── crm/
│           └── knowledge-base/
│
├── openclaw/
│   ├── ghostcrab-memory/             ← le skill plug-in (clé MCP `ghostcrab`)
│   │   ├── mcp.json
│   │   ├── SKILL.md
│   │   ├── SCHEMA_DESIGN.md
│   │   ├── QUERY_PATTERNS.md
│   │   ├── APP_PATTERNS.md
│   │   └── README.md
│   │
│   └── ghostcrab-epistemic-agent/    ← le profil agent complet (optionnel)
│       ├── SOUL.md
│       ├── AGENTS.md
│       ├── HEARTBEAT.md
│       ├── WORKING.md
│       └── README.md
│
├── shared/
│   ├── SCHEMA_DESIGN.md           ← règles communes aux deux clients
│   ├── QUERY_PATTERNS.md
│   └── bootstrap_seed.jsonl       ← données seed communes
│
└── README.md
```

***

## Les Dépendances

```
ghostcrab        ←── npm/DockerHub
      ↑
      │  (consomme via .mcp.json)
      │
ghostcrab-skills ──── claude-code/self-memory
           ──── claude-code/data-architect
           ──── openclaw/ghostcrab-memory
```

**`ghostcrab-skills` ne dépend de `ghostcrab` que pour la config de connexion** — une seule ligne `DATABASE_URL` dans `.mcp.json`. Aucun import de code.

***

## Ce qui va dans `shared/`

Tout ce qui est **identique** entre Claude Code et OpenClaw :

| Fichier | Pourquoi shared |
|---|---|
| `SCHEMA_DESIGN.md` | Les 5 questions de design sont indépendantes du client |
| `QUERY_PATTERNS.md` | Les 3 niveaux de lecture sont identiques |
| `bootstrap_seed.jsonl` | Les entrées `mfo:system` sont les mêmes |

Les fichiers `shared/` sont **symlinkés ou copiés** dans les dossiers client au moment de la release — pas dupliqués dans le repo.

***

## La Question de Claude Code self-memory vs data-architect

Ce sont deux **fragments CLAUDE.md** dans le même dossier, pas deux projets séparés. Un projet Claude Code peut activer l'un, l'autre, ou les deux :

```bash
# Self-memory only
cat claude-code/self-memory/CLAUDE.md >> my-project/CLAUDE.md

# Data-architect only
cat claude-code/data-architect/CLAUDE.md >> my-project/CLAUDE.md

# Both
cat claude-code/self-memory/CLAUDE.md \
    claude-code/data-architect/CLAUDE.md >> my-project/CLAUDE.md
```

Ils partagent le même `.mcp.json` et le même `settings.json`. La séparation en sous-dossiers dans `ghostcrab-skills` est **éditoriale**, pas architecturale.

***

## Séquence de Développement

```
Semaine 1-2   ghostcrab           MR1 (Foundation) + MR2 (facets)
Semaine 3     ghostcrab           MR3 (dgraph) + MR4 (pragma)
Semaine 3     ghostcrab-skills    openclaw/ghostcrab-memory — teste contre le server
Semaine 4     ghostcrab           MR5 (bootstrap) + MR6 (docker)
Semaine 4     ghostcrab-skills    claude-code/self-memory
Semaine 5     ghostcrab-skills    claude-code/data-architect + examples/
Semaine 5     ghostcrab-skills    openclaw/ghostcrab-epistemic-agent (optionnel)
```

`ghostcrab-skills` commence dès que MR2 est mergé — les skills peuvent être testés sans que le server soit complet.

***

## En Résumé

| Décision | Raison |
|---|---|
| **1 repo server** | Le code est client-agnostic — 1 seul artefact npm/Docker |
| **1 repo skills** | Les intégrations sont des fichiers texte — pas de build, pas de deploy |
| **self-memory + data-architect = fragments, pas projets** | Même `.mcp.json`, même infrastructure, activation additive |
| **shared/ pour le commun** | Évite la duplication des règles de design entre clients |
| **OpenClaw = 2 niveaux** | `ghostcrab-memory` (plug-in) et `ghostcrab-epistemic-agent` (profil complet) ont des audiences différentes |