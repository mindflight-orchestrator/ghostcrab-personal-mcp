# GhostCrab README

## Aperçu
GhostCrab est une base de données contextuelle pour agents AI, construite sur PostgreSQL avec les extensions pg_facets, pg_dgraph et pg_pragma. Le serveur MCP connecte les agents AI à cette base pour une gestion unifiée de contexte via protocoles standardisés.  [github](https://github.com/cybertec-postgresql/pgfaceting)

Ce système adopte un paradigme de graphe de connaissances PostgreSQL pour organiser mémoires, ressources et compétences, en résolvant les problèmes de fragmentation et de récupération inefficace dans les agents AI.  [github](https://github.com/cybertec-postgresql/pgfaceting)

## Défis en développement d'agents
- Contexte fragmenté : mémoires en code, ressources en bases vectorielles, compétences dispersées.
- Demande explosive de contexte : tâches longues génèrent du contexte continu, avec perte d'information lors de troncature.
- Récupération faible : RAG traditionnel utilise stockage plat sans vue globale.
- Contexte non observable : chaîne de récupération implicite comme boîte noire.
- Itération mémoire limitée : mémoires limitées aux interactions utilisateur, sans tâches agent-spécifiques. [user-provided]

## Solution GhostCrab
GhostCrab unifie le contexte via PostgreSQL extensions :
- pg_facets pour facettes rapides avec bitmaps roaring.
- pg_dgraph pour graphes de connaissances.
- pg_pragma pour projections mémoire optimisées.

Le serveur MCP expose des outils pour requêtes naturelles, monitoring et optimisation DB.  [github](https://github.com/cybertec-postgresql/pgfaceting)

## Concepts clés
### Paradigme graphe PostgreSQL
Contexte mappé en graphes URI postgres:// (nœuds, arêtes avec facettes). Agents naviguent via requêtes SQL sémantiques comme ls/find.  [github](https://github.com/cybertec-postgresql/pgfaceting)

```
postgres://
├── resources/           # Docs projets, repos
├── user/                # Préférences utilisateur
└── agent/               # Compétences, mémoires tâches
```

### Chargement hiérarchique
L0 (résumé), L1 (vue d'ensemble), L2 (détails) stockés en facettes, chargés à la demande pour économiser tokens. [user-provided]

### Récupération récursive
Analyse intent → positionnement facettes → exploration graphe → agrégation résultats via pg_facets/pg_dgraph.  [github](https://github.com/cybertec-postgresql/pgfaceting)

### Trajectoire observable
Logs MCP tracent requêtes graphe pour débogage.  [github](https://github.com/mukul975/postgres-mcp-server)

### Gestion sessions auto
Extraction automatique mémoires longues via pg_pragma après sessions. [user-provided]

## Début rapide
### Prérequis
- PostgreSQL 15+ avec extensions : pg_roaringbitmap, pgfaceting (pg_facets), pg_dgraph, pg_pragma.
- Go 1.22+ pour serveur MCP.
- Connexion réseau pour modèles.  [github](https://github.com/cybertec-postgresql/pgfaceting)

### Installation
1. Installer extensions PostgreSQL :
   ```
   CREATE EXTENSION roaringbitmap, pgfaceting, age;  -- pg_dgraph via AGE
   ```
2. Installer serveur MCP :
   ```
   go install github.com/mukul975/postgres-mcp-server@latest  # Adapté
   ```
3. Configurer DB et MCP.  [github](https://github.com/mukul975/postgres-mcp-server)

### Configuration
Fichier `~/.ghostcrab/mcp.conf` :
```
{
  "postgres": {
    "dsn": "postgres://user:pass@localhost/ghostcrab_db"
  },
  "embedding": {
    "model": "text-embedding-3-large",
    "provider": "openai"
  },
  "vlm": {
    "model": "gpt-4o",
    "provider": "openai"
  }
}
```
Exporter : `export GHOSTCRAB_CONFIG=~/.ghostcrab/mcp.conf`. [user-provided]

### Lancer
```
ghostcrab-server  # Lance MCP sur :8080
ov status         # CLI test (adapté OpenViking)
ghostcrab add-resource https://github.com/volcengine/OpenViking
ghostcrab find "AI agent context"
```

## Déploiement
Déployer sur Kubernetes/Docker avec PostgreSQL persistant. Utiliser pour multi-agents via MCP standard.  [github](https://github.com/mukul975/postgres-mcp-server)

## Performances
Intégration extensions booste récupération : facettes en ms sur millions lignes.  [github](https://github.com/cybertec-postgresql/pgfaceting)

Documentation complète en développement. Licence Apache-2.0. [user-provided]