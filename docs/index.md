# GhostCrab Documentation

Start here when you need the project documentation map.

## MCP Explanation

Single hub: [GhostCrab MCP — explications (architecture + lab)](explanation/README.md)

| Chapitre | Document |
|----------|----------|
| 03 — Mémoire, facettes, graphe | [03-memoire-mcp-facettes-graphe-projections.md](explanation/03-memoire-mcp-facettes-graphe-projections.md) |
| 04 — Réindexation | [04-reindexation-ghostcrab.md](explanation/04-reindexation-ghostcrab.md) |
| 05 — Projections Type A/B | [05-projections-expliquees.md](explanation/05-projections-expliquees.md) |
| StarterKit audit | [methode-starterkit/README.md](explanation/methode-starterkit/README.md) |
| Lab immeuble (FR) | [explanation/README.md § Lab](explanation/README.md#lab-immeuble-illustration-optionnelle) |
| Lab immeuble (EN) | [explanation/en/README.md](explanation/en/README.md) |
| Projections (EN) | [explanation/en/05-projections-explained.md](explanation/en/05-projections-explained.md) |

## Methodology

- [Universal methodology (EN)](methodology/universal_methodology.md) — iterative 4-phase methodology (facets → projections → import → reports).
- [Méthodologie universelle (FR)](methodology/fr/universal_methodology.md)
- [Ontology development for LLMs (EN)](methodology/ontology_dev_for_llm.md)
- [Développement d'ontologies pour les LLM (FR)](methodology/fr/ontology_dev_for_llm.md)
- [GhostCrab query layers (EN)](methodology/ghostcrab-query-layers.md)
- [Couches de requête GhostCrab (FR)](methodology/fr/ghostcrab-query-layers.md)

## Setup And Usage

- [CLI and MCP client setup](setup/gcp-client-setup.md) — install and wire `gcp` into Cursor, Claude Code, Codex, and OpenClaw-style MCP clients.
- [Document import runbook](setup/document-import.md) — normalize, ingest, profile, qualify, and operate no-LLM fallbacks for `gcp brain document`.
- [Skillset and demo import](setup/skillset-demo-import.md) — pull registry skills, install vendored skills, and load JSONL demo profiles.
- [Beta bundle Makefile workflow](installers/beta-bundle/README.md) — install from a beta bundle on macOS, Linux, WSL, or Git Bash.

## Reference

- [Command reference](reference/gcp-commands.md) — job-to-be-done overview for `gcp brain`, `gcp agent`, `gcp env`, and related aliases.
- [OpenAPI specification](reference/openapi.yaml) — API contract for generated clients and tooling.

## Architecture And Migrations

- [Ontology naming migration](architecture/ontology-naming-migration.md) — current naming contract after the `mfo` cleanup.

## Articles

- [Posts](posts/README.md) — home for article-style documentation intended for the GitHub wiki or blog-like publication.

## Archived Candidates

- [To be deleted](to-be-deleted/) — old planning notes and obsolete docs kept temporarily before final removal.
