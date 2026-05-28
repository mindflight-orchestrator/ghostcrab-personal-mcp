# GhostCrab Documentation

Start here when you need the project documentation map.

## MCP Explanation

- [Explications GhostCrab — immeuble MCP lab (FR synthèse)](explanation/README.md) — contexte du lab, cartographie 3 pistes, correspondance méthodologie.
- [GhostCrab MCP lab overview (EN synthesis)](explanation/en/README.md) — short hub, three tracks, methodology crosswalk.
- [GhostCrab MCP — explication pédagogique (FR détail)](mcp-explanation/README.md) — référence golden, ontologie, gap-rules, projections.
- [GhostCrab MCP — pedagogical detail (EN)](mcp-explanation/en/README.md) — golden target, ontology, gap-rules, projections.

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
