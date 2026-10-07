-- app.trg_consent_guard(): attach with
--   CREATE TRIGGER <name> BEFORE UPDATE ON <subject_table> FOR EACH ROW
--     WHEN (NEW.status = '<guarded status>') EXECUTE FUNCTION app.trg_consent_guard();
-- Each subject table's own migration attaches it (orders in E20, plans and mandates in F2); it does not
-- reference any subject table by name, so it works unmodified for every table that attaches it.
CREATE FUNCTION app.trg_consent_guard() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app.consent_subjects cs
    JOIN app.consent_challenges cc ON cc.id = cs.challenge_id
    WHERE cs.subject_table = TG_TABLE_NAME
      AND cs.subject_id = NEW.id
      AND cs.status = 'CONSENTED'
      AND cc.status IN ('CONSUMED', 'CONSUMED_UNUSED')
  ) THEN
    RAISE EXCEPTION 'trg_consent_guard: % row % has no CONSUMED consent', TG_TABLE_NAME, NEW.id
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
