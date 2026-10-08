-- Custom SQL migration file, put your code below! --
-- ConsentEngine.useConsumed stamps first_attempt_at once per saga (RV-03-1). 0015 revokes UPDATE on the whole table from sanchay_app
-- (consent records are append-only evidence); this column-level grant lets the app role stamp that one column and keeps every other column immutable.
GRANT UPDATE ("first_attempt_at") ON "app"."consent_records" TO "sanchay_app";
