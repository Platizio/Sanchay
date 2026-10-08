-- Custom SQL migration file, put your code below! --
-- investors.current_risk_profile_id is a plain column in 0018 (risk_profiles references investors, so the schema
-- file cannot reference risk_profiles from inside the investors table); the FK is added here.
ALTER TABLE app.investors
  ADD CONSTRAINT investors_current_risk_profile_fk FOREIGN KEY (current_risk_profile_id) REFERENCES app.risk_profiles(id);
--> statement-breakpoint
-- Append-only evidence of a suitability acknowledgement (0003_grants.sql: ALTER DEFAULT PRIVILEGES grants UPDATE and DELETE on every new app table, so this REVOKE is required).
REVOKE UPDATE, DELETE ON app.suitability_acknowledgements FROM sanchay_app;
