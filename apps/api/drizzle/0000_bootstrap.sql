-- D-21 follow-up (deviation, see ADR-0001 B6 row): drizzle-kit 0.31.11 never emits CREATE SCHEMA
-- for a pgSchema() table (its snapshot's top-level "schemas" map stays empty even though the
-- table's own "schema" field is "app"), so the schema is created here in the bootstrap migration
-- instead, before any schema-scoped table migration runs.
CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gin;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sanchay_migrator') THEN
    CREATE ROLE sanchay_migrator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sanchay_app') THEN
    CREATE ROLE sanchay_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sanchay_retention') THEN
    CREATE ROLE sanchay_retention NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sanchay_readonly') THEN
    CREATE ROLE sanchay_readonly NOLOGIN;
  END IF;
END
$$;
