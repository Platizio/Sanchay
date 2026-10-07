-- Custom SQL migration file, put your code below! --
-- Append-only evidence of consent (design §C.1; see 0003_grants.sql). ALTER DEFAULT PRIVILEGES in 0003 grants UPDATE and DELETE on every new app table, so this REVOKE is required.
REVOKE UPDATE, DELETE ON app.consent_records FROM sanchay_app;
