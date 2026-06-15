# StarterKit path resolution (Personal)

GhostCrab skills reference delivery SOPs and templates from the **GhostCrab Personal StarterKit** clone. The clone directory name varies (`~/mindbrain-starterkit`, `starter-kit-ghostcrab-perso`, `vendor/starter-kit-ghostcrab-perso`, …). Skills use **portable notation** — never hardcode the clone folder name.

## Notation

| Token | Meaning |
| --- | --- |
| `{starterkit}` | The `starterkit/` folder **inside** the Git clone (edition router + templates + scripts) |
| `{project}` | Delivery project root (where `ontology/`, `generated/`, and `import_path_choices.yaml` live) |

Example paths:

```text
{starterkit}/personal-mcp/SOP_SEQUENCE.md
{starterkit}/templates/linkml_ontology.stub.yaml
{project}/ontology/production.yaml
```

**Ontology YAML lives in `{project}/ontology/`**, not in the starter-kit clone. The starter-kit only ships the stub template.

## Resolve `{starterkit}` before reading files

Run this ladder once per session (or when the first starter-kit file is needed):

1. **`GHOSTCRAB_STARTERKIT_ROOT`** — if set, `{starterkit}` = `$GHOSTCRAB_STARTERKIT_ROOT/starterkit`
2. **`.ghostcrab/starterkit-root`** — one line: absolute or project-relative path to the **clone root** (parent of `starterkit/`); then `{starterkit}` = `<that path>/starterkit`
3. **Probes from `{project}` CWD** (first match wins):
   - `./starterkit/personal-mcp/SOP_SEQUENCE.md` → clone root = `.`
   - `../starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP_SEQUENCE.md`
   - `./vendor/starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP_SEQUENCE.md`
   - `../mindbrain-starterkit/starterkit/personal-mcp/SOP_SEQUENCE.md`
4. **Ask once** — if still unresolved, ask the user for the clone root, write `.ghostcrab/starterkit-root`, retry step 2

Canonical clone URLs (any folder name after clone):

```bash
git clone https://gitlab.com/webigniter/starter-kit-ghostcrab-perso.git
# or: git clone git@github.com:mindflight-orchestrator/starter-kit-ghostcrab-perso.git
```

## Canonical Personal paths

Always prefer **`personal-mcp/`** edition files over root stubs.

| Usage | Path |
| --- | --- |
| SOP sequence | `{starterkit}/personal-mcp/SOP_SEQUENCE.md` |
| Route map | `{starterkit}/personal-mcp/ROUTE_MAP.md` |
| Skill route map | `{starterkit}/personal-mcp/SKILL_ROUTE_MAP.md` |
| Import path choices (SOP0) | `{starterkit}/personal-mcp/SOP0_import_path_choices.md` |
| Ontology modeling (SOP2) | `{starterkit}/personal-mcp/SOP2_obsidian_ontologie.md` |
| Structured import (SOP5 Personal) | `{starterkit}/personal-mcp/SOP5_structured_import.md` |
| Environment bootstrap (SOP4) | `{starterkit}/personal-mcp/SOP4_environment_bootstrap.md` |
| Edition router | `{starterkit}/QUICKSTART.md` |
| YAML templates | `{starterkit}/templates/*` |
| Gate scripts | `{starterkit}/scripts/*` |
| Projection tools readme | `{starterkit}/scripts/README_projection_tools.md` |

**Do not use for Personal SQLite:** `pro-mcp/`, `SOP5_source_import_compiler.md` (Pro track), PostgreSQL COPY scripts.

## Project delivery layout

```text
{project}/
  ontology/
    core.yaml              # single-module default
    production.yaml        # multi-module (e.g. Serenity V4)
    administrative.yaml
  output/
    ontology-slice.json    # dry-run compile output
  generated/
    <workspace_id>/
      import_ready/
  <workspace-slug>/
    import_path_choices.yaml
```

Record import-path decisions in `{project}/<workspace-slug>/import_path_choices.yaml` or project root per SOP0.

## Skill bundle note

Installed skills link this file as `../ghostcrab-shared/STARTERKIT_PATHS.md`. Resolution happens in the **user's delivery project**, not inside the skill install directory.
