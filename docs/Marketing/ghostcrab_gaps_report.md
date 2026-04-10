# GhostCrab — Marketing extraction gaps report

Companion to [ghostcrab_marketing_structure.json](./ghostcrab_marketing_structure.json). Use this to prioritize content work before a public landing page.

## Missing primary sources (prompt checklist)

| Prompt expectation | Status in repo | Impact |
|--------------------|----------------|--------|
| `README.md` | Present | Bloc 1–2 well supported |
| `CHANGELOG.md` (root) | **Missing** | No semver velocity narrative; use `docs/roadmap.md` / `PROJECT_SPACE.md` only with explicit “not a changelog” disclaimer |
| `skills/openclaw/SKILL.md` | **Missing** | Bloc 3 skill name / example prompt for OpenClaw = [MISSING] |
| `skills/codex/SKILL.md` | **Missing** | Same for Codex (integration doc exists: `docs/codex_integration.md`) |
| `skills/claude-code/SKILL.md` | **Missing** | Same for Claude Code (`docs/SOP_start/claude-code.md` has CLAUDE.md fragment only) |
| DDL / migrations for three layers | Present (`src/db/migrations/001–003`) | Bloc 2 technical proof supported |
| Proposition DSL with repo examples | Present (`extensions/pg_pragma/docs/DSL_RULES.md`, `README.md`) | Supported |
| `LICENSE` (root) | **Missing** | Trust / OSS maturity signal weak |
| `CONTRIBUTORS` | **Not found** | Optional social proof |
| GitHub stars / org endorsements | **Not in repo** | Left `null` in JSON |

## Sections marked [MISSING] in deliverables

- Packaged **agent skill names** and **canonical example prompts** per agent (OpenClaw, Codex, Claude Code) until `skills/**/SKILL.md` exists.  
- **Changelog-driven** proof of stability and release cadence.  
- **Testimonials** and **notable users** (no issues/discussion mining performed).  
- **Star/contributor counts** (would need GitHub API or manual update).

## Ambiguous or risky claims (validate before publish)

1. **README absolute paths** — Some links point at `/Users/francois/Documents/mars2026/ghostcrab/...`; workspace may be `strata`. Normalize to relative URLs before marketing use.  
2. **`memory_projections` vs `mfo_projections`** — `extensions/pg_pragma/README.md` mentions `memory_projections`; application migration defines `mfo_projections`. Marketing copy should use one story (app vs extension generic name) after engineering confirmation.  
3. **`surface_version`** — Documented as stable but “not semantically versioned yet” (`docs/known_limits.md`); do not imply strict SemVer for the MCP contract.

## Recommended additions (ordered)

1. Add **`skills/openclaw`**, **`skills/codex`**, **`skills/claude-code`** with `SKILL.md` per [prompt-marketing.md](./prompt-marketing.md).  
2. Add root **`CHANGELOG.md`**.  
3. Add root **`LICENSE`**.  
4. Fix **README** links to be **repository-relative**.  
5. Add a short **“Naming: mfo_* vs memory_*”** note in docs for extension vs app schema.  
6. Optionally run **`gh repo view`** (or CI) to populate **stars** / **contributors** in future JSON refreshes.

## Execution checklist (from prompt) — status

- [x] README.md read and sourced  
- [ ] `/skills/*` for three agents — **incomplete** (folder absent)  
- [x] DDL / migrations for facets, graph, pragma analyzed (`001`–`003`)  
- [x] Proposition DSL documented with repo examples (`DSL_RULES.md`, SQL CHECK types)  
- [x] No claim without a cited file in JSON (stars/testimonials explicitly null or empty)  
- [x] MISSING sections listed in Bloc 8  
- [x] Three output files generated under `docs/Marketing/`
