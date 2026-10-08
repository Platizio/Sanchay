-- PRV-2: a provisioning run that ran out of pg-boss retries (an FP outage) stays IN_PROGRESS and nothing marks it
-- FAILED. Past its attest challenge's saga window it can never finish (useConsumed gives CONSENT_EXPIRED), so ops
-- must see it next to the FAILED rows (docs/runbooks/provisioning-failed.md). Same columns as 0025, so the grant stays.
CREATE OR REPLACE VIEW "app"."v_onboarding_blocked" AS
  SELECT a.investor_id, a.stage, a.provisioning_step, a.provisioning_status, a.provisioning_failed_reason, a.updated_at
  FROM "app"."onboarding_applications" a
  LEFT JOIN "app"."consent_challenges" c ON c.id = a.attest_challenge_id
  WHERE a.provisioning_status = 'FAILED'
     OR (a.provisioning_status = 'IN_PROGRESS' AND c.saga_expires_at < now());
