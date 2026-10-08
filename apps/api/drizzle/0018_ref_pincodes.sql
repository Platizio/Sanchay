CREATE TABLE "app"."ref_pincodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"pincode" char(6) NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "ref_pincodes_pincode_uq" UNIQUE("pincode")
);
