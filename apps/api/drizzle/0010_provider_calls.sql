CREATE TABLE "app"."provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"aggregate_type" text,
	"aggregate_id" text,
	"http_status" integer,
	"duration_ms" integer NOT NULL,
	"error_code" text,
	"request_meta" jsonb,
	"response_meta" jsonb,
	"body_enc" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "provider_calls_aggregate_idx" ON "app"."provider_calls" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "provider_calls_operation_idx" ON "app"."provider_calls" USING btree ("operation","created_at");--> statement-breakpoint
-- Append-only table (design §C.1): same REVOKE as 0003_grants.sql for audit_events.
REVOKE UPDATE, DELETE ON app.provider_calls FROM sanchay_app;