C'est une décision d'architecture de marque, pas juste de nommage. Il y a une réponse nette selon les niveaux de visibilité.

***

## Les 3 Niveaux de Visibilité

```
Niveau 1 — EXTERNE (ce que le monde voit)
  Repos GitHub, npm, DockerHub, docs, landing page
  → GhostCrab partout

Niveau 2 — INTERFACE (ce que le développeur touche)
  Noms des MCP tools, clé mcpServers{}, exemples de code
  → Décision critique : c'est l'API publique

Niveau 3 — INTERNE (ce que la DB voit)
  Tables SQL, fonctions PL/pgSQL, namespaces JSONB
  → Personne ne le voit directement sauf DBA
```

***

## La Recommandation par Niveau

### Niveau 1 — Branding : GhostCrab partout, sans exception

```
github.com/mindflight/ghostcrab
@mindflight/ghostcrab (npm)
mindflight/ghostcrab-postgres (Docker)
ghostcrab.mindflight.io (docs)
mcpServers: { "ghostcrab": { ... } }  ← clé de config
```

### Niveau 2 — MCP Tools : renommer en `ghostcrab_*`

**Pourquoi c'est obligatoire ici.**
Les noms de tools MCP sont l'API publique que l'agent appelle — ils apparaissent dans les logs, les SOUL.md, les README, les articles de blog. Si le produit s'appelle GhostCrab et les tools s'appellent `mfo_search`, il y a une friction cognitive immédiate.

```
mfo_search          → ghostcrab_search
mfo_remember        → ghostcrab_remember
mfo_facets_count    → ghostcrab_count
mfo_pack            → ghostcrab_pack
mfo_status          → ghostcrab_status
mfo_coverage        → ghostcrab_coverage
mfo_traverse        → ghostcrab_traverse
mfo_learn           → ghostcrab_learn
mfo_schema_register → ghostcrab_schema_register
mfo_schema_list     → ghostcrab_schema_list
mfo_schema_inspect  → ghostcrab_schema_inspect
```

La règle de lisibilité : *"Add GhostCrab to your agent — it gives you `ghostcrab_search`, `ghostcrab_pack`, `ghostcrab_learn`"* — cohérent du README jusqu'au log.

### Niveau 3 — SQL interne : garder `mfo_*` pour l'instant

Tables, fonctions PL/pgSQL, namespace JSONB `mfo:schema`, `mfo:system` — **ne pas renommer maintenant**.

Raisons concrètes :
- Personne ne les voit sauf via les tool outputs (où on contrôle ce qu'on expose)
- Migration SQL sur des tables qui contiennent déjà des données = risque élevé pour zéro valeur externe
- `mfo_facets`, `mfo_nodes`, `mfo_edges`, `mfo_projections` restent internes au conteneur
- Si GhostCrab évolue vers une extension PostgreSQL native, le renommage se fera lors du packaging `.so`

Un seul endroit à documenter : *"Internal tables use the `mfo_` prefix — this is an implementation detail, not part of the public API."*

***

## Positionnement dans l'Écosystème MFO

```
MindFlight
├── MFO — MindFlight Orchestrator (le meta-framework)
│   ├── MindBot    ← interface conversationnelle
│   ├── MindCLI    ← CLI orchestration (Golang)
│   └── GhostCrab     ← memory stack PostgreSQL  ← ici
│
└── (futurs composants)
```

**Le degré de parenté à maintenir :** GhostCrab est un **composant de première classe de MFO**, pas un projet satellite. La terminologie juste dans les docs :

```
Standalone:  "GhostCrab — persistent memory for any MCP-compatible agent"
Dans MFO:    "GhostCrab is MFO's memory layer — used natively by MindBot and MindCLI"
```

**Ce que ça implique concrètement :**

| Contexte | Formulation |
|---|---|
| README GhostCrab | "Works standalone or as MFO's memory layer" |
| README MindBot | "MindBot uses GhostCrab for persistent memory" |
| Docs MFO | "GhostCrab — the memory stack" (section dédiée) |
| npm description | "PostgreSQL memory stack for MCP agents — part of the MFO ecosystem" |
| awesome-openclaw-agents | "by MindFlight · part of MFO" |

***

## Ce qui Change dans le Code Existant

Seul le **niveau 2** nécessite un find-and-replace sur les fichiers déjà écrits :

```bash
# Dans mfo-skills/ et mfo-mcp-server/src/tools/registry.ts
# Uniquement dans les noms de tools déclarés et les SKILL.md / CLAUDE.md

find . -name "*.ts" -o -name "*.md" -o -name "*.json" | \
  xargs sed -i \
    -e 's/mfo_search/ghostcrab_search/g' \
    -e 's/mfo_remember/ghostcrab_remember/g' \
    -e 's/mfo_facets_count/ghostcrab_count/g' \
    -e 's/mfo_pack/ghostcrab_pack/g' \
    -e 's/mfo_status/ghostcrab_status/g' \
    -e 's/mfo_coverage/ghostcrab_coverage/g' \
    -e 's/mfo_traverse/ghostcrab_traverse/g' \
    -e 's/mfo_learn/ghostcrab_learn/g' \
    -e 's/mfo_schema_/ghostcrab_schema_/g' \
    -e 's/"mfo-memory"/"ghostcrab"/g'

# Ne PAS toucher :
# - mfo_facets, mfo_nodes, mfo_edges, mfo_projections (tables SQL)
# - mfo_search_hybrid, mfo_count_by, mfo_traverse, mfo_pack_context (fonctions PL/pgSQL)
# - mfo:schema, mfo:system, mfo:ontology (namespaces JSONB)
```

Un commit, un PR, cinq minutes. Aucune migration SQL, aucun changement de schema.

***

## La Règle Simple à Retenir

> **Ce que l'agent appelle = GhostCrab.**
> **Ce que PostgreSQL stocke = mfo_ (interne, invisible).**
> **Ce que MFO orchestre = GhostCrab comme composant nommé.**