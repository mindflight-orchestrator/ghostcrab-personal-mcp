<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Quelles sont les possibilités offertes pour créer un plugin pour Codex ? Ils viennent récemment d'activer la fonctionnalité en proposant une liste de différents plugins. Explique-moi quelle serait l'avantage de créer un plugin pour MindBrain. Versonn Postgres. Et version SQLite. Plutôt que d'utiliser des skills Codex.

Voici une analyse complète de la situation.

## Le système de plugins Codex — état actuel

Codex (OpenAI) a introduit les plugins en version 0.117.0 fin mars 2026, puis a lancé 6 plugins "role-specific" supplémentaires début juin 2026 [^1_1]. Un plugin est un **bundle installable** qui regroupe trois composants : des Skills (instructions markdown réutilisables), des Apps (connecteurs OAuth vers des services tiers), et des MCP servers (accès à des outils externes) [^1_2].

## Comment créer un plugin Codex

La structure minimale d'un plugin est :

```
my-plugin/
├── .codex-plugin/
│   └── plugin.json        ← manifest obligatoire
├── skills/
│   └── my-skill/
│       └── SKILL.md       ← instructions de la skill
├── .mcp.json              ← config MCP servers (optionnel)
├── .app.json              ← connecteurs OAuth (optionnel)
└── hooks/
    └── hooks.json         ← lifecycle hooks (optionnel)
```


### Trois façons de créer un plugin [^1_3]

1. **Via `@plugin-creator`** — skill intégrée qui scaffolde automatiquement le `plugin.json` et génère une entrée marketplace locale pour les tests
2. **Manuellement** — créer le dossier `.codex-plugin/plugin.json`, les skills en Markdown, puis le brancher à un marketplace JSON
3. **Via CLI** — `codex plugin marketplace add owner/repo` pour ajouter un marketplace depuis un repo GitHub ou un chemin local

### Distribution

Les plugins s'exposent via un fichier `marketplace.json`, scoped soit au repo (`$REPO_ROOT/.agents/plugins/marketplace.json`) soit à l'utilisateur (`~/.agents/plugins/marketplace.json`) [^1_3]. La publication dans le répertoire officiel OpenAI n'est **pas encore ouverte** en self-serve [^1_4].

***

## Plugin vs Skills — la différence clé

| Dimension | Skill standalone | Plugin |
| :-- | :-- | :-- |
| Scope | Local au projet ou à l'utilisateur | Portable, versionné, distribuable |
| Contenu | Un fichier `SKILL.md` | Skills + MCP servers + App connectors + hooks |
| Distribution | Copie manuelle de fichiers | Marketplace JSON, partage workspace, futur répertoire public |
| Versioning | Aucun | `version` dans le manifest, support de `ref`/`sha` Git |
| Lifecycle hooks | Non | Oui (`SessionStart`, etc.) |
| Partage équipe | Non natif | `Share` depuis l'UI Codex, policy `INSTALLED_BY_DEFAULT` |

En résumé : une Skill est un bout d'instruction markdown, un Plugin est la **couche de packaging et distribution** autour de cette instruction [^1_5].

***

## Avantage de créer un plugin MindBrain pour Codex

### Version PostgreSQL

Le cas d'usage central serait de **bundler le MCP server de MindBrain** (GhostCrab MCP) directement dans le plugin. Un utilisateur installe le plugin → le `.mcp.json` configure automatiquement la connexion au serveur MCP, avec les tools de `pg_dgraph`, `pg_facets`, `pg_pragma` disponibles sans configuration manuelle [^1_3]. Les skills embarquées définiraient les workflows spécifiques : comment interroger le semantic graph, comment utiliser les pragma, comment structurer les requêtes via mindCLI. L'avantage sur une skill seule est que **le MCP server est provisionné avec le plugin** — zéro friction d'onboarding pour un collègue ou un client.

### Version SQLite

Un plugin SQLite serait une version **embedded et sans dépendance serveur** : le MCP server bundle utiliserait un driver SQLite local, les skills décrivent le schéma MindBrain adapté à SQLite, et le tout s'installe sans `pg_*` extensions ni connexion réseau [^1_2]. Cela ouvre MindBrain à des contextes où PostgreSQL n'est pas disponible — laptop offline, CI, tests unitaires — tout en gardant la même surface sémantique pour l'agent Codex.

### Ce que le plugin apporte que les skills seules ne font pas

