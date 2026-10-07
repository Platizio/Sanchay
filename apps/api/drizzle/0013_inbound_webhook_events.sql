CREATE TABLE "app"."inbound_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"signature_mode" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload_enc" "bytea",
	"payload_sha256" "bytea" NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp (6) with time zone,
	CONSTRAINT "inbound_webhook_events_provider_event_uq" UNIQUE("provider","event_id"),
	CONSTRAINT "inbound_webhook_events_signature_mode_ck" CHECK (signature_mode IN ('HMAC', 'SHARED_SECRET', 'NONE')),
	CONSTRAINT "inbound_webhook_events_status_ck" CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX "inbound_webhook_events_status_idx" ON "app"."inbound_webhook_events" USING btree ("status");