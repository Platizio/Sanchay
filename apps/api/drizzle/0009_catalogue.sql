CREATE TABLE "app"."amcs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"fp_fund_name" text,
	"empanelled" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "amcs_slug_uq" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app"."category_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"alias" text NOT NULL,
	"source" text NOT NULL,
	"category_code" text NOT NULL,
	CONSTRAINT "category_aliases_alias_source_uq" UNIQUE("alias","source")
);
--> statement-breakpoint
CREATE TABLE "app"."commission_disclosures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"amc_id" uuid,
	"scheme_id" uuid,
	"disclosure_key" text NOT NULL,
	"trail_min_bps" smallint NOT NULL,
	"trail_max_bps" smallint NOT NULL,
	"kind" text NOT NULL,
	"effective_from" date NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "commission_disclosures_key_uq" UNIQUE("disclosure_key"),
	CONSTRAINT "commission_disclosures_kind_ck" CHECK (kind IN ('EXACT', 'RANGE')),
	CONSTRAINT "commission_disclosures_scope_ck" CHECK ((amc_id IS NOT NULL) <> (scheme_id IS NOT NULL)),
	CONSTRAINT "commission_disclosures_range_ck" CHECK (trail_min_bps <= trail_max_bps)
);
--> statement-breakpoint
CREATE TABLE "app"."fund_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"scheme_id" uuid NOT NULL,
	"expense_ratio_pct" numeric(5, 2),
	"expense_ratio_as_of" date,
	"riskometer" text,
	"riskometer_as_of" date,
	"benchmark_name" text,
	"benchmark_riskometer" text,
	"exit_load_text" text,
	"sid_url" text,
	"kim_url" text,
	"field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completeness" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "fund_facts_scheme_uq" UNIQUE("scheme_id"),
	CONSTRAINT "fund_facts_riskometer_ck" CHECK (riskometer IN ('LOW', 'LOW_TO_MODERATE', 'MODERATE', 'MODERATELY_HIGH', 'HIGH', 'VERY_HIGH')),
	CONSTRAINT "fund_facts_benchmark_riskometer_ck" CHECK (benchmark_riskometer IN ('LOW', 'LOW_TO_MODERATE', 'MODERATE', 'MODERATELY_HIGH', 'HIGH', 'VERY_HIGH')),
	CONSTRAINT "fund_facts_completeness_ck" CHECK (completeness BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "app"."fund_facts_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "fund_facts_revisions_source_ck" CHECK (source IN ('ADMIN', 'CYBRILLA', 'AMFI'))
);
--> statement-breakpoint
CREATE TABLE "app"."market_holidays" (
	"holiday_date" date PRIMARY KEY NOT NULL,
	"kinds" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."nav_history" (
	"isin" text NOT NULL,
	"nav_date" date NOT NULL,
	"nav" numeric(18, 6) NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nav_history_isin_nav_date_pk" PRIMARY KEY("isin","nav_date"),
	CONSTRAINT "nav_history_nav_ck" CHECK (nav > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."nav_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"started_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp (6) with time zone,
	"kind" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"rows_parsed" integer,
	"rows_matched" integer,
	"rows_quarantined" integer,
	"rows_future_dated" integer,
	"max_nav_date" date,
	"failure_reason" text,
	CONSTRAINT "nav_sync_runs_kind_ck" CHECK (kind IN ('DAILY_2130', 'DAILY_2330', 'DAILY_0700', 'DAILY_1030', 'HISTORY_BACKFILL')),
	CONSTRAINT "nav_sync_runs_status_ck" CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "app"."scheme_navs" (
	"isin" text PRIMARY KEY NOT NULL,
	"nav" numeric(18, 6) NOT NULL,
	"nav_date" date NOT NULL,
	"prev_nav" numeric(18, 6),
	"prev_nav_date" date,
	"quarantined" boolean DEFAULT false NOT NULL,
	"scheme_name_snapshot" text,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheme_navs_isin_ck" CHECK (isin ~ '^INF[A-Z0-9]{9}$'),
	CONSTRAINT "scheme_navs_nav_ck" CHECK (nav > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."scheme_returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scheme_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"cagr_1y" numeric(7, 4),
	"cagr_3y" numeric(7, 4),
	"cagr_5y" numeric(7, 4),
	"abs_6m" numeric(7, 4),
	"display_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheme_returns_scheme_as_of_uq" UNIQUE("scheme_id","as_of")
);
--> statement-breakpoint
CREATE TABLE "app"."schemes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"isin" text NOT NULL,
	"amfi_scheme_code" text,
	"amc_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan_type" text DEFAULT 'REGULAR' NOT NULL,
	"option" text DEFAULT 'GROWTH' NOT NULL,
	"category_code" text NOT NULL,
	"lock_in_months" smallint,
	"is_elss" boolean GENERATED ALWAYS AS ((category_code = 'EQ_ELSS')) STORED NOT NULL,
	"fp_active" boolean DEFAULT false NOT NULL,
	"purchase_allowed" boolean DEFAULT false NOT NULL,
	"redemption_allowed" boolean DEFAULT false NOT NULL,
	"sip_allowed" boolean DEFAULT false NOT NULL,
	"thresholds" jsonb,
	"sip_dates" jsonb,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"curated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "schemes_isin_uq" UNIQUE("isin"),
	CONSTRAINT "schemes_slug_uq" UNIQUE("slug"),
	CONSTRAINT "schemes_isin_ck" CHECK (isin ~ '^INF[A-Z0-9]{9}$'),
	CONSTRAINT "schemes_plan_type_ck" CHECK (plan_type IN ('REGULAR')),
	CONSTRAINT "schemes_option_ck" CHECK (option IN ('GROWTH', 'IDCW_PAYOUT', 'IDCW_REINVESTMENT')),
	CONSTRAINT "schemes_status_ck" CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUSPENDED'))
);
--> statement-breakpoint
CREATE TABLE "app"."sebi_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"code" text NOT NULL,
	"asset_class" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sebi_ref" text,
	"cutoff_class" text NOT NULL,
	"volatility_class" text NOT NULL,
	CONSTRAINT "sebi_categories_code_uq" UNIQUE("code"),
	CONSTRAINT "sebi_categories_slug_uq" UNIQUE("slug"),
	CONSTRAINT "sebi_categories_asset_class_ck" CHECK (asset_class IN ('EQUITY', 'DEBT', 'HYBRID', 'LIFE_CYCLE', 'OTHER', 'LEGACY')),
	CONSTRAINT "sebi_categories_cutoff_class_ck" CHECK (cutoff_class IN ('STANDARD', 'LIQUID', 'OVERNIGHT', 'INTERNATIONAL')),
	CONSTRAINT "sebi_categories_volatility_class_ck" CHECK (volatility_class IN ('V_HIGH', 'V_EQUITY', 'V_HYBRID', 'V_DEBT', 'V_CASH'))
);
--> statement-breakpoint
ALTER TABLE "app"."category_aliases" ADD CONSTRAINT "category_aliases_category_code_sebi_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "app"."sebi_categories"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."commission_disclosures" ADD CONSTRAINT "commission_disclosures_amc_id_amcs_id_fk" FOREIGN KEY ("amc_id") REFERENCES "app"."amcs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."commission_disclosures" ADD CONSTRAINT "commission_disclosures_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "app"."schemes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fund_facts" ADD CONSTRAINT "fund_facts_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "app"."schemes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."fund_facts_revisions" ADD CONSTRAINT "fund_facts_revisions_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "app"."schemes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."scheme_returns" ADD CONSTRAINT "scheme_returns_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "app"."schemes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."schemes" ADD CONSTRAINT "schemes_amc_id_amcs_id_fk" FOREIGN KEY ("amc_id") REFERENCES "app"."amcs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."schemes" ADD CONSTRAINT "schemes_category_code_sebi_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "app"."sebi_categories"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fund_facts_revisions_scheme_idx" ON "app"."fund_facts_revisions" USING btree ("scheme_id","created_at");--> statement-breakpoint
CREATE INDEX "scheme_navs_nav_date_idx" ON "app"."scheme_navs" USING btree ("nav_date");--> statement-breakpoint
CREATE INDEX "schemes_name_trgm_idx" ON "app"."schemes" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "schemes_category_idx" ON "app"."schemes" USING btree ("category_code");--> statement-breakpoint
-- Append-only table (design §C.1): same REVOKE as 0003_grants.sql for audit_events.
REVOKE UPDATE, DELETE ON app.fund_facts_revisions FROM sanchay_app;
