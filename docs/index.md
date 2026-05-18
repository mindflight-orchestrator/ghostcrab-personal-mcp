# GhostCrab Documentation

Start here when you need the project documentation map.

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
- [Universal methodology](architecture/universal_methodology.md) — iterative 4-phase methodology for GhostCrab (facets → projections → import → reports).

## Articles

- [Posts](posts/README.md) — home for article-style documentation intended for the GitHub wiki or blog-like publication.

## Archived Candidates

- [To be deleted](to-be-deleted/) — old planning notes and obsolete docs kept temporarily before final removal.