- **MCP bundlé** : les tools sont enregistrés automatiquement à l'installation, pas besoin de configurer manuellement `~/.codex/config.toml` pour chaque MCP server
- **Lifecycle hooks** : un hook `SessionStart` peut initialiser le contexte MindBrain (connexion, chargement du schéma, vérification des extensions), ce qui est impossible avec une skill seule
- **Versioning explicite** : `"version": "0.2.0"` dans le manifest permet de gérer les migrations de schéma ou de comportement entre versions du plugin
- **Distribution unifiée** : un seul `codex plugin marketplace add francois/mindbrain-plugin` configure l'intégralité de l'environnement pour un nouveau membre d'équipe ou pour un client pilote, contre une documentation manuelle d'installation pour les skills

La limite actuelle : le répertoire public OpenAI n'est pas encore ouvert [^1_4], donc la distribution se fait via un repo GitHub public ou privé — ce qui est déjà suffisant pour un usage équipe ou en early access.
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://www.reworked.co/digital-workplace/openai-adds-plugins-to-codex/

[^1_2]: https://developers.openai.com/codex/plugins

[^1_3]: https://developers.openai.com/codex/plugins/build

[^1_4]: https://www.infoworld.com/article/4151214/openai-adds-plugin-system-to-codex-to-help-enterprises-govern-ai-coding-agents.html

[^1_5]: https://www.reddit.com/r/codex/comments/1s517gl/codex_v01170_now_supports_plugins_heres_a_simple/

[^1_6]: https://github.com/hashgraph-online/awesome-codex-plugins

[^1_7]: https://getpushtoprod.substack.com/p/complete-beginners-guide-to-openais

[^1_8]: https://blog.jetbrains.com/ai/2026/01/codex-in-jetbrains-ides/

[^1_9]: https://www.youtube.com/watch?v=bZ-5CfD2LRU

[^1_10]: https://docs.codex.io

[^1_11]: https://openai.com/index/codex-for-almost-everything/

[^1_12]: https://openai.com/academy/codex-plugins-and-skills/

[^1_13]: https://www.youtube.com/watch?v=1fv6sFaaFgk\&vl=fr

[^1_14]: https://xairouter.com/en/blog/codex-plugins-guide/

[^1_15]: https://vladimirsiedykh.com/blog/codex-vscode-install-permissions-2025


---

# Est-ce qu'il existe une solution similaire au plugin ? Pour l'environnement Claude Code.

Oui, Claude Code dispose d'un **système de plugins identique à Codex** — et en réalité plus riche sur certains aspects, notamment les hooks.

## Système de plugins Claude Code

Claude Code partage exactement la même architecture de plugins que Codex : même format `plugin.json`, même structure de dossiers `.codex-plugin/` / `.claude/plugins/`, skills en Markdown, MCP servers bundlés, et lifecycle hooks [^2_1]. Les CLAUDE.md, settings et MCP servers sont partagés entre toutes les surfaces (Terminal, VS Code, JetBrains, Desktop, Web) [^2_1].

```
my-plugin/
├── .codex-plugin/plugin.json
├── skills/mindbrain/SKILL.md
├── .mcp.json
└── hooks/hooks.json
```

La commande d'installation est la même syntaxe :

```bash
claude plugin marketplace add francois/mindbrain-plugin
claude plugin install mindbrain-postgres@mindbrain-marketplace
```


## Hooks — avantage majeur de Claude Code sur Codex

C'est là que Claude Code est **significativement plus puissant**. Le système de hooks expose plus de 25 événements de cycle de vie distincts [^2_2] :


| Événement | Utilité pour MindBrain |
| :-- | :-- |
| `SessionStart` | Initialiser la connexion PG, charger le schéma, vérifier `pg_facets` |
| `PreToolUse` | Intercepter les appels MCP avant exécution (validation, logging) |
| `PostToolUse` | Logger les requêtes après exécution dans une table d'audit |
| `InstructionsLoaded` | Réagir au chargement d'un CLAUDE.md spécifique au projet |
| `FileChanged` | Détecter les changements de `.mcp.json` ou migrations SQL |
| `SubagentStart/Stop` | Contexte MindBrain partagé entre sous-agents |
| `PreCompact` | Sauvegarder l'état de session dans la DB avant compaction du contexte |

