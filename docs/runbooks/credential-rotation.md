# Runbook: credential rotation

Scope: `SANCHAY_FP_CREDENTIALS_JSON`, `SANCHAY_MSG91_CREDENTIALS_JSON`, `SANCHAY_KEYRING_JSON`, and the RDS
master secret, all in AWS Secrets Manager `sanchay/{env}/*` (R-19 owning containers).

## Before you rotate the DB master secret
1. Confirm a recent automated PITR restore succeeded into a scratch instance (G-E5). This is not asserted by
   a CDK unit test — the CDK stack only proves `BackupRetentionPeriod: 14` and `DeletionProtection: true`;
   restorability is verified manually, quarterly, by restoring to a scratch RDS instance and running
   `pnpm --filter=@sanchay/api db:check` against it.
2. Page the on-call developer; rotation is not silent.

## Rotation steps (any of the four secrets)
1. Create a new secret version in Secrets Manager (do not overwrite the current version in place).
2. `aws ecs update-service --cluster sanchay-{env} --service sanchay-{env} --force-new-deployment` so the
   `api` and `worker` tasks re-read the secret on the next task launch (they read it once at boot).
3. Watch the `sanchay-{env}-alb-5xx` and `sanchay-{env}-worker-heartbeat-stale` alarms for 15 minutes; a
   failed rotation shows there first.
4. Only after the new tasks are healthy, delete the previous secret version (Secrets Manager keeps one
   previous version by default; do not delete `AWSPREVIOUS` until this step).
5. Record the rotation (who, when, which secret) in the ops log; `SANCHAY_FP_CREDENTIALS_JSON` rotations
   also need a Cybrilla-side confirmation that the old client secret was revoked.

## If an alarm fires mid-rotation
- `sanchay-{env}-alb-5xx` or `sanchay-{env}-target-unhealthy`: the new tasks cannot reach the DB or FP with
  the new secret. Roll back by force-deploying the previous task definition (secrets are read by ARN +
  version stage, so the previous `AWSPREVIOUS` stage must still exist — see step 4).
- `sanchay-{env}-worker-heartbeat-stale`: the worker task is crash-looping on boot (bad `SANCHAY_FP_CREDENTIALS_JSON`
  shape). Check `aws ecs execute-command` logs before rolling back.

Owner: on-call developer (Dev A primary, Dev B secondary; rota per G-B12). Gate: G-E8 item 9. Sections below
were appended by F24 so this runbook has the shared G-E8 shape; the F1 steps above are unchanged.

## When to use
- Scheduled rotation, a team member leaves, or a secret may have been exposed (pasted in a chat, committed,
  printed in a log, laptop lost). A possible exposure is also a security incident: open
  [CERT-In 6 h report](cert-in-6h.md) in parallel.
- `SANCHAY_FP_WEBHOOK_SECRET` (api only) follows the same steps; Cybrilla must switch to the new secret at the
  same time, otherwise `sanchay-{env}-webhook-signature-failures` fires (see [FP outage](fp-outage.md)).

## Detect
- gitleaks (pre-commit and CI) reports a finding, or a reviewer sees a secret value outside Secrets Manager.
- AWS CloudTrail shows `GetSecretValue` on `sanchay/{env}/*` from a principal other than the ECS task roles.

## Act
1. Follow "Before you rotate the DB master secret" when the RDS secret is in scope.
2. Follow "Rotation steps" above, one secret at a time.
3. A leaked FP or MSG91 credential: ask Cybrilla or MSG91 to revoke the old one first, then rotate. While the
   FP credential is revoked and not yet replaced, orders cannot reach FP: turn orders off with
   [Kill switch](kill-switch.md).
4. A leaked `SANCHAY_KEYRING_JSON`: add a new key id as current (old ids stay for decryption), force-deploy,
   and record it for the P2 re-encryption backlog; never remove an old key id that still decrypts rows.

## Verify
- `aws ecs describe-services --cluster sanchay-<env> --services sanchay-<env>` shows the new deployment
  `PRIMARY` with `runningCount` equal to `desiredCount` and the old deployment drained.
- `curl.exe -s https://api.sanchay.in/api/v1/health` returns status 200 with the DB reachable.
- The four alarms named above stay `OK` for 15 minutes; one sandbox (dev) or founder (prod) sign-in succeeds,
  which proves the MSG91 secret.

## Escalate
- A rotation that cannot be completed within 1 hour: PO and both developers; keep orders off.
- Evidence that a secret was used by someone else: [CERT-In 6 h report](cert-in-6h.md) and, if personal data
  could be read, [DPDP breach](dpdp-breach.md).

## Evidence
- `docs/probes/incidents/<yyyy-mm-dd>-credential-rotation.md`: secret name (never its value), old and new
  version ids, who ran each step, alarm states, Cybrilla or MSG91 revocation confirmation.
