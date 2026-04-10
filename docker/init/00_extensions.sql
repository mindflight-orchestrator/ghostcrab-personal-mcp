-- Best-effort extension bootstrap for the phase 0 fallback image.
-- Missing native extensions must not abort initialization.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    RAISE NOTICE 'pg_trgm: extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm: extension not available';
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
    RAISE NOTICE 'vector: extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'vector: extension not available';
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    RAISE NOTICE 'uuid-ossp: extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'uuid-ossp: extension not available';
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_facets;
    RAISE NOTICE 'pg_facets: native extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_facets: native extension not available - SQL fallback remains active';
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_dgraph;
    RAISE NOTICE 'pg_dgraph: native extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_dgraph: native extension not available - SQL fallback remains active';
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_pragma;
    RAISE NOTICE 'pg_pragma: native extension loaded';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_pragma: native extension not available - SQL fallback remains active';
  END;
END
$$;