Les hooks acceptent cinq types de handlers : `command` (shell script), `http` (POST vers un endpoint), `mcp_tool` (appel direct d'un tool MCP), `prompt` (évaluation LLM), et `agent` (sous-agent avec accès outils) [^2_2]. Ce dernier type est absent de Codex.

## Avantage concret du plugin MindBrain pour Claude Code

Le hook `mcp_tool` est particulièrement pertinent : plutôt qu'un shell script qui appelle GhostCrab MCP, tu peux appeler directement un tool MCP depuis le hook, sans processus intermédiaire [^2_2]. Exemple pour logger chaque écriture de fichier dans le graphe sémantique :

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "mcp_tool",
        "server": "mindbrain",
        "tool": "pg_dgraph__log_file_change",
        "input": { "path": "${tool_input.path}" }
      }]
    }]
  }
}
```

Le hook `PreCompact` est utilisable pour persister l'état de la session dans PostgreSQL avant qu'un compactage de contexte n'efface les informations en cours — ce qui est exactement le problème de mémoire à long terme que MindBrain adresse [^2_2].

## Distribution

La politique `enabledPlugins` dans les managed settings permet à un administrateur d'organisation de forcer l'installation du plugin sur tous les postes de l'équipe, avec les hooks associés exemptés des restrictions `allowManagedHooksOnly` [^2_2]. C'est le vecteur de déploiement enterprise naturel pour MindBrain.
<span style="display:none">[^2_10][^2_11][^2_12][^2_13][^2_14][^2_15][^2_3][^2_4][^2_5][^2_6][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://code.claude.com/docs/en/overview

[^2_2]: https://code.claude.com/docs/en/hooks

[^2_3]: https://www.youtube.com/watch?v=YcX4VcGBIiU

[^2_4]: https://www.morphllm.com/comparisons/claude-code-alternatives

[^2_5]: https://buildtolaunch.substack.com/p/best-claude-code-plugins-tested-review

[^2_6]: https://dev.to/chand1012/the-best-way-to-do-agentic-development-in-2026-14mn

[^2_7]: https://composio.dev/content/top-claude-code-plugins

[^2_8]: https://www.reddit.com/r/ClaudeAI/comments/1qcwckg/the_complete_guide_to_claude_code_v2_claudemd_mcp/

[^2_9]: https://www.boster.tech/en/blog/claude-4-anthropic-nouveautes-2026

[^2_10]: https://www.reddit.com/r/ClaudeAI/comments/1r4tk3u/there_are_28_official_claude_code_plugins_most/

[^2_11]: https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously

[^2_12]: https://blakecrosley.com/blog/codex-vs-claude-code-2026

[^2_13]: https://www.youtube.com/watch?v=5n53H1JVWU0

[^2_14]: https://www.verdent.ai/fr/guides/claude-code-alternatives-2026

[^2_15]: https://code.claude.com/docs/en/hooks-guide


---

# J'ai une série de skills. Comme le ghostcrab- Data- Architect Qui permettent à un agent de discuter avec le MCP serveur ghostcrab. pour modéliser une ontologie. On remarque effectivement, suivant les versions, des difficultés pour l'agent de suivre les instructions du skills. Est-ce qu'un plugin faciliterait ce travail ? Et idem pour convertir une requête en langage naturel. Pour que l'agent sache comment appeler MindBrain. En découpant l'intention de la requête utilisateur en liste de facettes. Et de facts, ou bien même simplement en essayant de chercher une liste de projections aka des recherches déjà préparées.

La question est centrale et la documentation officielle d'Anthropic vient d'apporter des éléments très précis. Voici l'analyse.

## Le vrai problème : trigger reliability des Skills

Le problème que tu observes avec `ghostcrab-data-architect` est documenté et structurel : une Skill standalone est du **prompt injection probabiliste**. À l'exécution, seul le `name` et la `description` YAML sont pré-chargés dans le system prompt ; Claude décide ensuite de manière probabiliste si la Skill est pertinente pour charger son contenu complet [^3_1]. En session longue, la recency bias et l'instruction drift aggravent cela — les instructions du début de session se font écraser par le contenu récent (code, outputs d'outils) [^3_2].

Un test brutal documenté : 20 prompts qui devraient évidemment déclencher une Skill → **taux de trigger : 0** [^3_3].

***

## Ce qu'un Plugin résout concrètement

### 1. Chargement déterministe via `SessionStart` hook

Le hook `SessionStart` d'un plugin injecte le contexte **en tant que message de conversation**, pas comme un fichier lu optionnellement. Claude ne peut pas le déprioritiser [^3_2]. La différence :

```
CLAUDE.md / Skill standalone → texte de fichier → peut être ignoré
Hook SessionStart → message injecté → traité comme un input utilisateur
```

Pour `ghostcrab-data-architect`, ça signifie que les règles de modélisation ontologique arrivent dans la fenêtre de contexte **avant tout raisonnement**, à chaque session, sans exception.

### 2. Injection ciblée sur les tools MCP via `PreToolUse`

Plutôt qu'injecter toutes les instructions en bloc au démarrage (mauvaise pratique, max 200-500 tokens [^3_2]), tu injectes le contexte **précisément au moment où l'agent va appeler un tool GhostCrab** :

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "ghostcrab__.*",
      "hooks": [{
        "type": "command",
        "command": "cat ~/.claude/hooks/mindbrain-ontology-rules.md"
      }]
    }]
  }
}
```

