CREATE TABLE "app"."notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" text DEFAULT 'EMAIL' NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "notification_deliveries_channel_ck" CHECK (channel IN ('EMAIL')),
	CONSTRAINT "notification_deliveries_status_ck" CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
	CONSTRAINT "notification_deliveries_attempts_ck" CHECK (attempts >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"investor_id" uuid NOT NULL,
	"category" text NOT NULL,
	"template_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload_enc" "bytea" NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "notifications_dedupe_uq" UNIQUE("dedupe_key"),
	CONSTRAINT "notifications_category_ck" CHECK (category IN ('SECURITY', 'ORDER', 'SIP', 'MANDATE', 'SUITABILITY', 'ONBOARDING')),
	CONSTRAINT "notifications_template_key_ck" CHECK (template_key IN ('SECURITY_NEW_SIGN_IN', 'ORDER_PLACED', 'ORDER_ALLOTTED', 'ORDER_FAILED', 'REFUND_IN_PROGRESS', 'REDEMPTION_PROCESSED', 'PAYOUT_DELAYED', 'SIP_ACTIVE', 'SIP_INSTALMENT_MISSED_WARNING', 'MANDATE_STATUS', 'MANDATE_REVOKED', 'SUITABILITY_WARNING_COPY', 'ONBOARDING_BLOCKED_PILOT')),
	CONSTRAINT "notifications_status_ck" CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED'))
);
--> statement-breakpoint
ALTER TABLE "app"."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "app"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."notifications" ADD CONSTRAINT "notifications_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "app"."notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notifications_investor_idx" ON "app"."notifications" USING btree ("investor_id","created_at");