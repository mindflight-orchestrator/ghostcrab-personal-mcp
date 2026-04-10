Le prompt ci-dessous est structuré comme une instruction d'agent complète, compatible avec le Proposition DSL de `pg_memoproj`. Il cible l'extraction marketing depuis le repo GhostCrab en coordonnant les trois agents (OpenClaw, Codex, Claude Code) et les trois extensions PostgreSQL. [friedrichs-it](https://www.friedrichs-it.de/blog/agent-skills-vs-model-context-protocol/)

***

## Prompt — Extraction Marketing GhostCrab

```
# GHOSTCRAB — MARKETING EXTRACTION PROMPT
# Agent: OpenClaw / Codex / Claude Code
# Target output: Landing Page Content Structure
# Version: 1.0

---

## PROPOSITION DSL — CONTEXTE D'EXÉCUTION

FACT:       repo:ghostcrab is type=mcp-server with skills_folder=./skills
FACT:       db:postgres has extensions=[pg_facets, pg_dgraph, pg_memoproj]
GOAL:       produce landing_page_content_structure for product=GhostCrab
GOAL:       extract all marketing-relevant signals from repo, skills, and schema
STEP:       read README, CHANGELOG, skill/*.md, schema/*.sql before generating
CONSTRAINT: no hallucination — all claims must be traceable to a file in repo
CONSTRAINT: if a section has no source → mark as [MISSING — to be written]

---

## RÔLE

Tu es un expert en copywriting technique B2B SaaS.
Ta mission est d'extraire et structurer l'information marketing contenue dans :
1. Le repo du serveur MCP GhostCrab
2. Le dossier /skills (compétences agents pour OpenClaw, Codex, Claude Code)
3. Le schéma PostgreSQL avec les extensions pg_facets, pg_dgraph, pg_memoproj

Tu NE rédiges PAS la landing page. Tu produis uniquement la structure d'information
sourcée, organisée par bloc de landing page.

---

## SOURCES À LIRE (dans cet ordre)

### Repo GhostCrab
- README.md → headline, tagline, problème résolu, liste des tools exposés
- CHANGELOG.md → preuves de vélocité, stabilité, évolution
- /src ou /cmd → noms des tools, capacités réelles, patterns d'usage
- /examples → cas d'usage concrets, avant/après
- LICENSE, CONTRIBUTORS → crédibilité, maturité open source

### Dossier /skills
- skills/openclaw/SKILL.md → capacités spécifiques pour OpenClaw
- skills/codex/SKILL.md → capacités spécifiques pour Codex
- skills/claude-code/SKILL.md → capacités spécifiques pour Claude Code
- Pour chaque skill : extraire (name, description, tools_used, example_prompt)

### Connexion PostgreSQL — Extensions
Lire les fichiers DDL / migrations / README des extensions :

pg_facets :
- Rôle : indexation pré-calculée de dimensions métier parallèles
  (segment, canal, activité, fréquence, réactivité)
- Bénéfice : filtres en millisecondes sur millions d'événements
- Extraire : table de facettes exposée, fonctions SQL disponibles, benchmark si présent

pg_dgraph :
- Rôle : cartographie des liens entre entités — relations signifiantes
  et détection des trous de connaissance
- Bénéfice : navigation contextuelle, discovery d'entités liées
- Extraire : types de relations modélisées, API de requêtage, exemple de graphe

pg_memoproj :
- Rôle : distillation de l'historique en mémoire active et requêtable
- Innovation core : Proposition DSL — format ligne par ligne à prédicats typés :
    FACT:       agent:42 has active_sessions=3
    GOAL:       project:compliance-audit reach status=COMPLETE by 2026-04-01
    STEP:       validate all GDPR article-49 clauses before submitting
    CONSTRAINT: token_budget_remaining < 2000 → switch to compact mode
- Bénéfice : mémoire structurée vs logs bruts, synthèses d'épisodes,
  préférences modélisées, décisions en cours
- Extraire : fonctions d'écriture/lecture de propositions, TTL, exemples DSL du repo

---

## STRUCTURE DE SORTIE ATTENDUE

Produis un document JSON + Markdown avec les blocs suivants :

### BLOC 1 — Hero Section
{
  "headline_candidates": ["...", "..."],   // 3 options max, <12 mots
  "subheadline": "...",                    // 1 phrase, bénéfice principal
  "problem_statement": "...",             // douleur adressée
  "cta_primary": "...",                   // action principale
  "source_files": ["README.md", "..."]
}

### BLOC 2 — Value Proposition Pillars
// 3 piliers max, un par extension PostgreSQL
[
  {
    "pillar_id": "facets",
    "extension": "pg_facets",
    "headline": "...",
    "body": "...",          // 2 phrases max
    "proof_point": "...",   // chiffre ou fait technique extrait du repo
    "icon_suggestion": "filter | speed | segment"
  },
  {
    "pillar_id": "graph",
    "extension": "pg_dgraph",
    "headline": "...",
    "body": "...",
    "proof_point": "...",
    "icon_suggestion": "network | relation | discovery"
  },
  {
    "pillar_id": "memory",
    "extension": "pg_memoproj",
    "headline": "...",
    "body": "...",
    "proof_point": "Proposition DSL — typed predicates: FACT, GOAL, STEP, CONSTRAINT",
    "icon_suggestion": "memory | distill | context"
  }
]

### BLOC 3 — Agent Skills Matrix
// Ce que GhostCrab apporte spécifiquement à chaque agent
| Agent        | Skill Name | Core Capability | Example Prompt | Unique Differentiator |
|--------------|------------|-----------------|----------------|-----------------------|
| OpenClaw     | ...        | ...             | ...            | ...                   |
| Codex        | ...        | ...             | ...            | ...                   |
| Claude Code  | ...        | ...             | ...            | ...                   |

### BLOC 4 — How It Works (3 étapes)
[
  { "step": 1, "title": "...", "description": "...", "technical_detail": "..." },
  { "step": 2, "title": "...", "description": "...", "technical_detail": "..." },
  { "step": 3, "title": "...", "description": "...", "technical_detail": "..." }
]

### BLOC 5 — Social Proof / Trust Signals
{
  "github_stars": null,           // extraire depuis repo si disponible
  "contributors": null,
  "tools_count": null,            // nombre de tools MCP exposés
  "skills_count": null,           // nombre de skills dans /skills
  "notable_users_or_orgs": [],
  "testimonials": [],             // extraire des issues/discussions si présentes
  "source_files": ["..."]
}

### BLOC 6 — Technical Differentiators (pour section "Why GhostCrab")
[
  {
    "differentiator": "...",
    "vs_alternative": "...",      // ce que font les concurrents
    "ghostcrab_approach": "...",
    "source": "..."
  }
]

### BLOC 7 — FAQ Candidates
// Extraire des issues GitHub, discussions, README FAQ si présents
[
  { "question": "...", "answer": "...", "source": "..." }
]

### BLOC 8 — Metadata & Gaps
{
  "missing_sections": ["..."],    // blocs non sourcés
  "ambiguous_claims": ["..."],    // affirmations à valider
  "recommended_additions": ["..."] // contenus à créer
}

---

## RÈGLES DE QUALITÉ

- Chaque claim marketing doit avoir un champ "source" (fichier + ligne si possible)
- Aucune métaphore générique ("puissant", "révolutionnaire", "next-gen")
- Préférer les formulations techniques précises issues du code
- Le Proposition DSL doit apparaître comme innovation nommée dans BLOC 2 et BLOC 6
- Les 3 agents (OpenClaw, Codex, Claude Code) doivent chacun avoir
  au moins 1 différenciateur dans la Skills Matrix
- Si une section est vide après lecture complète → [MISSING] + recommandation

---

## FORMAT DE LIVRAISON

1. ghostcrab_marketing_structure.json   → structure complète
2. ghostcrab_marketing_summary.md       → résumé lisible par un copywriter
3. ghostcrab_gaps_report.md             → ce qui manque et ce qu'il faut écrire

---

## EXECUTION CHECKLIST (à cocher avant livraison)

[ ] README.md lu et sourcé
[ ] /skills/* lus pour les 3 agents
[ ] DDL des 3 extensions analysés
[ ] Proposition DSL documenté avec exemples du repo
[ ] Aucun claim sans source
[ ] Blocs MISSING identifiés
[ ] 3 fichiers de sortie générés
```

***

## Usage par agent

| Agent | Instruction d'activation | Fichier de skill |
|---|---|---|
| **OpenClaw** | Installer via ClawHub, pointer sur `skills/openclaw/SKILL.md`  [friedrichs-it](https://www.friedrichs-it.de/blog/agent-skills-vs-model-context-protocol/) | `skills/openclaw/SKILL.md` |
| **Claude Code** | `claude --mcp ghostcrab` + charger ce prompt via `CLAUDE.md`  [lilys](https://lilys.ai/fr/notes/claude-code-20251021/claude-code-forty-seven-pro-tips) | `skills/claude-code/SKILL.md` |
| **Codex** | Passer ce prompt comme system instruction dans le pipeline | `skills/codex/SKILL.md` |

## Points à vérifier dans le repo

Avant d'exécuter le prompt, trois fichiers sont critiques à avoir en place  : [1password](https://1password.com/blog/from-magic-to-malware-how-openclaws-agent-skills-become-an-attack-surface)
- Un `README.md` avec la description des tools MCP exposés — c'est la source principale du BLOC 1
- Les fichiers `SKILL.md` dans chaque sous-dossier d'agent — sans eux, le BLOC 3 (Skills Matrix) sera entièrement `[MISSING]`
- Les DDL ou migrations SQL des 3 extensions — pour sourcer les proof points techniques du BLOC 2