Les règles de modélisation ne chargent que quand l'agent s'apprête à appeler GhostCrab — zéro token gaspillé le reste du temps [^3_4].

### 3. MCP server bundlé = surface d'outils déclarée

Un plugin avec `.mcp.json` enregistre GhostCrab MCP automatiquement à l'installation. La Skill peut alors référencer les tools avec leur nom **pleinement qualifié** (`ghostcrab:create_entity`, `ghostcrab:query_facets`) — une bonne pratique documentée explicitement pour éviter les "tool not found" quand plusieurs MCP servers coexistent [^3_1].

***

## Architecture recommandée pour tes deux cas d'usage

### Cas 1 : Modélisation ontologique (`ghostcrab-data-architect`)

Le pattern **progressive disclosure** est exactement adapté ici [^3_1] :

```
mindbrain-ontology/
├── SKILL.md                    ← navigation + règles critiques (~200 lignes max)
├── reference/
│   ├── entity-types.md         ← chargé seulement si entités en jeu
│   ├── relation-patterns.md    ← chargé seulement si relations en jeu
│   └── pg_dgraph-tools.md      ← tools GhostCrab avec noms qualifiés
├── scripts/
│   └── validate-ontology.sh    ← validation exécutée, pas chargée dans contexte
└── hooks/hooks.json            ← PreToolUse sur ghostcrab::*
```

Claude charge `SKILL.md`, voit les références, puis lit **seulement** le fichier pertinent à la sous-tâche en cours. En session longue, le hook `PreToolUse` rappelle les contraintes juste avant chaque appel MCP — c'est le feedback loop documenté [^3_1].

### Cas 2 : NL → facettes / facts / projections (requête naturelle vers MindBrain)

Ce cas est différent : il ne s'agit pas de "bien exécuter une tâche connue" mais de **décomposer une intention ambiguë**. La structure recommandée est un workflow conditionnel [^3_1] :

```markdown
## NL Query Resolution — MindBrain

Determine the user's intent:

**Clear entity query** → load [reference/facets-decomposition.md]
**Aggregation/report** → load [reference/projections-catalog.md]
**Unknown intent** → fallback: list available projections via ghostcrab:list_projections

Resolution priority:
1. Check existing projections (ghostcrab:list_projections) — cheapest
2. Decompose in facets + facts if no projection matches
3. Build ad-hoc query only as last resort
```

L'avantage clé : le catalogue de projections préparées est dans `reference/projections-catalog.md`, qui n'est **jamais chargé par défaut** — seulement quand l'agent détecte une requête ambiguë. Ça évite de polluer le contexte avec le catalogue entier à chaque interaction [^3_1].

***

## Ce que le plugin n'améliore pas

La documentation Anthropic est claire sur un point : **les Skills restent probabilistes pour leur déclenchement initial** [^3_3]. Un plugin améliore la fiabilité d'exécution une fois la Skill activée, et les hooks garantissent le contexte aux moments critiques — mais si l'agent ne charge pas la Skill du tout au départ, le problème persiste. La solution à ça reste soit l'invocation explicite (`/ghostcrab-data-architect`), soit un hook `UserPromptSubmit` qui scanne le prompt et force le chargement de la Skill adéquate [^3_5].
<span style="display:none">[^3_10][^3_11][^3_12][^3_13][^3_14][^3_15][^3_6][^3_7][^3_8][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

[^3_2]: https://www.mindstudio.ai/blog/session-start-hooks-claude-code-force-context/

[^3_3]: https://corpwaters.substack.com/p/the-ultimate-guide-to-claude-code

[^3_4]: https://mcpservers.org/agent-skills/anthropic/hook-development

[^3_5]: https://www.reddit.com/r/codex/comments/1p6lzqg/autoload_skills_with_userpromptsubmit_hook_in/

[^3_6]: https://news.ycombinator.com/item?id=45607117

[^3_7]: https://www.youtube.com/watch?v=eRS3CmvrOvA\&vl=fr

[^3_8]: https://www.reddit.com/r/claude/comments/1s51b5u/the_claude_code_skills_actually_worth_installing/

[^3_9]: https://dev.to/suraj_khaitan_f893c243958/i-tried-100-claude-skills-these-are-the-best-1m4a

[^3_10]: https://github.com/jeremylongshore/claude-code-plugins-plus-skills

[^3_11]: https://www.youngleaders.tech/p/claude-skills-commands-subagents-plugins

[^3_12]: https://github.com/mksglu/context-mode

[^3_13]: https://code.claude.com/docs/en/skills

[^3_14]: https://developers.openai.com/codex/hooks

[^3_15]: https://code.claude.com/docs/en/features-overview

