# Skill route map essentials

Which GhostCrab skill to invoke by delivery phase. Install all skills: `gcp brain setup cursor|claude|codex|generic`.

**Path resolution:** [STARTERKIT_PATHS.md](./STARTERKIT_PATHS.md)  
**Optional full SOP:** `{starterkit}/personal-mcp/SOP_SEQUENCE.md`  
**Optional companion map:** `{starterkit}/personal-mcp/SKILL_ROUTE_MAP.md`

| Phase | Primary skill(s) | MCP / CLI | Avoid |
| --- | --- | --- | --- |
| A Bootstrap | — | `gcp smoke`, `ghostcrab_status` | gap-auditor (no data yet) |
| B0 Choices | `ghostcrab-data-architect` | `import_path_choices.yaml` | json-answer-builder |
| B Modeling | `ghostcrab-data-architect` | `ghostcrab_schema_register`, ontology compile | projection-reviewer |
| B-fix Convergence | `ghostcrab-gap-auditor` | `ghostcrab_graph_diagnostics` | projection-reviewer |
| B1 Prepare | `ghostcrab-data-architect`, `ghostcrab-projection-reviewer` | projection candidate scripts | `ghostcrab_project` before human gate |
| B1 Freeze | `ghostcrab-projection-reviewer` | — | any write |
| B2 Fake data | `ghostcrab-data-architect` | StarterKit gates 2–4 | operator |
| C2 Import | — | `gcp brain structured-import` | — |
| B1 Materialize | `ghostcrab-projection-reviewer` | `ghostcrab_project`, artifact refresh | — |
| Audit | `ghostcrab-gap-auditor` | projection audit script | — |
| Runtime Q&A | operator → evidence-discovery → json-answer-builder | `ghostcrab_pack`, `ghostcrab_search` | data-architect |
| Unanswerable | `ghostcrab-gap-auditor` | routes to B-fix / B2 / B1 | — |
| Checkpoints | `ghostcrab-memory` | `ghostcrab_remember` | — |
| Fuzzy intent | `ghostcrab-prompt-guide` | intake only | MCP writes |

## Invocation

- **General skills (5):** `disable-model-invocation: true` — user must `@` or explicitly invoke.
- **Operational skills (5):** auto-trigger from description when the task matches.

## Editorial (not on delivery critical path)

- `ghostcrab-integration-sop-editor`
- `mindbrain-comparison-writer`
