/**
 * Reserved namespace for SQLite housekeeping helpers (VACUUM, ANALYZE,
 * incremental_vacuum, WAL checkpointing, …).
 *
 * All former PG-only routines (pg_facets delta merge, pg_dgraph entity_degree
 * refresh, …) were removed along with the rest of the PostgreSQL dead code.
 * Kept as a stable module path so future SQLite chores can land here without
 * inventing yet another file.
 */
export {};
