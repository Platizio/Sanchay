CREATE TABLE "app"."app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."idempotency_keys" (
	"actor_id" text NOT NULL,
	"key" uuid NOT NULL,
	"route" text NOT NULL,
	"request_sha256" "bytea" NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_actor_id_key_pk" PRIMARY KEY("actor_id","key"),
	CONSTRAINT "idempotency_keys_status_ck" CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
	CONSTRAINT "idempotency_keys_response_pair_ck" CHECK ((response_status IS NULL) = (response_body IS NULL)),
	CONSTRAINT "idempotency_keys_completed_has_response_ck" CHECK (status = 'IN_PROGRESS' OR response_status IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "app"."recon_breaks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"severity" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"resolved_at" timestamp (6) with time zone,
	CONSTRAINT "recon_breaks_severity_ck" CHECK (severity IN ('WARNING', 'CRITICAL')),
	CONSTRAINT "recon_breaks_status_ck" CHECK (status IN ('OPEN', 'RESOLVED')),
	CONSTRAINT "recon_breaks_resolved_pair_ck" CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "app"."idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recon_breaks_open_uq" ON "app"."recon_breaks" USING btree ("kind","entity_id") WHERE status <> 'RESOLVED';