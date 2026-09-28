CREATE TABLE "app"."audit_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"request_id" text,
	"ip" "inet",
	"user_agent" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	CONSTRAINT "audit_events_actor_type_ck" CHECK (actor_type IN ('INVESTOR', 'ADMIN', 'SYSTEM', 'ANONYMOUS'))
);
--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "app"."audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "app"."audit_events" USING btree ("occurred_at");