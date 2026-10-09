-- Custom SQL migration file, put your code below! --
-- E20 orders guard. order_events is append-only (0003_grants.sql: ALTER DEFAULT PRIVILEGES grants UPDATE and
-- DELETE on every new app table, so this REVOKE is required).
REVOKE UPDATE, DELETE ON "app"."order_events" FROM "sanchay_app";
--> statement-breakpoint
-- LC-6 (ML-14): only a CONSUMED challenge lets a subject row reach its guarded status. 0016 also accepted
-- CONSUMED_UNUSED, which no path needs (ConsentEngine.useConsumed refuses it). Only the challenge-status
-- predicate changes; every table that attaches the function (orders here, plans and mandates in F2) inherits it.
CREATE OR REPLACE FUNCTION app.trg_consent_guard() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.consent_subjects cs JOIN app.consent_challenges cc ON cc.id = cs.challenge_id
    WHERE cs.subject_table = TG_TABLE_NAME AND cs.subject_id = NEW.id
      AND cs.status = 'CONSENTED' AND cc.status = 'CONSUMED'
  ) THEN
    RAISE EXCEPTION 'trg_consent_guard: % row % has no CONSUMED consent', TG_TABLE_NAME, NEW.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- No order reaches SUBMITTING (the first FP write) without a CONSUMED PURCHASE consent (spec §4.1, GAP-01).
CREATE TRIGGER "trg_orders_consent_guard"
  BEFORE UPDATE OF status ON "app"."orders"
  FOR EACH ROW
  WHEN (NEW.status = 'SUBMITTING' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "app"."trg_consent_guard"();
--> statement-breakpoint
-- H1 (D-MONEY-096): suitability_checks.order_id had no FK until orders existed (risk-profile.schema.ts; precedent 0022).
ALTER TABLE "app"."suitability_checks" ADD CONSTRAINT "suitability_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "app"."orders"("id") ON DELETE restrict;
