-- Readiness (E11): app.investors.can_purchase / can_exit and their block reasons are derived, never set by hand.
-- app.trg_investor_readiness() recomputes them from three facts: provisioning DONE, a VERIFIED bank account and an
-- ACTIVE, unexpired risk profile. The three triggers are deferred constraint triggers, so a transaction that flips
-- several of the facts is evaluated once at COMMIT. deriveReadiness() in readiness.ts is the TypeScript mirror and
-- onboarding-readiness.int.test.ts pins the two equal.
CREATE FUNCTION "app"."trg_investor_readiness"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_investor_id uuid;
  v_provisioning_done boolean;
  v_bank_verified boolean;
  v_risk_valid boolean;
BEGIN
  v_investor_id := NEW.investor_id;

  -- An investor with no application row is simply not provisioned (the SELECT yields NULL, not a row).
  SELECT oa.provisioning_status = 'DONE' INTO v_provisioning_done
    FROM app.onboarding_applications oa
    WHERE oa.investor_id = v_investor_id;
  v_provisioning_done := COALESCE(v_provisioning_done, false);

  SELECT EXISTS (
    SELECT 1 FROM app.bank_accounts ba WHERE ba.investor_id = v_investor_id AND ba.status = 'VERIFIED'
  ) INTO v_bank_verified;

  SELECT EXISTS (
    SELECT 1 FROM app.risk_profiles rp
    WHERE rp.investor_id = v_investor_id AND rp.status = 'ACTIVE' AND rp.expires_at > now()
  ) INTO v_risk_valid;

  UPDATE app.investors
  SET
    can_purchase = v_provisioning_done AND v_bank_verified AND v_risk_valid,
    can_exit = v_provisioning_done AND v_bank_verified,
    purchase_block_reason = CASE
      WHEN NOT v_provisioning_done THEN 'PROVISIONING_INCOMPLETE'
      WHEN NOT v_bank_verified THEN 'BANK_NOT_VERIFIED'
      WHEN NOT v_risk_valid THEN 'RISK_PROFILE_INVALID'
      ELSE NULL
    END,
    exit_block_reason = CASE
      WHEN NOT v_provisioning_done THEN 'PROVISIONING_INCOMPLETE'
      WHEN NOT v_bank_verified THEN 'BANK_NOT_VERIFIED'
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = v_investor_id;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "trg_investor_readiness_onboarding"
  AFTER INSERT OR UPDATE OF provisioning_status ON "app"."onboarding_applications"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "app"."trg_investor_readiness"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "trg_investor_readiness_bank"
  AFTER INSERT OR UPDATE OF status ON "app"."bank_accounts"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "app"."trg_investor_readiness"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "trg_investor_readiness_risk"
  AFTER INSERT OR UPDATE OF status ON "app"."risk_profiles"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "app"."trg_investor_readiness"();
--> statement-breakpoint
-- Ops view: the applications whose provisioning failed (E11; docs/runbooks/provisioning-failed.md).
CREATE VIEW "app"."v_onboarding_blocked" AS
  SELECT investor_id, stage, provisioning_step, provisioning_status, provisioning_failed_reason, updated_at
  FROM "app"."onboarding_applications"
  WHERE provisioning_status = 'FAILED';
--> statement-breakpoint
GRANT SELECT ON "app"."v_onboarding_blocked" TO "sanchay_readonly";
