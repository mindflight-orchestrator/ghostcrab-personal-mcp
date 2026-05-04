# Starter kit — bundled default profile

This folder mirrors the intent of an external **starter-kit-ghostcrab-perso** repo (clone alongside GhostCrab): SOP-driven Phase A/B/C, YAML templates under `starterkit/templates/`, and IDE entrypoints. The **placeholder YAML files** in that repo are meant to be edited by you; this repo ships a **ready-made JSONL profile** so you can load a small, consistent seed into MindBrain/PostgreSQL without hand-authoring demo lines.

## File

- **`starterkit-default.jsonl`** — demo profile `starterkit-default`: JTBD + contract summaries, template-bundle note, three phase nodes, `DEPENDS_ON` edges, one onboarding projection. Uses workspace slug **`perso-starterkit`** in facets (informational; align your real `ghostcrab_workspace_create` name when you model).

## Load into the database

Requires a running GhostCrab config with **`DATABASE_URL`** (or equivalent) pointing at the same MindBrain/PostgreSQL instance you use for MCP — same as `demo:load` for other profiles.

From this repository root:

```bash
pnpm run demo:load:starterkit
```

Equivalent:

```bash
pnpm run demo:load -- --profile-file examples/starterkit-perso/starterkit-default.jsonl
```

Legacy (profile id under `ghostcrab-skills/shared/demo-profiles/`):

```bash
pnpm run demo:load -- --profile knowledge-base --skills-repo-root ../ghostcrab-skills
```

## Relation to the external starter kit

| Starter kit artifact | This seed |
|----------------------|-----------|
| `templates/jtbd.yaml` | One `remember` row summarising JTBD intent |
| `templates/mvp_core_contract.yaml` | One `remember` row with contract / edge policy |
| Other templates | One `remember` row describing the bundle |
| QUICKSTART three phases | Three `learn_node` + `DEPENDS_ON` chain |

To seed **your own** filled YAML as rows later, either extend this JSONL or use `ghostcrab_remember` / ingest pipelines from the starter kit SOPs.
