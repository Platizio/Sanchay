-- Deferred per-set sum check for app.nominees (H-12): the CURRENT rows of one (investor, set_version)
-- must total exactly 100. Constraint triggers fire at COMMIT, so a PUT may insert its rows one by one.
-- Rows that are not CURRENT (a replaced set) are skipped: marking a set REPLACED must not re-check it.
CREATE FUNCTION app.check_nominee_set_sum() RETURNS trigger AS $$
DECLARE
  total integer;
BEGIN
  IF NEW.status <> 'CURRENT' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(allocation_pct), 0) INTO total
  FROM app.nominees
  WHERE investor_id = NEW.investor_id AND set_version = NEW.set_version AND status = 'CURRENT';
  IF total <> 100 THEN
    RAISE EXCEPTION 'nominees set % for investor % sums to % (expected 100)',
      NEW.set_version, NEW.investor_id, total
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER trg_nominees_set_sum_100
AFTER INSERT OR UPDATE ON app.nominees
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.check_nominee_set_sum();