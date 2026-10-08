CREATE TABLE "app"."declaration_stagings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"investor_id" uuid NOT NULL,
	"document_key" text NOT NULL,
	"document_version" text NOT NULL,
	"accepted_at" timestamp (6) with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"superseded_at" timestamp (6) with time zone,
	CONSTRAINT "declaration_stagings_key_ck" CHECK (document_key IN ('TNC', 'PRIVACY_NOTICE', 'RISK_DISCLOSURE', 'REGULAR_PLAN_COMMISSION', 'EXECUTION_ONLY_DECLARATION', 'FATCA_CRS_DECLARATION', 'NOMINATION_OPT_OUT_ANNEX_B'))
);
--> statement-breakpoint
ALTER TABLE "app"."declaration_stagings" ADD CONSTRAINT "declaration_stagings_investor_id_investors_id_fk" FOREIGN KEY ("investor_id") REFERENCES "app"."investors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "declaration_stagings_current_uq" ON "app"."declaration_stagings" USING btree ("investor_id","document_key") WHERE superseded_at IS NULL;