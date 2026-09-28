CREATE TABLE "app"."auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"investor_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"idle_expires_at" timestamp (6) with time zone NOT NULL,
	"absolute_expires_at" timestamp (6) with time zone NOT NULL,
	"revoked_at" timestamp (6) with time zone,
	"revoke_reason" text,
	"ip" "inet",
	"user_agent" text,
	"last_used_at" timestamp (6) with time zone,
	CONSTRAINT "auth_sessions_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "auth_sessions_platform_ck" CHECK (platform IN ('WEB', 'ANDROID')),
	CONSTRAINT "auth_sessions_revoke_reason_ck" CHECK (revoke_reason IN ('LOGOUT', 'ADMIN', 'ACCOUNT_CLOSED', 'IDLE', 'CONTACT_CHANGED', 'BANK_CHANGED', 'DEVICE_REVOKED', 'FRAUD_HOLD')),
	CONSTRAINT "auth_sessions_revoked_pair_ck" CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
	CONSTRAINT "auth_sessions_expiry_order_ck" CHECK (idle_expires_at <= absolute_expires_at)
);
--> statement-breakpoint
CREATE TABLE "app"."investor_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"investor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value_enc" "bytea" NOT NULL,
	"value_bidx" "bytea" NOT NULL,
	"masked" text NOT NULL,
	"verified_at" timestamp (6) with time zone NOT NULL,
	"status" text NOT NULL,
	"superseded_at" timestamp (6) with time zone,
	CONSTRAINT "investor_contacts_value_uq" UNIQUE("investor_id","kind","value_bidx"),
	CONSTRAINT "investor_contacts_kind_ck" CHECK (kind IN ('MOBILE', 'EMAIL')),
	CONSTRAINT "investor_contacts_status_ck" CHECK (status IN ('CURRENT', 'PREVIOUS', 'REVOKED'))
);
--> statement-breakpoint
CREATE TABLE "app"."investor_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"investor_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"device_ref_hash" "bytea" NOT NULL,
	"app_version" text,
	"os_version" text,
	"last_seen_at" timestamp (6) with time zone,
	"revoked_at" timestamp (6) with time zone,
	CONSTRAINT "investor_devices_ref_uq" UNIQUE("investor_id","device_ref_hash"),
	CONSTRAINT "investor_devices_platform_ck" CHECK (platform IN ('WEB', 'ANDROID'))
);
--> statement-breakpoint
CREATE TABLE "app"."investors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"mobile_enc" "bytea" NOT NULL,
	"mobile_bidx" "bytea" NOT NULL,
	"mobile_last4" char(4) NOT NULL,
	"mobile_verified_at" timestamp (6) with time zone NOT NULL,
	"email_enc" "bytea",
	"email_bidx" "bytea",
	"email_masked" text,
	"email_verified_at" timestamp (6) with time zone,
	"display_name" text,
	"first_order_at" timestamp (6) with time zone,
	"closed_at" timestamp (6) with time zone,
	"can_purchase" boolean DEFAULT false NOT NULL,
	"can_exit" boolean DEFAULT false NOT NULL,
	"purchase_block_reason" text,
	"exit_block_reason" text,
	"last_contact_change_at" timestamp (6) with time zone,
	"last_bank_change_at" timestamp (6) with time zone,
	"fp_investor_profile_id" text,
	"fp_mf_investment_account_id" text,
	"fp_mfia_old_id" bigint,
	"fp_phone_id" text,
	"fp_email_id" text,
	"fp_address_id" text,
	CONSTRAINT "investors_mobile_bidx_uq" UNIQUE("mobile_bidx"),
	CONSTRAINT "investors_email_bidx_uq" UNIQUE("email_bidx"),
	CONSTRAINT "investors_fp_investor_profile_id_uq" UNIQUE("fp_investor_profile_id"),
	CONSTRAINT "investors_fp_mfia_id_uq" UNIQUE("fp_mf_investment_account_id"),
	CONSTRAINT "investors_status_ck" CHECK (status IN ('ACTIVE', 'SUSPENDED', 'FRAUD_HOLD', 'CLOSURE_REQUESTED', 'CLOSED')),
	CONSTRAINT "investors_mobile_last4_ck" CHECK (mobile_last4 ~ '^[0-9]{4}$'),
	CONSTRAINT "investors_email_pair_ck" CHECK ((email_enc IS NULL) = (email_bidx IS NULL))
);
--> statement-breakpoint
CREATE TABLE "app"."otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"destination_enc" "bytea" NOT NULL,
	"destination_bidx" "bytea" NOT NULL,
	"destination_masked" text NOT NULL,
	"reference_id" uuid,
	"code_hmac" "bytea" NOT NULL,
	"pepper_kid" smallint NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"consumed_at" timestamp (6) with time zone,
	"consumed_reason" text,
	"ip" "inet",
	"device_ref_hash" "bytea",
	"provider" text,
	"provider_message_id" text,
	"template_id" text,
	"dlr_status" text,
	"dlr_at" timestamp (6) with time zone,
	CONSTRAINT "otp_codes_purpose_ck" CHECK (purpose IN ('LOGIN', 'NEW_DEVICE_STEPUP', 'EMAIL_FALLBACK_LOGIN', 'VERIFY_EMAIL', 'CONSENT', 'CONTACT_CHANGE_OLD', 'CONTACT_CHANGE_NEW', 'REAUTH')),
	CONSTRAINT "otp_codes_channel_ck" CHECK (channel IN ('SMS', 'EMAIL')),
	CONSTRAINT "otp_codes_attempts_ck" CHECK (attempts >= 0 AND attempts <= 5),
	CONSTRAINT "otp_codes_consumed_reason_ck" CHECK (consumed_reason IN ('VERIFIED', 'EXPIRED', 'LOCKED', 'SUPERSEDED')),
	CONSTRAINT "otp_codes_consumed_pair_ck" CHECK ((consumed_at IS NULL) = (consumed_reason IS NULL)),
	CONSTRAINT "otp_codes_provider_ck" CHECK (provider IN ('MSG91', 'SES'))
);
--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."auth_sessions" ADD CONSTRAINT "auth_sessions_device_id_investor_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "app"."investor_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."investor_contacts" ADD CONSTRAINT "investor_contacts_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."investor_devices" ADD CONSTRAINT "investor_devices_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_investor_live_idx" ON "app"."auth_sessions" USING btree ("investor_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "investor_contacts_current_uq" ON "app"."investor_contacts" USING btree ("investor_id","kind") WHERE status = 'CURRENT';--> statement-breakpoint
CREATE UNIQUE INDEX "otp_codes_live_scope_uq" ON "app"."otp_codes" USING btree ("purpose","destination_bidx",coalesce(reference_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE consumed_at IS NULL;--> statement-breakpoint
CREATE INDEX "otp_codes_destination_created_idx" ON "app"."otp_codes" USING btree ("destination_bidx","created_at");--> statement-breakpoint
CREATE INDEX "otp_codes_ip_created_idx" ON "app"."otp_codes" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "otp_codes_device_created_idx" ON "app"."otp_codes" USING btree ("device_ref_hash","created_at");