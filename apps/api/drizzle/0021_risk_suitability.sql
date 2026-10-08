CREATE TABLE "app"."risk_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"investor_id" uuid NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"raw_score" smallint NOT NULL,
	"caps" jsonb NOT NULL,
	"level" text NOT NULL,
	"max_riskometer" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"completed_at" timestamp (6) with time zone NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"source" text NOT NULL,
	"ip" "inet",
	"ua" text,
	CONSTRAINT "risk_profiles_level_ck" CHECK (level IN ('CONSERVATIVE', 'MOD_CONSERVATIVE', 'MODERATE', 'MOD_AGGRESSIVE', 'AGGRESSIVE')),
	CONSTRAINT "risk_profiles_max_riskometer_ck" CHECK (max_riskometer IN ('LOW', 'LOW_TO_MODERATE', 'MODERATE', 'MODERATELY_HIGH', 'HIGH', 'VERY_HIGH')),
	CONSTRAINT "risk_profiles_status_ck" CHECK (status IN ('ACTIVE', 'STALE', 'EXPIRED', 'SUPERSEDED')),
	CONSTRAINT "risk_profiles_source_ck" CHECK (source IN ('ONBOARDING', 'RETAKE')),
	CONSTRAINT "risk_profiles_score_ck" CHECK (raw_score BETWEEN 8 AND 32)
);
--> statement-breakpoint
CREATE TABLE "app"."risk_questionnaires" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"questions_and_scoring" jsonb NOT NULL,
	"sha256" "bytea" NOT NULL,
	"effective_at" timestamp (6) with time zone,
	"approved_by" text,
	CONSTRAINT "risk_questionnaires_version_uq" UNIQUE("version"),
	CONSTRAINT "risk_questionnaires_status_ck" CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE "app"."suitability_acknowledgements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"check_id" uuid NOT NULL,
	"warning_doc_key" text NOT NULL,
	"warning_doc_version" integer NOT NULL,
	"warning_doc_sha256" "bytea" NOT NULL,
	"rendered_text_sha256" "bytea" NOT NULL,
	"checkbox_at" timestamp (6) with time zone NOT NULL,
	"challenge_id" uuid NOT NULL,
	"consent_record_id" uuid,
	"otp_verified_at" timestamp (6) with time zone,
	"notice_delivery_id" uuid
);
--> statement-breakpoint
CREATE TABLE "app"."suitability_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"order_id" uuid,
	"plan_id" uuid,
	"scheme_id" uuid NOT NULL,
	"scheme_riskometer" text NOT NULL,
	"fund_facts_as_of" timestamp (6) with time zone NOT NULL,
	"risk_profile_id" uuid NOT NULL,
	"level" text NOT NULL,
	"outcome" text NOT NULL,
	CONSTRAINT "suitability_checks_scheme_riskometer_ck" CHECK (scheme_riskometer IN ('LOW', 'LOW_TO_MODERATE', 'MODERATE', 'MODERATELY_HIGH', 'HIGH', 'VERY_HIGH')),
	CONSTRAINT "suitability_checks_level_ck" CHECK (level IN ('CONSERVATIVE', 'MOD_CONSERVATIVE', 'MODERATE', 'MOD_AGGRESSIVE', 'AGGRESSIVE')),
	CONSTRAINT "suitability_checks_outcome_ck" CHECK (outcome IN ('MATCH', 'MISMATCH')),
	CONSTRAINT "suitability_checks_subject_ck" CHECK (order_id IS NOT NULL OR plan_id IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "app"."investors" ADD COLUMN "current_risk_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."risk_profiles" ADD CONSTRAINT "risk_profiles_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."risk_profiles" ADD CONSTRAINT "risk_profiles_questionnaire_id_risk_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "app"."risk_questionnaires"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suitability_acknowledgements" ADD CONSTRAINT "suitability_acknowledgements_check_id_suitability_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "app"."suitability_checks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suitability_checks" ADD CONSTRAINT "suitability_checks_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "app"."schemes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."suitability_checks" ADD CONSTRAINT "suitability_checks_risk_profile_id_risk_profiles_id_fk" FOREIGN KEY ("risk_profile_id") REFERENCES "app"."risk_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "risk_profiles_investor_completed_idx" ON "app"."risk_profiles" USING btree ("investor_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_profiles_one_active_uq" ON "app"."risk_profiles" USING btree ("investor_id") WHERE status = 'ACTIVE';