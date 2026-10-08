CREATE TABLE "app"."bank_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"investor_id" uuid NOT NULL,
	"account_number_enc" "bytea" NOT NULL,
	"account_number_bidx" "bytea" NOT NULL,
	"account_last4" char(4) NOT NULL,
	"ifsc" text NOT NULL,
	"bank_name" text,
	"holder_name_enc" "bytea" NOT NULL,
	"account_type" text DEFAULT 'SAVINGS' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"verification_check_id" uuid,
	"name_match_score" smallint,
	"failure_reason" text,
	"fp_bank_account_id" text,
	"fp_bank_old_id" bigint,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bank_accounts_account_type_ck" CHECK (account_type IN ('SAVINGS')),
	CONSTRAINT "bank_accounts_status_ck" CHECK (status IN ('PENDING', 'VERIFIED', 'FAILED')),
	CONSTRAINT "bank_accounts_name_match_ck" CHECK (name_match_score IS NULL OR (name_match_score >= 0 AND name_match_score <= 100))
);
--> statement-breakpoint
CREATE TABLE "app"."ref_ifsc" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"ifsc" text NOT NULL,
	"bank_name" text NOT NULL,
	"branch_name" text NOT NULL,
	CONSTRAINT "ref_ifsc_ifsc_uq" UNIQUE("ifsc")
);
--> statement-breakpoint
CREATE INDEX "bank_accounts_investor_idx" ON "app"."bank_accounts" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_investor_bidx_idx" ON "app"."bank_accounts" USING btree ("investor_id","account_number_bidx");