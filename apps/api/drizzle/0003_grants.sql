GRANT USAGE ON SCHEMA app TO sanchay_app, sanchay_retention, sanchay_readonly;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO sanchay_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sanchay_app;
--> statement-breakpoint
-- Append-only tables (design §C.1). Every later migration that adds an append-only table must repeat this REVOKE.
REVOKE UPDATE, DELETE ON app.audit_events FROM sanchay_app;
