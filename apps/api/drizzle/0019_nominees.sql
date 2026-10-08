CREATE TABLE "app"."nomination_decisions" (
	"investor_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"decision" text NOT NULL,
	"effective_set_version" integer,
	"display_preference" boolean,
	"consent_record_id" uuid,
	"decided_at" timestamp (6) with time zone NOT NULL,
	CONSTRAINT "nomination_decisions_decision_ck" CHECK (decision IN ('NOT_ASKED', 'NOMINATED', 'OPTED_OUT')),
	CONSTRAINT "nomination_decisions_display_pref_ck" CHECK (decision <> 'NOMINATED' OR display_preference IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "app"."nominees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"investor_id" uuid NOT NULL,
	"set_version" integer NOT NULL,
	"position" smallint NOT NULL,
	"name_enc" "bytea" NOT NULL,
	"name_length" smallint NOT NULL,
	"relationship" text NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"dob_enc" "bytea",
	"guardian_name_enc" "bytea",
	"id_type" text,
	"id_value_enc" "bytea",
	"allocation_pct" smallint NOT NULL,
	"fp_related_party_id" text,
	"sent_to_fp_fields" jsonb,
	"status" text DEFAULT 'CURRENT' NOT NULL,
	CONSTRAINT "nominees_set_position_uq" UNIQUE("investor_id","set_version","position"),
	CONSTRAINT "nominees_position_ck" CHECK (position BETWEEN 1 AND 3),
	CONSTRAINT "nominees_name_length_ck" CHECK (name_length <= 40),
	CONSTRAINT "nominees_relationship_ck" CHECK (relationship IN ('FATHER', 'MOTHER', 'SPOUSE', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'GRANDFATHER', 'GRANDMOTHER', 'GRANDSON', 'GRANDDAUGHTER', 'OTHERS')),
	CONSTRAINT "nominees_id_type_ck" CHECK (id_type IN ('PAN', 'DRIVING_LICENCE', 'PASSPORT')),
	CONSTRAINT "nominees_status_ck" CHECK (status IN ('CURRENT', 'REPLACED')),
	CONSTRAINT "nominees_allocation_pct_ck" CHECK (allocation_pct BETWEEN 1 AND 100),
	CONSTRAINT "nominees_minor_dob_ck" CHECK ((NOT is_minor) OR (dob_enc IS NOT NULL AND guardian_name_enc IS NOT NULL)),
	CONSTRAINT "nominees_id_value_pair_ck" CHECK ((id_type IS NULL) = (id_value_enc IS NULL)),
	CONSTRAINT "nominees_pan_adult_ck" CHECK (id_type IS DISTINCT FROM 'PAN' OR NOT is_minor)
);
--> statement-breakpoint
ALTER TABLE "app"."nomination_decisions" ADD CONSTRAINT "nomination_decisions_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."nominees" ADD CONSTRAINT "nominees_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;