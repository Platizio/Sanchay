CREATE TABLE "app"."order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"plan_id" uuid,
	"mandate_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"trigger" text NOT NULL,
	"provider_event_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp (6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"investor_id" uuid NOT NULL,
	"type" text NOT NULL,
	"origin" text DEFAULT 'ONE_TIME' NOT NULL,
	"plan_id" uuid,
	"scheme_id" uuid NOT NULL,
	"folio_id" uuid,
	"mode" text DEFAULT 'AMOUNT' NOT NULL,
	"amount" numeric(18, 2),
	"units" numeric(20, 4),
	"status" text DEFAULT 'CONSENT_PENDING' NOT NULL,
	"consent_challenge_id" uuid,
	"bank_account_id" uuid NOT NULL,
	"payment_method" text,
	"arn" text NOT NULL,
	"execution_only" boolean DEFAULT true NOT NULL,
	"initiated_via" text NOT NULL,
	"user_ip" "inet" NOT NULL,
	"expected_nav_date" timestamp (6) with time zone,
	"cutoff_class" text,
	"fp_order_id" text,
	"fp_old_id" bigint,
	"fp_state" text,
	"allotted_units" numeric(20, 4),
	"allotted_nav" numeric(18, 6),
	"allotted_nav_date" text,
	"purchased_amount" numeric(18, 2),
	"payout_status" text DEFAULT 'NONE' NOT NULL,
	"submit_attempts" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"final_at" timestamp (6) with time zone,
	"suitability_check_id" uuid,
	"suitability_ack_id" uuid,
	CONSTRAINT "orders_type_ck" CHECK (type IN ('PURCHASE', 'REDEMPTION')),
	CONSTRAINT "orders_status_ck" CHECK (status IN ('CONSENT_PENDING', 'CONSENTED', 'SUBMITTING', 'UNDER_REVIEW', 'CONFIRMING', 'AWAITING_PAYMENT', 'PAYMENT_PENDING', 'PROCESSING', 'SETTLED', 'UNITS_PENDING', 'FAILED', 'EXPIRED', 'REJECTED', 'REVERSED', 'CANCELLED', 'CONSENT_EXPIRED', 'RECONCILING', 'SKIPPED')),
	CONSTRAINT "orders_mode_ck" CHECK (mode IN ('AMOUNT', 'UNITS', 'ALL')),
	CONSTRAINT "orders_initiated_via_ck" CHECK (initiated_via IN ('web', 'mobile_web', 'mobile_app_android')),
	CONSTRAINT "orders_payout_status_ck" CHECK (payout_status IN ('NONE', 'EXPECTED', 'DELAYED', 'CREDITED'))
);
--> statement-breakpoint
CREATE TABLE "app"."folios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"investor_id" uuid NOT NULL,
	"amc_id" uuid NOT NULL,
	"folio_number" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "folios_status_ck" CHECK (status IN ('PENDING', 'ACTIVE'))
);
--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_suitability_check_id_suitability_checks_id_fk" FOREIGN KEY ("suitability_check_id") REFERENCES "app"."suitability_checks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."orders" ADD CONSTRAINT "orders_suitability_ack_id_suitability_acknowledgements_id_fk" FOREIGN KEY ("suitability_ack_id") REFERENCES "app"."suitability_acknowledgements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "app"."order_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "orders_investor_idx" ON "app"."orders" USING btree ("investor_id","status");--> statement-breakpoint
CREATE INDEX "orders_fp_order_idx" ON "app"."orders" USING btree ("fp_order_id");