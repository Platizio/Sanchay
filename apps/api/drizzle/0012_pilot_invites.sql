CREATE TABLE "app"."pilot_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"mobile_bidx" "bytea" NOT NULL,
	"invited_by" text NOT NULL,
	"note" text,
	"expires_at" timestamp (6) with time zone NOT NULL,
	"used_at" timestamp (6) with time zone,
	CONSTRAINT "pilot_invites_mobile_bidx_uq" UNIQUE("mobile_bidx")
);
--> statement-breakpoint
CREATE INDEX "pilot_invites_live_idx" ON "app"."pilot_invites" USING btree ("mobile_bidx") WHERE used_at IS NULL;