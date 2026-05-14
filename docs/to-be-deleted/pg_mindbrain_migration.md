Migrate GhostCrab To Schema-Qualified pg_mindbrain

Goal

Update GhostCrab MCP so it treats pg_mindbrain as the canonical extension-owned surface:





mb_pragma.* for pragma tables and pragma functions



facets.* and graph.* for helper entrypoints



no reliance on public or search_path for extension-owned objects



a repeatable migration path for existing databases that already contain legacy public.mindbrain_* data

Current Hotspots

The current runtime still depends on legacy object names in a few key places:

          SELECT proj_type, content, weight, source_ref, status
          FROM projections
          ...
            FROM pragma_pack_context($1::text, $2::text, $3::int) p
            JOIN projections mp ON mp.id = p.id::uuid

export async function getPgFacetsTableStatus(
  database: DatabaseClient,
  qualifiedName = "public.facets"
): Promise<PgFacetsTableStatus> {

    extensions.pgPragma
      ? functionExists(database, "pragma_pack_context(text,text,integer)")
      : Promise.resolve(false),

The existing app migration chain also still creates and aligns the legacy unqualified tables:





[../src/db/migrations/003_pragma_schema.sql](../src/db/migrations/003_pragma_schema.sql)



[../src/db/migrations/007_pragma_extension_alignment.sql](../src/db/migrations/007_pragma_extension_alignment.sql)

At the extension layer, pg_mindbrain still ships only a single install SQL with no upgrade path:





[../extensions/pg_mindbrain/sql/pg_mindbrain--1.0.0.sql](../extensions/pg_mindbrain/sql/pg_mindbrain--1.0.0.sql)



[../extensions/pg_mindbrain/pg_mindbrain.control](../extensions/pg_mindbrain/pg_mindbrain.control)

Workstreams

1. Update GhostCrab runtime SQL

Touch the runtime files that still read or probe legacy names and switch them to explicit schemas:





facets table references from public.facets to mb_pragma.facets



pragma table references from projections / facets to mb_pragma.mindbrain_*



pragma function calls from unqualified pragma_* to mb_pragma.pragma_*



direct helper calls like build_filter_bitmap_native(...) to facets.build_filter_bitmap_native(...)

Key files to change:





[../src/db/facets-runtime.ts](../src/db/facets-runtime.ts)



[../src/db/facets-maintenance.ts](../src/db/facets-maintenance.ts)



[../src/db/facets-registration.ts](../src/db/facets-registration.ts)



[../src/db/facet-reconciliation.ts](../src/db/facet-reconciliation.ts)



[../src/db/native-facets.ts](../src/db/native-facets.ts)



[../src/db/native-readiness.ts](../src/db/native-readiness.ts)



[../src/tools/facets/search.ts](../src/tools/facets/search.ts)



[../src/tools/facets/count.ts](../src/tools/facets/count.ts)



[../src/tools/facets/catalog.ts](../src/tools/facets/catalog.ts)



[../src/tools/facets/hierarchy.ts](../src/tools/facets/hierarchy.ts)



[../src/tools/pragma/pack.ts](../src/tools/pragma/pack.ts)



[../src/tools/pragma/status.ts](../src/tools/pragma/status.ts)



[../src/tools/workspace/ddl.ts](../src/tools/workspace/ddl.ts)

2. Add explicit GhostCrab DB migration for existing data

Add a new app-side SQL migration after the existing 003/007 chain that:





creates mb_pragma if needed



moves public.mindbrain_* objects into mb_pragma



preserves data in-place for existing databases



seeds and normalizes mb_pragma.projection_types



adds or validates the registry-backed foreign key for projections.proj_type



optionally drops or leaves only compatibility function shims in public

This should be a numbered migration under [../src/db/migrations](../src/db/migrations) so src/db/migrate.ts and src/cli/migrate.ts can apply it in the same audited flow as the rest of GhostCrab.

3. Ship a real extension upgrade path

Add a versioned extension update script so existing installs can use ALTER EXTENSION ... UPDATE instead of relying only on manual moves. That likely means:





keep pg_mindbrain--1.0.0.sql as the old baseline



introduce a new target version such as 1.0.1



add [../extensions/pg_mindbrain/sql/pg_mindbrain--1.0.0--1.0.1.sql](../extensions/pg_mindbrain/sql/pg_mindbrain--1.0.0--1.0.1.sql)



update [../extensions/pg_mindbrain/pg_mindbrain.control](../extensions/pg_mindbrain/pg_mindbrain.control) to the new default version



ensure build/package wiring in [../extensions/pg_mindbrain/build.zig](../extensions/pg_mindbrain/build.zig) and the Docker image copies the new SQL artifact

4. Update tests, smoke flow, and migration docs

Update tests and operational docs so they validate the new ownership model rather than the old public layout:





pragma tests should use mb_pragma.mindbrain_*



runtime tests should assert explicit schema qualification where relevant



docs and container instructions should call out that rebuilt images are required when shipping new extension SQL/lib artifacts

Likely files:





[../tests](../tests)



[../extensions/pg_mindbrain/test](../extensions/pg_mindbrain/test)



[../docs/dev/Postgresql/docker_image_build.md](../docs/dev/Postgresql/docker_image_build.md)



[../docker/init/00_extensions.sql](../docker/init/00_extensions.sql)



[../docker/init/01-init-postgres.sql](../docker/init/01-init-postgres.sql)

Execution Shape

flowchart TD
  oldDb[OldDbLayout] --> appMigration[GhostCrabSqlMigration]
  oldDb --> extUpgrade[PgMindbrainUpgradeScript]
  appMigration --> qualifiedRuntime[QualifiedGhostCrabRuntime]
  extUpgrade --> qualifiedRuntime
  qualifiedRuntime --> validation[ValidationQueriesAndTests]

Validation

Plan to verify three cases:





fresh install: rebuilt container or fresh database uses only mb_pragma.* and explicit helper schemas



existing upgraded DB: old public.mindbrain_* objects are gone or moved, data preserved, and GhostCrab queries succeed



runtime readiness: native probes and tool SQL work without search_path assumptions

Use the validation queries already described in [../pg_mindbrain-schema-migration.md](../pg_mindbrain-schema-migration.md) plus GhostCrab-side tool tests for pack, facets search/count/tree, and workspace DDL flows.