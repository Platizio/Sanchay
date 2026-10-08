CREATE TABLE "app"."consent_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"investor_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"folio_id" uuid,
	"template_key" text NOT NULL,
	"snapshot_enc" "bytea" NOT NULL,
	"snapshot_sha256" "bytea" NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"required_factors" jsonb NOT NULL,
	"money_params_version" text NOT NULL,
	"render_action" text,
	"render_amount" text,
	"render_units" text,
	"render_scheme_short" text,
	"sms_send_count" smallint DEFAULT 0 NOT NULL,
	"last_sms_sent_at" timestamp (6) with time zone,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"execute_before" timestamp (6) with time zone,
	"saga_expires_at" timestamp (6) with time zone,
	"consumed_at" timestamp (6) with time zone,
	CONSTRAINT "consent_challenges_subject_type_ck" CHECK (subject_type IN ('PURCHASE', 'REDEMPTION', 'SWITCH', 'SIP_REGISTRATION', 'SIP_WITH_PURCHASE', 'STP_REGISTRATION', 'SWP_REGISTRATION', 'PLAN_MODIFY', 'PLAN_PAUSE', 'PLAN_CANCEL', 'MANDATE_REGISTRATION', 'MANDATE_CANCEL', 'CONTACT_CHANGE', 'BANK_CHANGE', 'FOLIO_SERVICE_REQUEST', 'ONBOARDING_ATTEST')),
	CONSTRAINT "consent_challenges_status_ck" CHECK (status IN ('PENDING', 'APPROVED', 'CONSUMED', 'CONSUMED_UNUSED', 'SUPERSEDED', 'EXPIRED', 'CANCELLED')),
	CONSTRAINT "consent_challenges_sha256_len_ck" CHECK (octet_length(snapshot_sha256) = 32),
	CONSTRAINT "consent_challenges_sms_send_count_ck" CHECK (sms_send_count >= 0 AND sms_send_count <= 3)
);
--> statement-breakpoint
CREATE TABLE "app"."consent_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"kind" text NOT NULL,
	"investor_id" uuid NOT NULL,
	"challenge_id" uuid,
	"subject_type" text,
	"document_key" text,
	"subject_ids" jsonb,
	"snapshot_sha256" "bytea",
	"snapshot_enc" "bytea",
	"delivery_evidence" jsonb,
	"channel" text,
	"ip" "inet",
	"user_agent" text,
	"session_id" uuid,
	"consumed_at" timestamp (6) with time zone NOT NULL,
	"execute_before" timestamp (6) with time zone,
	"saga_expires_at" timestamp (6) with time zone,
	"first_attempt_at" timestamp (6) with time zone,
	CONSTRAINT "consent_records_challenge_id_uq" UNIQUE("challenge_id"),
	CONSTRAINT "consent_records_kind_ck" CHECK (kind IN ('CHALLENGE', 'DOCUMENT_ACCEPTANCE')),
	CONSTRAINT "consent_records_kind_pair_ck" CHECK ((kind = 'CHALLENGE' AND challenge_id IS NOT NULL AND document_key IS NULL AND subject_type IS NOT NULL)
        OR (kind = 'DOCUMENT_ACCEPTANCE' AND challenge_id IS NULL AND document_key IS NOT NULL AND subject_type IS NULL))
);
--> statement-breakpoint
CREATE TABLE "app"."consent_subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "consent_subjects_challenge_subject_uq" UNIQUE("challenge_id","subject_table","subject_id"),
	CONSTRAINT "consent_subjects_status_ck" CHECK (status IN ('PENDING', 'CONSENTED'))
);
--> statement-breakpoint
CREATE TABLE "app"."legal_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"key" text NOT NULL,
	"body_markdown" text NOT NULL,
	"sha256" "bytea" NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"effective_from" timestamp (6) with time zone,
	CONSTRAINT "legal_documents_key_version_uq" UNIQUE("key","version"),
	CONSTRAINT "legal_documents_key_ck" CHECK (key IN ('TNC', 'PRIVACY_NOTICE', 'RISK_DISCLOSURE', 'REGULAR_PLAN_COMMISSION', 'EXECUTION_ONLY_DECLARATION', 'FATCA_CRS_DECLARATION', 'NOMINATION_OPT_OUT_ANNEX_B', 'CAS_IMPORT_NOTICE', 'KYC_CONSENT', 'INVESTOR_CHARTER', 'GRIEVANCE_POLICY', 'TPL_PURCHASE', 'TPL_REDEMPTION', 'TPL_SWITCH', 'TPL_SIP_REGISTRATION', 'TPL_SIP_WITH_PURCHASE', 'TPL_STP_REGISTRATION', 'TPL_SWP_REGISTRATION', 'TPL_PLAN_MODIFY', 'TPL_PLAN_PAUSE', 'TPL_PLAN_CANCEL', 'TPL_MANDATE_REGISTRATION', 'TPL_MANDATE_CANCEL', 'TPL_NOMINATION_CHANGE', 'TPL_CONTACT_CHANGE', 'TPL_BANK_CHANGE', 'TPL_FOLIO_SERVICE_REQUEST', 'TPL_ONBOARDING_ATTEST', 'SUITABILITY_WARNING', 'TPL_NOMINATION_OPT_OUT')),
	CONSTRAINT "legal_documents_status_ck" CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
);
--> statement-breakpoint
ALTER TABLE "app"."consent_subjects" ADD CONSTRAINT "consent_subjects_challenge_id_consent_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "app"."consent_challenges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_challenges_investor_idx" ON "app"."consent_challenges" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "consent_challenges_pending_expiry_idx" ON "app"."consent_challenges" USING btree ("expires_at") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "consent_challenges_consumed_execute_before_idx" ON "app"."consent_challenges" USING btree ("execute_before") WHERE status = 'CONSUMED';--> statement-breakpoint
CREATE INDEX "consent_records_investor_idx" ON "app"."consent_records" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "consent_subjects_subject_idx" ON "app"."consent_subjects" USING btree ("subject_table","subject_id");--> statement-breakpoint
CREATE INDEX "legal_documents_key_published_idx" ON "app"."legal_documents" USING btree ("key","effective_from") WHERE status = 'PUBLISHED';