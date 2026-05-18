# Brain Document Import and SQLite Locks

## Summary

`../mindbrain` and `vendor/mindbrain` are currently aligned on `v1.3.1` / `5d58c11`. GhostCrab does not run the sibling checkout directly; it builds and ships `ghostcrab-backend` and `ghostcrab-document` from the vendored MindBrain code.

MindBrain owns the corpus commands through `mindbrain-standalone-tool`. GhostCrab exposes those commands as `gcp brain document`, with SQLite path resolution matching `gcp brain up`.

The operational rule stays conservative: commands that write or read the GhostCrab SQLite database should not run while the MCP backend has that same database open, unless the operator explicitly passes `--force`.

## Key Changes

- Teach `gcp brain document` to distinguish commands that do not require `--db` (`document-normalize`, `document-profile`, `corpus-eval`, `simulate`) from commands that operate on SQLite.
- Add wrapper-level `--db <path>` support, using that path for both backend-lock preflight and the forwarded document-engine command.
- Keep the backend preflight only for database commands.
- Improve the refusal message with the resolved SQLite path, backend URL, pid-file path, `gcp brain db-who --path <db>`, and `/api/mindbrain/sql/write-status` when available.

## Tests

- Verify no-DB subcommands can run while a backend health endpoint is alive.
- Verify DB subcommands refuse to run while the backend is alive unless `--force` is passed.
- Verify `--db` is used for preflight and forwarded exactly once to the document engine.
- Verify qualification subcommands are treated as DB-backed and receive wrapper
  `--db` injection.
- Run `node bin/gcp.mjs brain document --help`, targeted Vitest coverage, and `npm run typecheck`.

## Assumptions

- No changes are needed in `../mindbrain` for the GhostCrab UX fix.
- `--force` remains the explicit escape hatch for risky concurrent SQLite access.
- The document-engine binary continues to be resolved from `GHOSTCRAB_DOCUMENT_ENGINE`, optional platform packages, local prebuilds, or dev build output.
