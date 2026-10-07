# ADR-0014: Minimal AWS topology — single ECS service, ALB only

- Status: Accepted (Sprint 2, week of 2026-10-19)
- Deciders: Dev A, lead
- Related: R-05, R-11, R-12, R-15, R-16, R-19, R-31; ADR-0001 (versions); ADR-0005 (hosts, H-1)

## Context
R-31: there is no AWS dev environment and no dev domain; development runs locally (docker compose:
PostgreSQL, Mailpit). The one AWS stack is prod, deployed in Sprint 2 week 2 so that the production
hosts, the NAT EIP that Cybrilla allowlists, the webhook and payment-return URLs and the deploy
pipeline exist about five weeks before GO-1. It stays paused (closed to investors) until GO-1.

## Decision
- One stack, `SanchayMvpStack-prod`: one VPC (2 AZs, 1 NAT with a stable EIP for Cybrilla's IP
  allowlist), one ALB, one ECS Fargate ARM64 service, `sanchay-app` in cluster `sanchay-prod`,
  running three containers (`web`, `api`, `worker`) from one task definition — not three services —
  to keep the stack cheap and the ALB routing simple.
- Paused until GO-1 (R-31): the service runs and answers on `www`, `app` and `api.sanchay.in`, but no
  investor can transact. Sign-in is invite-only (D7; boot invariant 10 refuses
  `SANCHAY_PILOT_INVITE_ONLY=false` in prod), RuntimeConfig's `orders.enabled` and `plans.sip.enabled`
  stay at their D1 default (false; nothing in the stack sets them), and no invite is added before
  GO-1 except the founders' test accounts. There is no ALB ingress allow-list. F1 (Plan 04) hardens
  this stack in Sprint 4 (D6 logins, ops task definition, alarms); there is no second environment.
- Host-based ALB listener rules (R-11): `api.sanchay.in` (any path) and `app.sanchay.in` +
  `/api/v1/*` both forward to the api target group; everything else on `app.sanchay.in` and all of
  `www.sanchay.in` forwards to the web target group. The apex `sanchay.in` answers 301 to
  `www.sanchay.in` (spec §2.4, H-1). The four names are alias records in the `sanchay.in` hosted
  zone, which also validates the one ACM certificate (`*.sanchay.in` and `sanchay.in`).
- `/api/v1/health` is the only health-check path (liveness only, R-12). Both target groups probe it
  on the task's api port: the web container (Next.js) serves no `/api/v1/*` route in AWS, and a
  crashed web process still stops the task because every container is essential. NAV staleness is
  a CloudWatch alarm plus a per-scheme AGED grade, not a readiness probe, so a stale catalogue sync
  never takes the whole app down; the alarm and its metric source arrive with F1 (Plan 04).
- RDS PostgreSQL 18.6 (Multi-AZ, 14-day backups, deletion protection, `db.t4g.medium`),
  `rds.force_ssl=1`, `StorageEncrypted: true`, reachable only from the ECS service security group;
  the app connects with `sslmode=verify-full` against the RDS global CA bundle baked into the api
  image (R-15). The master login is `sanchay_master` (secret `sanchay/prod/db-master`), never
  `sanchay_app`, the NOLOGIN role the migrations grant to. The migrate task uses the master; api and
  worker share it until F1 adds the `sanchay_app_login` LOGIN role (secret `sanchay/prod/db-app`).
- FP credentials (`sanchay/prod/fp`) go into the `worker` container only; the FP webhook secret
  and the SMS Retriever hash into `api` only; the keyring (`sanchay/prod/keyring`) into `api`,
  `worker` and the one-off `migrate` task, whose boot guard checks it too (R-19 owning containers).
- Values that differ per deploy and that the boot guard needs (`SANCHAY_PLATFORM_ARN`,
  `SANCHAY_SMS_RETRIEVER_HASH`) are read from the deploy environment at synth; the stack refuses
  to synthesise without them.
