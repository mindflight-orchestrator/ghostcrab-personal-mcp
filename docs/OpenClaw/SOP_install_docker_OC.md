Voici un SOP minimal et direct pour une installation locale sous Docker.

***

## Prérequis

- Docker Desktop (ou Engine) + Compose v2 installés
- Minimum 2 GB RAM disponibles (le build `pnpm install` est OOM-killed en dessous) [docs.openclaw](https://docs.openclaw.ai/install/docker)
- Git

***

## SOP — Installation OpenClaw en local

### 1. Cloner le repo

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
```

### 2. Option A — Build local (recommandé)

Lance le script de setup qui construit l'image, exécute l'onboarding interactif et démarre le gateway  : [docs.openclaw](https://docs.openclaw.ai/install/docker)

```bash
./scripts/docker/setup.sh
```

Le script te demandera tes clés API provider (Anthropic, OpenAI, etc.), génère un `OPENCLAW_GATEWAY_TOKEN` et l'écrit dans `.env` automatiquement. [docs.openclaw](https://docs.openclaw.ai/install/docker)

### 2. Option B — Image pré-built (plus rapide)

Pour éviter le build, utilise l'image du GitHub Container Registry  : [docs.openclaw](https://docs.openclaw.ai/install/docker)

```bash
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh
```

Les tags disponibles sont `latest`, `main`, ou une version datée comme `2026.2.26`. [docs.openclaw](https://docs.openclaw.ai/install/docker)

### 3. Vérifier que le gateway tourne

```bash
docker compose ps
curl -fsS http://127.0.0.1:18789/healthz
```

Le healthcheck est intégré à l'image et sonde `/healthz` toutes les 30 secondes. [github](https://github.com/openclaw/openclaw/blob/main/docker-compose.yml)

### 4. Ouvrir l'interface

Naviguer sur `http://127.0.0.1:18789/` et coller le token généré dans Settings. [docs.openclaw](https://docs.openclaw.ai/install/docker)
Pour retrouver le token plus tard :

```bash
docker compose run --rm openclaw-cli dashboard --no-open
```

### 5. Connecter Telegram (optionnel)

Puisque tu utilises Telegram pour MindBot  : [docs.openclaw](https://docs.openclaw.ai/install/docker)

```bash
docker compose run --rm openclaw-cli channels add --channel telegram --token "<ton_token_bot>"
```

### 6. Activer le sandbox agent (optionnel)

Pour isoler l'exécution des agents dans des containers séparés  : [docs.openclaw](https://docs.openclaw.ai/install/docker)

```bash
export OPENCLAW_SANDBOX=1
./scripts/docker/setup.sh
```

***

## Données persistantes

Deux répertoires sont bind-mountés automatiquement depuis le `docker-compose.yml`  : [github](https://github.com/openclaw/openclaw/blob/main/docker-compose.yml)

| Volume host | Cible container | Contenu |
|---|---|---|
| `OPENCLAW_CONFIG_DIR` | `/home/node/.openclaw` | Config, mémoire, tokens |
| `OPENCLAW_WORKSPACE_DIR` | `/home/node/.openclaw/workspace` | Workspace agent |

Les fichiers survivent aux redémarrages et mises à jour du container. Surveille la croissance de `media/` et `cron/runs/*.jsonl` qui peuvent grossir. [docs.openclaw](https://docs.openclaw.ai/install/docker)

***

## Commandes utiles au quotidien

```bash
docker compose up -d           # démarrer
docker compose down            # arrêter
docker compose pull            # mettre à jour l'image
docker compose logs -f         # logs en live
```