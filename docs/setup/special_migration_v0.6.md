# GhostCrab v0.6.0 Workspace-Strict SQLite Migration

GhostCrab v0.6.0 makes answer artifacts workspace-owned. This is a breaking
SQLite schema migration for older Personal databases that still contain legacy
`analysis_plan` rows with `workspace_id IS NULL`.

Do not run this migration blindly on your only copy of a database. Stop
GhostCrab, copy the database, test the migration on the copy, then migrate the
real database only after the copy succeeds.

## What Changed

Older databases could store an `analysis_plan` like this:

```text
artifact_kind = analysis_plan
workspace_id  = NULL
scope         = serenity-v3:alignment:...
```

v0.6.0 requires readable answer artifacts to belong to a real workspace. The
migration accepts legacy rows only when their `scope` maps to exactly one
registered `workspaces.workspace_id`. If no workspace matches, GhostCrab refuses
to guess and the migration fails.

## Stop GhostCrab

From the installed GhostCrab directory:

```bash
cd /home/dlamotte/Documents/ghostcrab-personal-mcp
npx --no-install gcp brain down --all
```

Optional lock check:

```bash
npx --no-install gcp brain db-who --path /path/to/ghostcrab.sqlite
```

## Copy The Database First

Copy the SQLite file and any sidecars:

```bash
mkdir -p /tmp/ghostcrab-v0.6.0-migration-test
cp /path/to/ghostcrab.sqlite /tmp/ghostcrab-v0.6.0-migration-test/ghostcrab.sqlite

test -e /path/to/ghostcrab.sqlite-wal && \
  cp /path/to/ghostcrab.sqlite-wal /tmp/ghostcrab-v0.6.0-migration-test/ghostcrab.sqlite-wal

test -e /path/to/ghostcrab.sqlite-shm && \
  cp /path/to/ghostcrab.sqlite-shm /tmp/ghostcrab-v0.6.0-migration-test/ghostcrab.sqlite-shm
```

Run all preparation and migration commands on the copy first.

## Preflight The Copy

From a GhostCrab source checkout that contains the v0.6.0 helper:

```bash
cd /home/dlamotte/Documents/mindflight/ghostcrab-personal-mcp

node scripts/prepare-v0.6.0-workspace-strict-migration.mjs \
  --db /tmp/ghostcrab-v0.6.0-migration-test/ghostcrab.sqlite
```

If the report says `ready`, run the normal upgrade on the copy.

If it reports an `analysis_plan` blocker, choose the correct workspace
explicitly. Example:

```bash
node scripts/prepare-v0.6.0-workspace-strict-migration.mjs \
  --db /tmp/ghostcrab-v0.6.0-migration-test/ghostcrab.sqlite \
  --analysis-plan-workspace analysis_plan__serenity_v3_model_readiness=serenity-p3 \
  --apply
```

The helper refuses to infer workspace ownership from text-only hints. If the
right workspace is unclear, do not apply a mapping.

## Migrate The Copy

From the installed GhostCrab directory:

```bash
cd /home/dlamotte/Documents/ghostcrab-personal-mcp

npx --no-install gcp brain upgrade \
  --db /tmp/ghostcrab-v0.6.0-migration-test/ghostcrab.sqlite \
  --skip-config-cleanup \
  --no-kill-mcp
```

`migration: applied` and `migration: up-to-date` are both acceptable. The
important result is that the command exits successfully and does not report a
backend health or SQL guard failure.

Verify the strict state:

```bash
sqlite3 -header -column /tmp/ghostcrab-v0.6.0-migration-test/ghostcrab.sqlite \
  "SELECT artifact_kind, workspace_id IS NULL AS workspace_null, COUNT(*) AS n
   FROM mindbrain_answer_artifacts
   GROUP BY artifact_kind, workspace_null
   ORDER BY artifact_kind, workspace_null;"
```

Expected: `workspace_null` is `0` for every artifact kind.

## Migrate The Real Database

Only after the copy succeeds:

1. Stop GhostCrab again.
2. Make a fresh backup of the real SQLite file and sidecars.
3. Run the same preparation command on the real DB, using the workspace mapping
   validated on the copy.
4. Run `gcp brain upgrade --db <real-db> --skip-config-cleanup --no-kill-mcp`.
5. Run the verification query above on the real DB.

## If The Migration Fails

Do not keep retrying destructive edits on the same production SQLite file.

Recommended recovery path:

1. Stop GhostCrab.
2. Move the failing DB aside.
3. Create a new clean v0.6.0 database by starting GhostCrab once.
4. Re-import from a known-good backup/export or reload your source data.
5. Keep the failing DB as an evidence artifact for diagnosis.

Use this path especially when:

- the correct workspace for a legacy row is unknown;
- the backend reports a SQL guard failure after preparation;
- SQLite reports integrity errors;
- the DB has already gone through multiple failed manual attempts.

The migration helper is a bridge for well-understood legacy rows, not a general
database repair tool.