- The stack creates the account's GitHub OIDC provider and a deploy role that trusts only jobs of
  the GitHub `prod` environment (both founders are its required reviewers) in the repository named
  by the deploy input `SANCHAY_GITHUB_REPOSITORY` (OIDC `sub` `repo:<owner>/<repo>:environment:prod`,
  matched exactly; `deploy.yml` passes `github.repository`). The role may do only what `deploy.yml`
  does. The owner is never written into code, and `bin/sanchay.ts` refuses a synth or deploy without
  it.
- ECS Exec is enabled with command logging to CloudWatch (R-16); a one-off Fargate task
  definition (not a `Service`) runs `db:migrate` with `aws ecs run-task` before each deploy:
  `deploy.yml` runs it after pushing the images and before `cdk deploy`, and a non-zero exit
  stops the deploy (spec §2.4).
- Logs and images (R-34): every container logs to `/sanchay/prod/app` (400 days; each container has
  its own awslogs streams) and ECS Exec sessions to `/sanchay/prod/ecs-exec`; the images go to
  `sanchay-prod-api` and `sanchay-prod-web` (the last 20 each). Both log groups and both repositories
  survive a stack teardown or rename and are removed only after a failed first create
  (`RetainExceptOnCreate`). A customer-managed KMS key and any split of the log group wait for Phase 2.
- Images are linux/arm64. `deploy.yml` builds them on x86_64 runners under QEMU (the
  `tonistiigi/binfmt` installer, pinned by digest).
- `.github/workflows/deploy.yml` is manual dispatch only, with `prod` its only environment; it
  authenticates over GitHub OIDC (no long-lived AWS keys) via a scripted
  `sts assume-role-with-web-identity` call, reusing `ci.yml`'s already-pinned
  `actions/checkout`/`pnpm/action-setup`/`actions/setup-node` SHAs rather than adding new,
  unresolved third-party action pins.

## Hosts
`www.sanchay.in` (the public site, `/site`), `app.sanchay.in` (the web app and
`/.well-known/assetlinks.json`), `api.sanchay.in` (the mobile API, FP webhooks and payment returns);
the apex `sanchay.in` redirects to `www`. There are no dev hosts: the delegated dev zone (PB-41) is
moot (R-31), and local development runs on docker compose.

## First deploy (manual, once)
Owner prerequisites (R-31): the prod AWS account, with no IAM OIDC provider for
`token.actions.githubusercontent.com` yet (`aws iam list-open-id-connect-providers` lists none: the
stack creates it); `sanchay.in` registered (R-22), with its public hosted zone in that
account and the registrar's name servers pointing at the zone; the GitHub environment `prod`, with both
founders as required reviewers. The stack creates the ECR repositories
empty and the provider secrets with placeholder values, so the first deploy creates the service with
no tasks. One command per line; replace each `<...>` by hand and keep secret files outside the
repository. Run from the repo root with AWS credentials for the prod account.

