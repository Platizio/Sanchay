CREATE TABLE "app"."worker_heartbeats" (
	"task_id" text PRIMARY KEY NOT NULL,
	"last_beat_at" timestamp (6) with time zone NOT NULL
);
--> statement-breakpoint
GRANT USAGE ON SCHEMA pgboss TO sanchay_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO sanchay_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sanchay_app;
