La question centrale est claire : **comment réduire le chemin de première valeur à zéro**. Voici l'analyse structurée, puis les recommandations concrètes.

***

## Ce que révèle le contexte OpenClaw

OpenClaw est construit sur une architecture de **skills modulaires**  [tencentcloud](https://www.tencentcloud.com/techpedia/140791) — des paquets de capacité composables, plug-and-play, que l'utilisateur empile pour construire ses agents. Il est model-agnostic, tourne localement, et son écosystème de distribution dominant est un fichier `SOUL.md` par template  [github](https://github.com/mergisi/awesome-openclaw-agents). 177 templates production-ready existent déjà, copiables en une commande  [github](https://github.com/mergisi/awesome-openclaw-agents). C'est exactement la surface d'entrée que les trois extensions doivent cibler.

Le vrai insight : **les extensions sont de la SQL**. N'importe quel client PostgreSQL peut les appeler. L'obstacle n'est pas technique — il est de packaging et de narration.

***

## Les Quatre Vecteurs de Distribution Immédiate

### 1. MCP Server — Le Vecteur Zéro-Friction

Le pattern est déjà établi : `pgedge-postgres-mcp`, `improvado-mcp`  [pgedge](https://www.pgedge.com/blog/how-to-use-the-pgedge-mcp-server-for-postgresql-with-claude-cowork) prouvent qu'une connexion PostgreSQL exposée via MCP devient utilisable directement depuis Claude Desktop, OpenClaw, ou n'importe quel agent MCP-compatible — **sans installer quoi que ce soit d'autre**.

Un MCP server `mfo-postgres-mcp` qui expose les trois extensions comme tools :

```
ghostcrab_search(query, filters)          → retrieval
ghostcrab_coverage(domain, agent_id)      → self-model query
ghostcrab_pack(query, agent_id)           → working memory pack
```

L'agent OpenClaw appelle ces tools comme il appelle n'importe quel MCP tool. Il n'a jamais besoin de savoir que PG_FACETS existe. Il appelle `ghostcrab_search` et reçoit des documents. C'est tout.

**Coût de mise en place pour l'utilisateur :** ajouter 4 lignes dans `mcp_config.json`. Rien d'autre.

***

### 2. Docker One-Liner — Zéro Compilation

Le blocage le plus fréquent pour les extensions PostgreSQL est la compilation et l'installation. La réponse directe :

```bash
docker run -p 5432:5432 mindflight/ghostcrab-postgres
```

Une image Docker avec PostgreSQL + pg_facets + pg_dgraph + pg_pragma préinstallés et préconfigurés. L'utilisateur a une instance opérationnelle en 30 secondes. Pas de `make install`. Pas de headers C. Pas de dépendances.

Complémenté par un `docker-compose.yml` avec trois services : postgres (avec les extensions), un MCP server, et un exemple d'agent OpenClaw qui se connecte — **le tout fonctionnel hors de la boîte**.

***

### 3. OpenClaw Skills — Le Vecteur de Distribution Virale

OpenClaw distribue ses templates via `SOUL.md` copiables  [github](https://github.com/mergisi/awesome-openclaw-agents). Le modèle de distribution est déjà là. Trois skills à publier dans l'écosystème `awesome-openclaw-agents`  [github](https://github.com/mergisi/awesome-openclaw-agents) :

**`faceted-memory.skill`** — donne à n'importe quel agent OpenClaw une mémoire persistante et recherchable via pg_facets. Un agent qui "se souvient" de tout ce qu'il a traité, requêtable par facettes.

**`knowledge-graph.skill`** — donne à un agent un graphe de compétences auto-géré. Il peut écrire ses propres nœuds de connaissance après chaque tâche accomplie.

**`context-pack.skill`** — remplace la gestion de contexte ad hoc d'OpenClaw par un `pragma_pack_context` ranké et provenancé. L'agent reçoit exactement ce dont il a besoin, pas un dump.

Chaque skill est un `SOUL.md` + 3-4 appels SQL. Copiable en une commande. Aucune installation additionnelle si le MCP server tourne.

***

### 4. SQL Cookbook Public — Le Vecteur SEO/Documentation

Les trois extensions sont utilisables en **SQL pur**. N'importe quel développeur avec `psql`, DBeaver, ou un ORM peut les appeler sans aucun SDK. Un cookbook public de requêtes SQL commentées — hébergé sur GitHub et le site Mindflight — avec des exemples couvrant les cas d'usage réels :

```sql
-- "Give my agent its top 10 context items for this query"
SELECT pack_text
FROM pragma_pack_context('agent:42', 'GDPR data transfer', 10);

-- "What percentage of this domain's ontology does my agent cover?"
SELECT coverage_score
FROM dgraph_coverage('agent:compliance-v1', 'ontology:gdpr-2026');

-- "Find documents about X, filtered by regulation type"
SELECT * FROM facets_search('data transfer obligations')
WHERE regulation_type = 'GDPR' AND jurisdiction = 'EU';
```

Chaque requête est un cas d'usage autonome. Pas de framework. Pas d'imports. Juste du SQL qui s'exécute.

***

## La Stratégie de Contenu par Niveau d'Engagement

| Niveau | Format | Effort utilisateur | Canal |
|---|---|---|---|
| **Découverte** | Article + 1 requête SQL copiable | 0 | Blog Mindflight, dev.to, Hacker News |
| **Exploration** | SQL Cookbook (10 recettes) | 5 min | GitHub README |
| **Intégration rapide** | Docker one-liner + MCP config | 30 min | DockerHub, MCP registry |
| **Adoption OpenClaw** | 3 SOUL.md skills | 1h | awesome-openclaw-agents |
| **Adoption profonde** | MindCLI / MindBot | plusieurs jours | Documentation complète |

La clé : **chaque niveau est indépendant**. Un développeur peut utiliser les extensions avec juste un `docker run` et quelques requêtes SQL sans jamais savoir que MindBot existe. S'il veut aller plus loin, le chemin est là.

***

## Ce qu'il faut Préparer en Priorité

Trois livrables, dans cet ordre :

**1. L'image Docker**  [instaclustr](https://www.instaclustr.com/education/postgresql/best-managed-postgresql-solutions-for-developers-top-5-in-2026/) — c'est le déblocage fondamental. Sans friction d'installation, tous les autres vecteurs deviennent accessibles. Une image publiée sur DockerHub avec un README clair suffit au départ.

**2. Le MCP server `mfo-postgres-mcp`**  [pgedge](https://www.pgedge.com/blog/how-to-use-the-pgedge-mcp-server-for-postgresql-with-claude-cowork) — le pattern est documenté, l'écosystème existe, la demande est là. Un MCP server sur PostgreSQL est déjà un produit que les développeurs cherchent  [lobehub](https://lobehub.com/mcp/apify-postgresql-mcp-server). En exposant les trois extensions comme MCP tools, MindFlight entre dans un marché existant avec une proposition technique supérieure.

**3. Un SOUL.md skill par extension**  [github](https://github.com/mergisi/awesome-openclaw-agents) — distribution dans l'écosystème OpenClaw existant. Ces 177 templates représentent la base d'utilisateurs la plus immédiatement accessible. Un `faceted-memory.skill` dans cette liste est du marketing organique continu.

***

## L'Angle Narratif pour Ce Public

Les développeurs OpenClaw ne cherchent pas "une extension PostgreSQL". Ils cherchent à résoudre des problèmes concrets : leur agent oublie tout entre les sessions, il ne sait pas quoi mettre dans le contexte, il ne peut pas expliquer pourquoi il a répondu ça. Le message doit partir de ces problèmes — pas de l'architecture.

**Pour pg_facets :** *"Give your OpenClaw agent a persistent, searchable memory in 30 seconds."*

**Pour pg_dgraph :** *"Know exactly which tasks your agent can handle — and which ones it can't."*

**Pour pg_pragma :** *"Stop burning tokens on irrelevant context. Give your agent working memory that fits."*

Trois problèmes reconnaissables. Trois solutions SQL. Un `docker run`. Aucune application à installer.