1. Once per account and region: `pnpm --filter=@sanchay/infra exec cdk bootstrap aws://<account-id>/ap-south-1`
2. Create the stack with the service at 0 tasks. `<owner>/<repo>` is this repository exactly as
   GitHub prints it (the `origin` remote's path), the value `deploy.yml` later passes. Until the Play
   App Signing certificate exists (F18), the retriever hash is any 11 characters of `[A-Za-z0-9+/]`:
   it boots the api, and Android's SMS auto-read simply does not match it.
   - PowerShell: `$env:SANCHAY_GITHUB_REPOSITORY='<owner>/<repo>'; $env:SANCHAY_PLATFORM_ARN='<ARN-digits>'; $env:SANCHAY_SMS_RETRIEVER_HASH='<hash>'; pnpm --filter=@sanchay/infra exec cdk deploy -c noTasks=true`
   - Git Bash: `SANCHAY_GITHUB_REPOSITORY='<owner>/<repo>' SANCHAY_PLATFORM_ARN='<ARN-digits>' SANCHAY_SMS_RETRIEVER_HASH='<hash>' pnpm --filter=@sanchay/infra exec cdk deploy -c noTasks=true`
3. Put the real values into the four provider secrets (`sanchay/prod/keyring`, `sanchay/prod/fp`,
   `sanchay/prod/fp-webhook`, `sanchay/prod/msg91`), one command per secret:
   `aws secretsmanager put-secret-value --secret-id sanchay/prod/keyring --secret-string file://<path-outside-the-repo>`
   Until a provider issues its production value (Cybrilla's FP credentials: R-21, by Mon 11-16),
   store a well-formed placeholder in the shape the boot guard checks: D3's `FpCredentialsSchema` for
   `fp` (the worker parses it at boot) and D6's `Msg91CredentialsSchema` for `msg91` (boot invariant
   11, api and worker). The containers refuse to start on anything else, and the provider refuses
   the placeholder until the real values replace it (F1's credential-rotation runbook).
4. On the GitHub `prod` environment, set the variables `SANCHAY_DEPLOY_ROLE_ARN` (stack output
   `GithubDeployRoleArn`), `SANCHAY_AWS_ACCOUNT_ID`, `SANCHAY_PLATFORM_ARN`,
   `SANCHAY_PLATFORM_ARN_VALID_TILL` (the web image prerenders `/site` with both ARN values) and
   `SANCHAY_SMS_RETRIEVER_HASH`.
5. Build and push both images (outputs `ApiRepoUri`, `WebRepoUri`; Docker Desktop emulates arm64):
   - `aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com`
   - `docker build --platform linux/arm64 -f apps/api/Dockerfile -t <ApiRepoUri>:latest .`
   - `docker build --platform linux/arm64 -f apps/web/Dockerfile --build-arg SANCHAY_PLATFORM_ARN=<ARN-digits> --build-arg SANCHAY_PLATFORM_ARN_VALID_TILL=<yyyy-mm-dd> --build-arg SANCHAY_APP_ORIGIN=https://app.sanchay.in --build-arg SANCHAY_WWW_ORIGIN=https://www.sanchay.in -t <WebRepoUri>:latest .`
   - `docker push <ApiRepoUri>:latest`
   - `docker push <WebRepoUri>:latest`
6. Run the migrate task and check its exit code (outputs `MigrateTaskDefinitionArn`,
   `AppSubnetIds`, `ServiceSecurityGroupId`):
   - `aws ecs run-task --cluster sanchay-prod --launch-type FARGATE --task-definition <MigrateTaskDefinitionArn> --network-configuration "awsvpcConfiguration={subnets=[<AppSubnetIds>],securityGroups=[<ServiceSecurityGroupId>],assignPublicIp=DISABLED}" --query 'tasks[0].taskArn' --output text`
   - `aws ecs wait tasks-stopped --cluster sanchay-prod --tasks <taskArn>`
   - `aws ecs describe-tasks --cluster sanchay-prod --tasks <taskArn> --query 'tasks[0].containers[0].exitCode'` (expect `0`)
7. Dispatch `deploy.yml` for `prod`, and a founder approves the `prod` environment. GitHub runs a
   dispatched workflow only when its file is on the default branch, so this waits for `main` to
   carry `deploy.yml`. The run rebuilds and pushes the images, runs the migrate task again (step 6
   left nothing to apply), runs `cdk deploy` without the flag (two tasks), forces a new deployment
   and fails unless that rollout completes.
8. Commit `infra/cdk.context.json` (the hosted-zone and availability-zone lookups from step 2)
   after `pnpm exec biome check --write infra/cdk.context.json`.
9. Register the stack output `NatEipAddress` with Cybrilla (the production IP allowlist, G-B7), and
   give Cybrilla the webhook URL `https://api.sanchay.in/api/v1/webhooks/fp`.

Every later deploy: dispatch `deploy.yml`; a founder approves it. It runs the migrate task (step 6)
itself, after pushing the images and before `cdk deploy`, and stops on a non-zero exit.

## Consequences
- F1 (Plan 04) hardens this stack in place (D6 logins, ops task definition, gauges and alarms)
  instead of adding a second environment or a duplicated stack file.
- Everything in `infra/lib/sanchay-mvp-stack.ts` is covered by `infra/test/sanchay-mvp-stack.test.ts`
  CDK assertions, so a regression (for example a dropped `StorageEncrypted`) fails before any
  `cdk deploy`.
- Prod costs run from Sprint 2 (Multi-AZ RDS, the NAT gateway, the ALB, two tasks) for a stack that
  no investor uses before GO-1.
