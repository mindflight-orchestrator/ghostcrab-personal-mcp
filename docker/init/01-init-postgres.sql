-- Create extensions in dependency order (postgres database).
-- roaringbitmap must load before pg_facets / pg_dgraph / pg_pragma (pg_pragma requires roaringbitmap).
CREATE EXTENSION IF NOT EXISTS pgcrypto CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS roaringbitmap;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_facets;
CREATE EXTENSION IF NOT EXISTS pg_dgraph;
CREATE EXTENSION IF NOT EXISTS pg_pragma;
