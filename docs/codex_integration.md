# GhostCrab Integration For Codex

This guide explains how to connect Codex to a local GhostCrab server over MCP stdio.

## Prerequisites

- GhostCrab built locally
- Docker available
- Codex installed locally
- access to `~/.codex/config.toml`

## 1. Start The Local GhostCrab Database

```bash
PG_PORT=55432 docker compose -f docker/docker-compose.native.yml up -d --build postgres
```

Default local DSN:

```bash
postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab
```

## 2. Apply Migrations And Build

```bash
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab npm run migrate
DATABASE_URL=postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab npm run build
```

## 3. Register GhostCrab In Codex

Add this block to [config.toml](/Users/francois/.codex/config.toml):

```toml
[features]
rmcp_client = true

[mcp_servers.ghostcrab]
command = "node"
args = ["/absolute/path/to/ghostcrab/dist/index.js"]
env = { DATABASE_URL = "postgres://ghostcrab:ghostcrab@localhost:55432/ghostcrab", GHOSTCRAB_EMBEDDINGS_MODE = "fake" }
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Notes:

- keep the `args` path absolute
- `GHOSTCRAB_EMBEDDINGS_MODE=fake` is useful for deterministic local tests
- if your Codex config already has a `[features]` block, add `rmcp_client = true` there instead of creating a second one

## 4. Restart Codex

Codex reads MCP server config on startup, so restart the app after changing `~/.codex/config.toml`.

## 5. Smoke Test In A Fresh Codex Thread

Use this prompt:

```text
List available GhostCrab tools.
```

Expected result:

- Codex should see the `ghostcrab_*` tool family
- the local surface should currently include 13 public tools

Typical tools:

- `ghostcrab_search`
- `ghostcrab_remember`
- `ghostcrab_upsert`
- `ghostcrab_count`
- `ghostcrab_schema_register`
- `ghostcrab_schema_list`
- `ghostcrab_schema_inspect`
- `ghostcrab_coverage`
- `ghostcrab_traverse`
- `ghostcrab_learn`
- `ghostcrab_pack`
- `ghostcrab_project`
- `ghostcrab_status`

## 6. First Real Prompt

After the tool list works, replay a small grounding task such as:

```text
Use the skill `ghostcrab-memory`.

Work in this repository as a normal coding agent, but calibrate your GhostCrab usage carefully.

Goals:
1. Decide whether GhostCrab should be used for this repo/task context.
2. Read only the minimum GhostCrab context needed to ground yourself.
3. Summarize what durable repo knowledge is worth keeping for future sessions.
4. Write back only if the knowledge is likely to recur.
5. Do not invent missing repo knowledge.
6. If an exact read returns zero rows, do not claim the whole domain is empty.
7. Keep local repo context separate from global runtime/platform gaps unless they directly matter.

Final answer:
- observed evidence
- memory decision
- durable write
- explicit gaps
```

## 6b. Prompt Help For Users

Codex does not expose a custom GhostCrab slash command from this repo, so the practical equivalent of `/help` is a dedicated skill.

Use this prompt in a fresh thread:

```text
Use the skill `ghostcrab-prompt-guide`.

I want to use GhostCrab but I do not know the right prompt shape.

Please:
1. classify my request
2. choose the right GhostCrab skill
3. give me one copy-paste starter prompt
4. give me one stricter variant if this use case is fragile
```

That gives users a discoverable GhostCrab entrypoint without forcing them to know the internal tool names first.

## 6b2. Natural Onboarding Behavior To Expect

On a natural first-turn GhostCrab request, Codex should not need explicit tool or skill names from the user.

A realistic user prompt is closer to:

```text
J'ai besoin d'utiliser GhostCrab pour piloter un projet qui va durer plusieurs phases, avec des tâches, des blocages, des handoffs et probablement des changements de priorités en route.

Je ne sais pas encore quelle structure je veux.
Je veux surtout ne pas perdre le fil au bout de plusieurs sessions.
```

The desired Codex behavior is:

1. infer the most likely activity family first
2. state a short intent hypothesis
3. ask 2 to 4 clarification questions
4. make at least half of those questions family-specific
5. avoid generic cadence questions unless cadence changes the recommended setup
6. mention the likely compact recovery view when the route is already visible
7. explicitly offer help writing the next structured GhostCrab prompt
8. avoid implementation or schema freeze on the first turn

For example, once the route is visible, a strong first-turn close looks like:

- `This sounds like integration-operations with durable current-state tracking and external evidence.`
- `Likely recovery view: integration-health-brief.`
- `If you want, once you answer these points I can draft a clean GhostCrab starter prompt for you.`

## 6c. Mini Heartbeat Prompt

For a compact project status in `workflow-tracking`, GhostCrab now seeds a `mini-heartbeat` projection recipe.

Use this prompt:

```text
Use the skill `ghostcrab-memory`.

Read the GhostCrab workspace `project:refonte-onboarding` and give me the `mini-heartbeat`.

I want:
- a one-line summary
- a Markdown table with Task | Owner | Status | Priority
- a `Blockers` section
- a `This Week` section

Do not mention unrelated global runtime gaps.
Keep it simple and user-facing.
```

## 6d. Long-Running Recovery Prompt

For multi-phase work or post-pause recovery, use a current-state-first prompt:

```text
Use the skill `ghostcrab-memory`.

We are resuming a long-running GhostCrab-backed project after a pause.

Task:
1. read canonical current-state records first
2. then read supporting sources and notes
3. then give me the smallest useful recovery view

I want:
- current phase
- what changed since the last checkpoint
- blockers
- environment-specific constraints
- next actions
```

## 7. Troubleshooting

- Codex does not see any GhostCrab tools:
  Check that `rmcp_client = true` is enabled and restart Codex.
- GhostCrab starts then exits:
  Run `npm run migrate` and verify the `DATABASE_URL`.
- Docker is running but login fails:
  Make sure the DSN matches the Docker credentials and exposed port.
- Tool list works but prompts still do not use GhostCrab:
  Run the task in a fresh thread and explicitly invoke the GhostCrab skill on the first line.
- Codex keeps asking the same generic onboarding questions:
  Strengthen the first-turn routing guidance so it states the likely activity family, asks family-shaped questions, and offers prompt help instead of only proposing a generic structure.
