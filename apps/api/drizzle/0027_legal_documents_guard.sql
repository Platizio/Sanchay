-- Published legal text is evidence (LC-2, LC-3): acceptances, attest snapshots and R-18 re-accepts all point at it.
-- 1. A non-DRAFT row can no longer change its text, hash or date, nor go back to DRAFT. A new text is a new version.
CREATE FUNCTION "app"."trg_legal_documents_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
       NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
    OR NEW.sha256 IS DISTINCT FROM OLD.sha256
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'legal_documents % % is % and immutable: publish a new version instead', OLD.key, OLD.version, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "legal_documents_guard"
  BEFORE UPDATE ON "app"."legal_documents"
  FOR EACH ROW EXECUTE FUNCTION "app"."trg_legal_documents_guard"();
--> statement-breakpoint
-- 2. At most one PUBLISHED undated version per key, so "the version in force" is never a tie between undated rows.
-- A later version must carry effective_from (ops:legal:seed enforces it too).
CREATE UNIQUE INDEX "legal_documents_published_undated_uq"
  ON "app"."legal_documents" ("key")
  WHERE "status" = 'PUBLISHED' AND "effective_from" IS NULL;
