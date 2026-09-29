# Plan 04: MVP SIP, portfolio, redemption, prod (WORK IN PROGRESS)

> **Status: partial assembly.** This file is being rebuilt task by task against Plans 02 and 03 as built.
> Tasks present here: F1 (draft, not yet reviewed), F2 and F3 (reviewed and rewritten). The remaining tasks
> (F3–F28), the Global Constraints, the execution order and the errata are added as each task is reconciled.
> Do not execute any task from this file until this banner is removed.

## Assembly notes so far
- F2 owns `packages/domain/src/rules/sip-dates.ts` (firstInstalmentDate) and `modules/plans/sip-eligibility.ts` (assertSipEligible, sipSchemeOf, SipScheme, SIP_FLOOR, UPI_AUTOPAY_LIMIT, MAX_INSTALMENTS). F10: drop sip-dates.ts from Create, keep golden JSON + quote; import from `../plans/sip-eligibility.js`; contract/router/module are `modules/plans/*` (not orders); CutoffHolidays comes from E22's cutoff.ts (no re-declare). SipScheme fields are `sipMin/sipMax/sipMultiple/sipDates` (Money).
- All SIP/mandate code lives in `apps/api/src/modules/plans/` (PlansModule.forRoot). F3/F28 must edit there, not orders/ or payments/.
- F3 (done) extends F2 in place: `mandate-ladder.ts` in domain, `rail` on createSip, `mandates.auth_url_enc` (0028), `MandatesService.authUrlOf`. F2 FP calls are rail-generic (`authoriseMandate({mandateId, mandateType})`).
- Migrations: F2 = 0026 (generated plans_mandates), 0027 (custom plans_mandates_guard); F3 = 0028 (generated mandates_auth_url). Next free: 0029.
- Plan 02 errata RV-02-14 added D5 edges: PLAN UNDER_REVIEW->REJECTED|CONSENT_EXPIRED, CONFIRMING->REJECTED, SUBMITTING->REJECTED; MANDATE CONSENTED->CONSENT_EXPIRED, SUBMITTING->REJECTED.
- Known gap: mandate RECONCILING -> CRITICAL recon break MANDATE_CREATE_AMBIGUOUS (no FP mandate list-by-bank read in D3).
- New error codes: PLAN_STATE_INVALID, MANDATE_STATE_INVALID (409). Job names: mandates.submit, mandates.poll, plans.sip.submit, plans.sip.advance, plans.instalments.sync.
- FakeFp gained: purchasePlans store, mandate.get, mandateAuth.create, purchasePlan.create/get/list/update, purchase.list?plan=, advanceMandate, advancePlan, addInstalment; StoredPurchase.plan, StoredMandate.raw.
- Test helpers: test/int/sip-seed.ts (seedSipScheme, seedSipInvestor, setSipEnabled, SIP_DATES).

---

### Task F1: CDK prod, alarms (Dev A, 8 h; E25 dev already ran in S2, R-05)

**Files:**
- **Modify:** `infra/lib/config.ts` (add the `prod` `EnvConfig` entry and the alarm-recipient keys), `infra/lib/sanchay-mvp-stack.ts` (wire `alarms.ts`, add the `NatEip` output, add `orders.enabled=false` / `plans.sip.enabled=false` to the API/worker task defs).
- **Create:** `infra/lib/alarms.ts`, `docs/runbooks/credential-rotation.md`.
- **Test:** `infra/test/sanchay-mvp-stack.test.ts` (modify — add the prod-stack assertions), `infra/test/alarms.test.ts` (create).

**Interfaces:**
- **Prerequisites:** E25 (Plan 02, `SanchayMvpStack-dev`, R-05).
- **Consumes:** `infra/lib/config.ts` `EnvConfig`, `envConfigFor(env)`, `ALL_ENVS` (E25); `infra/lib/sanchay-mvp-stack.ts` `SanchayMvpStack` construct, its `vpc`, `rds`, `alb`, `apiTargetGroup`, `ecsService`, `apiContainer`, `workerContainer` properties (E25); `infra/bin/sanchay.ts`, which loops `ALL_ENVS.map(envConfigFor)` and instantiates one `SanchayMvpStack` per entry (E25) — unmodified by this task, since adding `'prod'` to `ALL_ENVS` in `config.ts` is enough to add the stack.
- **Produces:**
  - `EnvConfig.prod: EnvConfig` with `multiAz: true`, `backupRetentionDays: 14`, `deletionProtection: true`, `desiredCount: 2`, `alarmEmails`, `alarmSmsNumbers` (from `SANCHAY_ALARM_EMAILS` / `SANCHAY_ALARM_SMS_NUMBERS`, comma-separated).
  - `infra/lib/alarms.ts` exports `buildAlarms(scope: Construct, props: AlarmsProps): Alarms`, an SNS topic `sanchay-ops-alerts-{env}` with an email subscription per `alarmEmails` entry and an SMS subscription per `alarmSmsNumbers` entry, and 10 `cloudwatch.Alarm`s (`alb5xx`, `targetUnhealthy`, `workerHeartbeatStale`, `jobQueueAge`, `reconcilingSla`, `moneyInvariantBreach`, `webhookSignatureFailures`, `otpSendFailureRate`, `smsCapReached`, `navAge`), each with an `SnsAction(topic)` on `ALARM` and `OK`.
  - `SanchayMvpStack` calls `buildAlarms(this, {...})` only when `props.env === 'prod'` (dev keeps the single NAV-age alarm from E25).
  - `CfnOutput` `NatEip` (the NAT gateway's Elastic IP, for the Cybrilla allowlist request).
  - Prod ECS task defs get `orders.enabled=false` and `plans.sip.enabled=false` as container environment (the DB-backed `RuntimeConfig` default from D1 already reads false; these are the CDK-side literal `SANCHAY_APP_ROLE`-independent flags the deploy pipeline seeds into `app_config` on first migrate, per R-06 — the F1 migrate task calls `ops:runtime-config:seed --key=plans.sip.enabled --value=false` before the service is scaled up).
  - `docs/runbooks/credential-rotation.md`: the FP/MSG91/SES/DB-credential rotation runbook (Secrets Manager rotation steps, ECS force-new-deployment, and the alarm each step should clear).
- **Tests:**
  - `prod stack: MultiAz true`
  - `prod stack: BackupRetention 14`
  - `prod stack: DeletionProtection true`
  - `prod stack: 2 desired tasks`
  - `prod stack: NatEip output exists`
  - `prod stack: orders.enabled and plans.sip.enabled are "false" on api and worker containers`
  - `dev stack unaffected: MultiAz false, BackupRetention 1, DeletionProtection false` (regression)
  - `alarms: SNS topic has one email subscription per alarmEmails entry and one sms subscription per alarmSmsNumbers entry`
  - `alarms: exactly 10 cloudwatch alarms, each with an SNS alarm action`
  - `alarms: navAge alarm threshold matches R-12 (> 26 hours)`
  - `alarms: not built for the dev stack (dev keeps E25's single NAV-age alarm only)`
  - one PITR restore test into a scratch instance (G-E5; documented as a manual runbook step in `credential-rotation.md`'s "before you rotate the DB master secret" section, not asserted by CDK unit tests — no CDK construct proves restorability)
  - alarm test page on Wed 11-18 (manual; `docs/runbooks/credential-rotation.md` links the SNS topic ARN used for the drill)

- [ ] **Step 1: Write the failing test**

Create `infra/test/alarms.test.ts`:

```ts
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { buildAlarms } from '../lib/alarms.js';

function templateFor(alarmEmails: string[], alarmSmsNumbers: string[]) {
  const app = new App();
  const stack = new Stack(app, 'AlarmsTestStack');
  buildAlarms(stack, {
    env: 'prod',
    alarmEmails,
    alarmSmsNumbers,
    albArnSuffix: 'app/sanchay-prod/1234567890abcdef',
    targetGroupArnSuffix: 'targetgroup/sanchay-api-prod/abcdef1234567890',
  });
  return Template.fromStack(stack);
}

describe('buildAlarms', () => {
  it('creates one SNS topic subscription per email and per SMS number', () => {
    const t = templateFor(['dev-a@sanchay.in', 'dev-b@sanchay.in'], ['+919800000001']);
    t.resourceCountIs('AWS::SNS::Topic', 1);
    t.resourceCountIs('AWS::SNS::Subscription', 3);
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'dev-a@sanchay.in' });
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'dev-b@sanchay.in' });
    t.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'sms', Endpoint: '+919800000001' });
  });

  it('creates exactly 10 alarms, each wired to the SNS topic on ALARM and OK', () => {
    const t = templateFor(['dev-a@sanchay.in'], ['+919800000001']);
    t.resourceCountIs('AWS::CloudWatch::Alarm', 10);
    const alarms = t.findResources('AWS::CloudWatch::Alarm');
    for (const [, resource] of Object.entries(alarms)) {
      expect(resource.Properties.AlarmActions).toEqual([Match.anyValue()]);
      expect(resource.Properties.OKActions).toEqual([Match.anyValue()]);
    }
  });

  it('the navAge alarm fires above 26 hours, matching R-12', () => {
    const t = templateFor([], []);
    t.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: Match.stringLikeRegexp('sanchay-.*-nav-age'),
      MetricName: 'NavAgeHours',
      Threshold: 26,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });
});
```

Modify `infra/test/sanchay-mvp-stack.test.ts` by appending a `describe('prod')` block (kept alongside the existing E25 `describe('dev')` block, which is not touched):

```ts
describe('prod', () => {
  const t = templateFor(envConfigFor('prod'));

  it('is Multi-AZ with 14-day PITR and deletion protection', () => {
    t.hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: true,
      BackupRetentionPeriod: 14,
      DeletionProtection: true,
    });
  });

  it('runs 2 desired tasks', () => {
    t.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 2 });
  });

  it('outputs the NAT gateway EIP for the Cybrilla allowlist', () => {
    t.hasOutput('NatEip', {});
  });

  it('ships orders and SIP disabled until GO-1/GO-2 (R-06)', () => {
    const defs = t.findResources('AWS::ECS::TaskDefinition');
    const containers = Object.values(defs).flatMap((d) => d.Properties.ContainerDefinitions);
    for (const name of ['api', 'worker']) {
      const c = containers.find((c: { Name: string }) => c.Name === name);
      const env = Object.fromEntries(
        (c.Environment as Array<{ Name: string; Value: string }>).map((e) => [e.Name, e.Value]),
      );
      expect(env.SANCHAY_ORDERS_ENABLED_DEFAULT).toBe('false');
      expect(env.SANCHAY_PLANS_SIP_ENABLED_DEFAULT).toBe('false');
    }
  });

  it('builds the 10-alarm SNS topic (prod only)', () => {
    t.resourceCountIs('AWS::CloudWatch::Alarm', 10);
  });
});

describe('dev regression (E25 unaffected)', () => {
  const t = templateFor(envConfigFor('dev'));

  it('stays single-AZ with 1-day retention and no deletion protection', () => {
    t.hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: false,
      BackupRetentionPeriod: 1,
      DeletionProtection: false,
    });
  });

  it('keeps only the E25 NAV-age alarm, not the 10-alarm prod set', () => {
    t.resourceCountIs('AWS::CloudWatch::Alarm', 1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
pnpm --filter=@sanchay/infra test -- alarms.test.ts sanchay-mvp-stack.test.ts
```

Expected failure: `Cannot find module '../lib/alarms.js'` for `alarms.test.ts` (the file does not exist yet), and in `sanchay-mvp-stack.test.ts` a `TypeError` or assertion failure from `envConfigFor('prod')` returning `undefined` / the dev config (the `prod` entry and `NatEip` output do not exist yet).

- [ ] **Step 3: Minimal implementation**

Add the `prod` entry to `infra/lib/config.ts` (the file already has a `dev` entry and `ALL_ENVS` from E25; this is a key-level addition, shown as the full resulting file for clarity):

```ts
export type SanchayEnv = 'dev' | 'prod';

export interface EnvConfig {
  env: SanchayEnv;
  account: string;
  region: string;
  hostedZoneDomain: string;
  hostPrefixes: { www: string; app: string; api: string };
  multiAz: boolean;
  backupRetentionDays: number;
  deletionProtection: boolean;
  natGateways: number;
  desiredCount: number;
  cpu: number;
  memoryLimitMiB: number;
  alarmEmails: string[];
  alarmSmsNumbers: string[];
}

const splitEnvList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const dev: EnvConfig = {
  env: 'dev',
  account: process.env.SANCHAY_CDK_ACCOUNT_DEV ?? '000000000000',
  region: 'ap-south-1',
  hostedZoneDomain: 'dev.sanchay.in',
  hostPrefixes: { www: 'www.dev', app: 'app.dev', api: 'api.dev' },
  multiAz: false,
  backupRetentionDays: 1,
  deletionProtection: false,
  natGateways: 1,
  desiredCount: 1,
  cpu: 512,
  memoryLimitMiB: 1024,
  alarmEmails: [],
  alarmSmsNumbers: [],
};

/** F1: prod hardening per spec §2.4 and R-05/R-11/R-12/R-15/R-16. */
const prod: EnvConfig = {
  env: 'prod',
  account: process.env.SANCHAY_CDK_ACCOUNT_PROD ?? '000000000000',
  region: 'ap-south-1',
  hostedZoneDomain: 'sanchay.in',
  hostPrefixes: { www: 'www', app: 'app', api: 'api' },
  multiAz: true,
  backupRetentionDays: 14,
  deletionProtection: true,
  natGateways: 2,
  desiredCount: 2,
  cpu: 1024,
  memoryLimitMiB: 2048,
  alarmEmails: splitEnvList(process.env.SANCHAY_ALARM_EMAILS),
  alarmSmsNumbers: splitEnvList(process.env.SANCHAY_ALARM_SMS_NUMBERS),
};

const CONFIGS: Record<SanchayEnv, EnvConfig> = { dev, prod };

export const ALL_ENVS: readonly SanchayEnv[] = ['dev', 'prod'];

export function envConfigFor(env: SanchayEnv): EnvConfig {
  return CONFIGS[env];
}
```

Create `infra/lib/alarms.ts`:

```ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import type { SanchayEnv } from './config.js';

export interface AlarmsProps {
  env: SanchayEnv;
  alarmEmails: string[];
  alarmSmsNumbers: string[];
  /** ALB ARN suffix (`app/<name>/<id>`), for the CloudWatch `LoadBalancer` dimension. */
  albArnSuffix: string;
  /** Target-group ARN suffix (`targetgroup/<name>/<id>`), for the `TargetGroup` dimension. */
  targetGroupArnSuffix: string;
}

export interface Alarms {
  topic: sns.Topic;
  alarms: cloudwatch.Alarm[];
}

const NS = 'Sanchay';

/**
 * F1: the 10 prod alarms (spec §2.4, delta §0.2 invariants). Every alarm gets the same SNS action on
 * both ALARM and OK so the team is told when a break clears too.
 */
export function buildAlarms(scope: Construct, props: AlarmsProps): Alarms {
  const topic = new sns.Topic(scope, 'OpsAlertsTopic', {
    topicName: `sanchay-ops-alerts-${props.env}`,
    displayName: 'Sanchay ops alerts',
  });
  for (const email of props.alarmEmails) topic.addSubscription(new subs.EmailSubscription(email));
  for (const number of props.alarmSmsNumbers) topic.addSubscription(new subs.SmsSubscription(number));
  const action = new actions.SnsAction(topic);

  const dims = { LoadBalancer: props.albArnSuffix, TargetGroup: props.targetGroupArnSuffix };

  const specs: Array<{ id: string; name: string; metric: cloudwatch.Metric; threshold: number; comparison: cloudwatch.ComparisonOperator; evaluationPeriods: number }> = [
    {
      id: 'Alb5xx',
      name: `sanchay-${props.env}-alb-5xx`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HTTPCode_Target_5XX_Count',
        dimensionsMap: dims,
        statistic: 'Sum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 10,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'TargetUnhealthy',
      name: `sanchay-${props.env}-target-unhealthy`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'UnHealthyHostCount',
        dimensionsMap: dims,
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(1),
      }),
      threshold: 0,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 3,
    },
    {
      id: 'WorkerHeartbeatStale',
      name: `sanchay-${props.env}-worker-heartbeat-stale`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'WorkerHeartbeatAgeSeconds',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(1),
      }),
      threshold: 120,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    },
    {
      id: 'JobQueueAge',
      name: `sanchay-${props.env}-job-queue-age`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'JobQueueOldestAgeSeconds',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(1),
      }),
      threshold: 120,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    },
    {
      id: 'ReconcilingSla',
      name: `sanchay-${props.env}-reconciling-sla`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'OrdersReconcilingOverTwoHours',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 0,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'MoneyInvariantBreach',
      name: `sanchay-${props.env}-money-invariant-breach`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'ReconBreaksOpenCritical',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 0,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'WebhookSignatureFailures',
      name: `sanchay-${props.env}-webhook-signature-failures`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'FpWebhookSignatureFailures',
        statistic: 'Sum',
        period: cloudwatch.Duration.minutes(5),
      }),
      threshold: 3,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'OtpSendFailureRate',
      name: `sanchay-${props.env}-otp-send-failure-rate`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'OtpSendFailureRatePercent',
        statistic: 'Average',
        period: cloudwatch.Duration.minutes(15),
      }),
      threshold: 5,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 2,
    },
    {
      id: 'SmsCapReached',
      name: `sanchay-${props.env}-sms-cap-reached`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'SmsSentToday',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(15),
      }),
      threshold: 1900,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
    {
      id: 'NavAge',
      name: `sanchay-${props.env}-nav-age`,
      metric: new cloudwatch.Metric({
        namespace: NS,
        metricName: 'NavAgeHours',
        statistic: 'Maximum',
        period: cloudwatch.Duration.minutes(15),
      }),
      threshold: 26,
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
    },
  ];

  const alarms = specs.map((s) => {
    const alarm = new cloudwatch.Alarm(scope, s.id, {
      alarmName: s.name,
      metric: s.metric,
      threshold: s.threshold,
      comparisonOperator: s.comparison,
      evaluationPeriods: s.evaluationPeriods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(action);
    alarm.addOkAction(action);
    return alarm;
  });

  return { topic, alarms };
}
```

Modify `infra/lib/sanchay-mvp-stack.ts`: in the constructor, after the ALB/target-group/ECS-service constructs E25 already built (`this.alb`, `this.apiTargetGroup`, `this.ecsService`, the NAT gateway held on `this.vpc`), append:

```ts
    // F1: prod alarms (E25 keeps its single dev NAV-age alarm; this replaces it in prod only).
    if (props.env === 'prod') {
      buildAlarms(this, {
        env: props.env,
        alarmEmails: props.alarmEmails,
        alarmSmsNumbers: props.alarmSmsNumbers,
        albArnSuffix: cdk.Fn.select(1, cdk.Fn.split('loadbalancer/', this.alb.loadBalancerArn)),
        targetGroupArnSuffix: cdk.Fn.select(1, cdk.Fn.split(':targetgroup/', this.apiTargetGroup.targetGroupArn)),
      });
    }

    // F1: the NAT EIP for the Cybrilla allowlist request (R-05's public-dev-host rationale extends to prod).
    const natEip = this.vpc.publicSubnets[0]?.node.tryFindChild('NATGateway') as ec2.CfnNatGateway | undefined;
    if (natEip) {
      new cdk.CfnOutput(this, 'NatEip', { value: cdk.Fn.select(0, natEip.attrEipAllocationIds ?? ['']) });
    }
```

and, on the `api` and `worker` container definitions E25 already builds, append two entries to the shared `environment` map used by both:

```ts
    environment.SANCHAY_ORDERS_ENABLED_DEFAULT = props.env === 'prod' ? 'false' : 'true';
    environment.SANCHAY_PLANS_SIP_ENABLED_DEFAULT = props.env === 'prod' ? 'false' : 'true';
```

and add the import at the top of the file:

```ts
import { buildAlarms } from './alarms.js';
```

Create `docs/runbooks/credential-rotation.md`:

```markdown
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/infra test
pnpm --filter=@sanchay/infra typecheck
```

Expected: all `alarms.test.ts` and `sanchay-mvp-stack.test.ts` cases green, including the existing E25 dev-stack assertions (unchanged) and the new prod/dev-regression blocks; typecheck clean.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write infra/lib/config.ts infra/lib/alarms.ts infra/lib/sanchay-mvp-stack.ts infra/test/alarms.test.ts infra/test/sanchay-mvp-stack.test.ts docs/runbooks/credential-rotation.md
pnpm --filter=@sanchay/infra test
pnpm --filter=@sanchay/infra typecheck
pnpm lint
git add infra/lib/config.ts infra/lib/alarms.ts infra/lib/sanchay-mvp-stack.ts infra/test/alarms.test.ts infra/test/sanchay-mvp-stack.test.ts docs/runbooks/credential-rotation.md
git commit -m "feat(infra): prod CDK stack and the 10-alarm SNS topic (F1)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task F2: SIP and mandate backend (UPI Autopay ₹1,00,000) (Dev A, 18 h)

**Files:**
- **Create (domain):** `packages/domain/src/rules/sip-dates.ts`, `packages/domain/test/sip-dates.test.ts`
- **Create (api):** `apps/api/src/modules/plans/{plans.schema.ts, fp-plan.ts, fp-plan.test.ts, plan-transitions.ts, sip-eligibility.ts, sip-eligibility.test.ts, sip.service.ts, mandates.service.ts, mandates-submit.job.ts, mandates-poll.job.ts, sip-submit.job.ts, sip-advance.job.ts, instalments-sync.job.ts, plans.router.ts, mandates.router.ts, plans.module.ts}`
- **Create (contract):** `packages/contract/src/plans.ts`, `packages/contract/src/mandates.ts`, `packages/contract/src/plans.test.ts`
- **Create (tests):** `apps/api/test/int/sip-seed.ts`, `apps/api/test/int/sip-mandate.int.test.ts`
- **Create (migrations):** `apps/api/drizzle/0026_plans_mandates.sql` (generated: `plans`, `mandates`, and the `orders_plan_fp_order_uq` index), `apps/api/drizzle/0027_plans_mandates_guard.sql` (custom: attaches E4's `trg_consent_guard` to both tables)
- **Modify:**
  - `apps/api/src/integrations/fp/fp-transact.ts` (D3): real bodies for `createPurchasePlan`, `updatePurchasePlan`, `createMandate`, `authoriseMandate`.
  - `apps/api/src/integrations/fp/fake/fake-fp.state.ts` and `fake-fp.ts` (D4): purchase plans, `mandate.get`, `mandateAuth.create`, `purchase.list?plan=`, and the test helpers `advanceMandate`, `advancePlan`, `addInstalment`.
  - `apps/api/src/modules/orders/orders.schema.ts` (E20): the `orders_plan_fp_order_uq` unique index.
  - `apps/api/src/db/app-schema.ts`: export `plans.schema.ts`.
  - `apps/api/src/modules/platform/jobs/job-registry.ts`, `apps/api/src/modules/platform/jobs/schedules.ts`, `apps/api/src/modules/platform/ids.ts`.
  - `packages/domain/src/rules/index.ts`.
  - `packages/contract/src/errors.ts`, `packages/contract/src/index.ts`, `packages/app-core/src/errors/messages.ts`, `apps/api/openapi.json`.
  - `apps/api/src/app.module.ts` (`PlansModule.forRoot(env)`).

**Interfaces:**
- **Prerequisites:** Plan 02 D1–D6 and D8 as built (see this plan's Global Constraints), with D5 errata RV-02-14; Plan 03 E4, E7, E11 and E20.
- **Consumes (Plan 02, as built):**
  - `RuntimeConfig.get(exec, 'plans.sip.enabled')` (default `false`) and `ReconBreaks.open(exec, {kind, entityType, entityId, severity, detail?})`, both static, from `platform/runtime-config.ts`.
  - `Jobs` (injectable), class-level `@JobHandler`, `type Job<N>`, `registerSchedules` (D2).
  - `FpTransact`, `FpRead` (`mandate(id)`, `purchasePlan(id)`, `purchasePlans({mfInvestmentAccount})`, `purchases({plan})`), `FpRejectedError`, `FpAmbiguousError` (D3, worker-only, global `FpModule`).
  - `FakeFp` (D4).
  - `canTransition`, `PLAN_STATUSES`, `MANDATE_STATUSES`, `fpStateToOrderStatus`, `type FpOrderState` (D5).
  - `Notify.enqueue(exec, template, {investorId, data, dedupeKey})` through `NotificationsModule` (D6).
  - `schemes` (`sipAllowed`, `sipDates`, `thresholds.{sipMin, sipMax, sipMultiple}`) and `marketHolidays` (D8, `catalogue.schema.ts`).
- **Consumes (Plan 03):**
  - `ConsentEngine.create`, `useConsumed`, `CONSENT_SUBJECT_JOBS`, `ConsentApprovedJobData`, `CHALLENGE_EXPIRY_MS`, and the `consentChallenges`/`consentRecords` tables (E4).
  - `expectNoPmWritesBeforeConsumed`, `expectBola` (E4); `jobOf` (E1).
  - `bankAccounts.{fpBankOldId, isPrimary, status}` (E7); `InvestorAccounts.decryptMobile/decryptEmail` (E11).
  - `orders`, `orderEvents` (it has `plan_id` and `mandate_id`), `ORDER_INITIATED_VIA`, `toFpPurchaseView`, `seedInvestableInvestor`, `seedScheme` (E20).
  - `type CutoffHolidays` (E22, `@sanchay/domain`).
- **Produces:**
  - `firstInstalmentDate({registeredOn, day, sipDates, holidays}): IsoDate` in `@sanchay/domain`. It returns the first `day` at least `registeredOn + 2` days away, rolled forward to the next business day. It throws `RangeError` when `day ∉ sipDates`.
  - `assertSipEligible({scheme, amount, installmentDay})`, `sipSchemeOf(row)`, `type SipScheme`, `SIP_FLOOR` (₹100), `UPI_AUTOPAY_LIMIT` (₹1,00,000) and `MAX_INSTALMENTS` (360), in `modules/plans/sip-eligibility.ts`. F10's quote reuses them.
  - Tables `mandates` and `plans`. `frequency` is CHECK `'MONTHLY'`. `limit_amount` is CHECK-ed to the spec's five limits, with UPI Autopay fixed at 1,00,000. Plan and mandate transitions append `order_events` rows (`plan_id`/`mandate_id`).
  - `SipService.createSip(input) → {planId, mandateId, challengeId, expiresAt, newMandate, firstInstalmentDate}`, plus `.list` and `.get`.
  - `MandatesService.list`, `.get`, `.authorize`.
  - Routes:
    - `plans.createSip` POST `/plans/sips` [K]
    - `plans.list` GET `/plans`
    - `plans.get` GET `/plans/{id}`
    - `mandates.list` GET `/mandates`
    - `mandates.get` GET `/mandates/{id}` (`upiUri` only while `AUTH_PENDING`)
    - `mandates.authorize` POST `/mandates/{id}/authorize` [K], which re-mints the UPI intent.
  - `CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION = 'mandates.submit'` and `CONSENT_SUBJECT_JOBS.SIP_REGISTRATION = 'plans.sip.submit'`, registered at `plans.module.ts` load.
  - Jobs (worker only):
    - `mandates.submit` (`ConsentApprovedJobData`, or `{challengeId, subjectIds, reauthorise}`)
    - `mandates.poll` (`{scope: 'PENDING'|'APPROVED'}`)
    - `plans.sip.submit` (`{challengeId, subjectIds}`)
    - `plans.sip.advance` (`{planId, challengeId}`)
    - `plans.instalments.sync` (`{}`)
  - Schedules: `mandates.poll` PENDING at `*/10`, APPROVED at `30 7 * * *`; `plans.instalments.sync` at `30 8` and `30 20`.
- **One challenge per SIP; the saga window comes from the subject type** (E4 `needsNewMandateWindow`):
  - **New mandate:** subject type `MANDATE_REGISTRATION` (subjects: the plan and the mandate; template `TPL_MANDATE_REGISTRATION`; 7-day saga).
  - **Reused mandate:** subject type `SIP_REGISTRATION` (subject: the plan; template `TPL_SIP_REGISTRATION`; 60-minute saga).
  - **Reuse rule.** A mandate is reused when it is the investor's `APPROVED` `UPI_AUTOPAY` mandate and Σ(its live plans) + this amount ≤ `limit_amount`. Live plans are those in `CONSENTED`, `MANDATE_SETUP`, `SUBMITTING`, `UNDER_REVIEW`, `CONFIRMING`, `ACTIVE`, `RECONCILING` or `CANCEL_PENDING`, plus `CONSENT_PENDING` plans younger than the challenge expiry. E4 never expires the subject rows of an unapproved challenge, so an abandoned draft must not hold headroom.
- **FP chain** (research fp-api §4, ONDC plan flow):
  1. `mandates.submit`:
     - Mandate: `CONSENT_PENDING → CONSENTED → SUBMITTING`.
     - Inside `useConsumed`:
       - `POST /api/pg/mandates {mandate_type:'UPI', bank_account_id: <bank old_id>, mandate_limit: 100000, provider_name:'CYBRILLAPOA'}` → `CREATED`.
       - `POST /api/pg/payments/emandate/auth {mandate_id, upi:{type:'uri'}}` → `AUTH_PENDING` with `upi_uri`.
     - Plan: `CONSENT_PENDING → CONSENTED → MANDATE_SETUP`.
  2. `mandates.poll` steps through D5's MANDATE machine:
     - FP `SUBMITTED` → `BANK_PENDING`.
     - FP `APPROVED` → `APPROVED`, then enqueues `plans.sip.submit` for each `MANDATE_SETUP` plan.
     - FP `REJECTED` (or `CANCELLED` before approval) → `REJECTED`, and each waiting plan goes `FAILED`.
     - Saga lapsed → `EXPIRED`, and each waiting plan goes `CONSENT_EXPIRED`.
     - For `APPROVED` mandates, FP `CANCELLED` → `CANCELLED`, `ACTIVE` plans → `MANDATE_REVOKED`, and a `MANDATE_REVOKED` email.
  3. `plans.sip.submit` moves the plan to `SUBMITTING` (via `mandate_approved` or `mandate_reused_with_headroom`). Inside `useConsumed` it POSTs `/v2/mf_purchase_plans` with:
     - `{mf_investment_account, scheme: <ISIN>, frequency:'monthly', installment_day, number_of_installments?, amount, systematic: true, payment_method:'mandate', payment_source: <FP mandate id>, source_ref_id: <plan id>, user_ip, initiated_by:'investor'}`
     - No `gateway`, `initiated_via`, `start_date`, `partner` or `euin`: FP rejects the first three on plans, and H-11 forbids the last two.
     - The plan becomes `UNDER_REVIEW`.
  4. `plans.sip.advance` reads the FP plan:
     - `failed` → `REJECTED`.
     - `review_completed` → `CONFIRMING`, then `PATCH {id, consent:{isd_code:'91', mobile, email?}, state:'confirmed'}` inside `useConsumed`.
     - `active` → `ACTIVE`, with `first_instalment_date`/`next_instalment_date`, a `SIP_ACTIVATED` audit and a `SIP_ACTIVE` email.
     - Anything else: it re-enqueues itself (60 s).
     - It also adopts a `RECONCILING` plan by `source_ref_id`. If the plan is absent 10 minutes after entering `RECONCILING`, it goes `FAILED` (`PROVIDER_OBJECT_ABSENT`).
  5. `plans.instalments.sync` lists `GET /v2/mf_purchases?plan=` for each `ACTIVE` plan and upserts `orders(origin='SIP_INSTALMENT')` on `(plan_id, fp_order_id)`, with statuses from `fpStateToOrderStatus`. There is no consent per instalment (SEBI-2FA-S). Two consecutive `FAILED`/`EXPIRED` instalments send `SIP_INSTALMENT_MISSED_WARNING` once per miss streak.
- **Kill switch:** `plans.createSip` returns 403 `FEATURE_DISABLED` while `plans.sip.enabled` is `false` (GO-2, R-06).
- **Audit rows (R-20):** `SIP_CREATED`, `MANDATE_APPROVED`, `SIP_SUBMITTED` and `SIP_ACTIVATED`.
- **Review fixes** (rewrite against Plans 02–03 as built):
  - **Invented APIs.** The draft called an invented `FpTransact.call('pg.mandates.create' | 'pg.emandate.auth' | 'mf.purchasePlans.create')` and `FpRead.purchasesByPlan`. It now fills D3's typed stubs and uses `FpRead.purchases({plan})`.
  - **Job handlers.** Method-level `@JobHandler`s are replaced by class-level handlers, and the crons now live in `registerSchedules`.
  - **Local status lists.** The draft redeclared `MANDATE_STATUSES`/`PLAN_STATUSES` locally (with a `MANDATE_REVOKED` mandate state D5 does not have). It now uses D5's.
  - **Consent guard.** The guard trigger was `BEFORE INSERT OR UPDATE`, which would have refused the `CONSENT_PENDING` insert. It now fires only on the move to `SUBMITTING`, as E20's does.
  - **Consent call.** The draft passed `consent.create` a subjects object and a `sagaWindowMs` E4 does not take. The saga now follows the subject type.
  - **Scheme fields.** The draft read SIP limits from nonexistent `fundFacts` columns. They now come from D8's `schemes.thresholds`/`sipDates`/`sipAllowed`.
  - **Router.** The draft's `payoutBankIdFor` returned the investor id, `authorize` was a no-op, and the router was not idempotent. The router now uses Plan 01's `@Controller` + `@Implement` with `requireIdempotency(idem, cls)`.
  - **Plan payload.** The draft sent `initiated_via` on the plan POST.
  - **Module placement.** All SIP and mandate code moves to one `modules/plans/` module, so neither `OrdersModule` nor `PaymentsModule` gains a cross-module dependency.
  - **Date rule.** The draft's holiday-blind `instalment-date.ts` is gone. The rule moves here from F10 as `firstInstalmentDate`: F10's quote needs F2's `assertSipEligible`, so F2 must come first, and F2 now owns the rule. F10 keeps its golden vectors and quote.
  - **D5 edges.** D5 gained the PLAN edges `UNDER_REVIEW → REJECTED | CONSENT_EXPIRED`, `CONFIRMING → REJECTED` and `SUBMITTING → REJECTED`, and the MANDATE edges `CONSENTED → CONSENT_EXPIRED` and `SUBMITTING → REJECTED` (Plan 02 errata RV-02-14).
- **Known gap:** a mandate left `RECONCILING` by an ambiguous `POST /api/pg/mandates` opens a CRITICAL `recon_breaks` row (`MANDATE_CREATE_AMBIGUOUS`) for manual adoption. D3 has no FP mandate list-by-bank read to automate it yet.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/sip-dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { CutoffHolidays } from '../src/rules/cutoff.js';
import { firstInstalmentDate } from '../src/rules/sip-dates.js';
import { toIsoDate } from '../src/ids.js';

const holidays = (dates: readonly string[]): CutoffHolidays => ({ has: (d) => dates.includes(d) });
const at = (registeredOn: string, day: number, sipDates: number[], hol: string[] = []) =>
  firstInstalmentDate({ registeredOn: toIsoDate(registeredOn), day, sipDates, holidays: holidays(hol) });

describe('firstInstalmentDate (SIPD-01..08)', () => {
  it('SIPD-01: the chosen day, at least registration + 2', () => expect(at('2026-10-16', 20, [5, 20])).toBe('2026-10-20'));
  it('SIPD-02: a Saturday rolls to Monday', () => expect(at('2026-10-01', 10, [10])).toBe('2026-10-12'));
  it('SIPD-03: too close this month -> next month', () => expect(at('2026-10-25', 5, [5, 20])).toBe('2026-11-05'));
  it('SIPD-04: 28 Feb 2027 is a Sunday -> 1 Mar', () => expect(at('2027-02-20', 28, [28])).toBe('2027-03-01'));
  it('SIPD-05: a market holiday rolls forward', () => expect(at('2026-10-16', 20, [5, 20], ['2026-10-20'])).toBe('2026-10-21'));
  it('SIPD-06: crosses the year end', () => expect(at('2026-12-29', 15, [3, 15])).toBe('2027-01-15'));
  it('SIPD-07: holiday then weekend', () => expect(at('2026-12-28', 1, [1, 15], ['2027-01-01'])).toBe('2027-01-04'));
  it('SIPD-08: a day outside sip_dates throws', () => expect(() => at('2026-10-01', 7, [5, 20])).toThrow(RangeError));
});
```

`apps/api/src/modules/plans/sip-eligibility.test.ts`:
```ts
import { Money } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import { assertSipEligible, type SipScheme, sipSchemeOf } from './sip-eligibility.js';

const scheme: SipScheme = {
  sipMin: Money.parse('500.00'),
  sipMax: null,
  sipMultiple: Money.parse('100.00'),
  sipDates: [5, 10, 15],
};
const check = (amount: string, installmentDay = 10) => () => assertSipEligible({ scheme, amount: Money.parse(amount), installmentDay });

describe('assertSipEligible', () => {
  it('accepts a valid day and amount', () => expect(check('1000.00')).not.toThrow());
  it('SIP_DAY_INVALID outside sip_dates', () => expect(check('1000.00', 7)).toThrow(expect.objectContaining({ code: 'SIP_DAY_INVALID' })));
  it('AMOUNT_BELOW_MIN under the scheme minimum', () => expect(check('400.00')).toThrow(expect.objectContaining({ code: 'AMOUNT_BELOW_MIN' })));
  it('AMOUNT_NOT_MULTIPLE off the multiple', () => expect(check('1050.00')).toThrow(expect.objectContaining({ code: 'AMOUNT_NOT_MULTIPLE' })));
  it('MANDATE_LIMIT_EXCEEDED above the UPI Autopay limit', () =>
    expect(check('100100.00')).toThrow(expect.objectContaining({ code: 'MANDATE_LIMIT_EXCEEDED' })));
  it('the ₹100 floor applies even when the scheme minimum is lower', () => {
    const low = { ...scheme, sipMin: Money.parse('50.00'), sipMultiple: Money.parse('1.00') };
    expect(() => assertSipEligible({ scheme: low, amount: Money.parse('99.00'), installmentDay: 5 })).toThrow(
      expect.objectContaining({ code: 'AMOUNT_BELOW_MIN' }),
    );
  });
});

describe('sipSchemeOf', () => {
  const row = {
    status: 'PUBLISHED' as const,
    sipAllowed: true,
    sipDates: [5],
    thresholds: { purchaseMin: '500.00', purchaseMax: null, purchaseMultiple: '1.00', sipMin: '500.00', sipMax: null, sipMultiple: '1.00' },
  };
  it('reads D8 thresholds', () => expect(sipSchemeOf(row).sipDates).toEqual([5]));
  it('SCHEME_NOT_ORDERABLE when SIP is not allowed or has no dates', () => {
    expect(() => sipSchemeOf({ ...row, sipAllowed: false })).toThrow(expect.objectContaining({ code: 'SCHEME_NOT_ORDERABLE' }));
    expect(() => sipSchemeOf({ ...row, sipDates: [] })).toThrow(expect.objectContaining({ code: 'SCHEME_NOT_ORDERABLE' }));
  });
});
```

`apps/api/src/modules/plans/fp-plan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toFpMandateView, toFpPlanView, upiUriOf } from './fp-plan.js';

describe('FP plan and mandate views', () => {
  it('reads a purchase plan', () => {
    expect(
      toFpPlanView({ id: 'mfpp_1', state: 'active', source_ref_id: 'p1', start_date: '2026-11-10', next_installment_date: '2026-12-10', consent: { mobile: '9' } }),
    ).toEqual({ id: 'mfpp_1', state: 'active', sourceRefId: 'p1', startDate: '2026-11-10', nextInstallmentDate: '2026-12-10', hasConsent: true });
  });
  it('reads a mandate (integer id, upper-case status)', () => {
    expect(toFpMandateView({ id: 4411, mandate_ref: 'mref_1', mandate_status: 'approved', umrn: 'U1' })).toEqual({
      id: 4411,
      status: 'APPROVED',
      mandateRef: 'mref_1',
      umrn: 'U1',
    });
  });
  it('reads the UPI intent from an emandate auth response', () => {
    expect(upiUriOf({ upi: { type: 'uri', uri: 'upi://mandate?x=1' } })).toBe('upi://mandate?x=1');
    expect(upiUriOf({})).toBeNull();
  });
});
```

`packages/contract/src/plans.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CreateSipInputSchema } from './plans.js';

const valid = { schemeId: '0192f0e0-0000-7000-8000-000000000001', amount: '5000.00', installmentDay: 10 };

describe('CreateSipInputSchema', () => {
  it('defaults numberOfInstalments to null ("until I cancel")', () => {
    expect(CreateSipInputSchema.parse(valid).numberOfInstalments).toBeNull();
  });
  it('rejects a frequency key: MONTHLY is the only frequency and is not an input', () => {
    expect(CreateSipInputSchema.safeParse({ ...valid, frequency: 'QUARTERLY' }).success).toBe(false);
  });
  it('rejects day 29 and 0', () => {
    expect(CreateSipInputSchema.safeParse({ ...valid, installmentDay: 29 }).success).toBe(false);
    expect(CreateSipInputSchema.safeParse({ ...valid, installmentDay: 0 }).success).toBe(false);
  });
});
```

`apps/api/test/int/sip-seed.ts`:
```ts
import { eq } from 'drizzle-orm';
import { schemes } from '../../src/modules/catalogue/catalogue.schema.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import { appConfig } from '../../src/modules/platform/kernel.schema.js';
import type { TestApp } from './app.js';
import { seedInvestableInvestor, seedScheme } from './orders-seed.js';

export const SIP_DATES = [5, 10, 15, 20, 25];

/** E20's scheme with SIP allowed on SIP_DATES (thresholds: sipMin 500, multiple 1). */
export async function seedSipScheme(app: TestApp): Promise<{ id: string; isin: string }> {
  const scheme = await seedScheme(app);
  await app.db.db.update(schemes).set({ sipAllowed: true, sipDates: SIP_DATES }).where(eq(schemes.id, scheme.id));
  return scheme;
}

/** E20's investable investor whose primary VERIFIED bank is registered at FP (old_id 5001). */
export async function seedSipInvestor(app: TestApp) {
  const investor = await seedInvestableInvestor(app);
  await app.db.db
    .update(bankAccounts)
    .set({ fpBankAccountId: `bac_${investor.investorId.slice(0, 8)}`, fpBankOldId: 5001, isPrimary: true, status: 'VERIFIED' })
    .where(eq(bankAccounts.id, investor.bankId));
  return investor;
}

export async function setSipEnabled(app: TestApp, enabled: boolean): Promise<void> {
  await app.db.db
    .insert(appConfig)
    .values({ key: 'plans.sip.enabled', value: enabled })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: enabled } });
}
```

`apps/api/test/int/sip-mandate.int.test.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ConsentApprovedJobData, ConsentEngine } from '../../src/modules/legal-consent/consent-engine.js';
import { consentChallenges } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { notifications } from '../../src/modules/notifications/notifications.schema.js';
import { orders } from '../../src/modules/orders/orders.schema.js';
import { InstalmentsSyncJob } from '../../src/modules/plans/instalments-sync.job.js';
import { MandatesPollJob } from '../../src/modules/plans/mandates-poll.job.js';
import { MandatesSubmitJob } from '../../src/modules/plans/mandates-submit.job.js';
import { mandates, plans } from '../../src/modules/plans/plans.schema.js';
import { SipAdvanceJob } from '../../src/modules/plans/sip-advance.job.js';
import { SipService } from '../../src/modules/plans/sip.service.js';
import { SipSubmitJob } from '../../src/modules/plans/sip-submit.job.js';
import { DAY, MINUTE } from '../../src/modules/platform/clock.js';
import type { JobName } from '../../src/modules/platform/jobs/job-registry.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { auditEvents } from '../../src/modules/platform/platform.schema.js';
import { expectBola } from './bola.js';
import { expectNoPmWritesBeforeConsumed } from './consent-first.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { jobOf } from './jobs.js';
import { seedSipInvestor, seedSipScheme, setSipEnabled } from './sip-seed.js';

let t: FpTestApp;
const enqueued: Array<{ name: string; data: unknown }> = [];

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data) => {
    enqueued.push({ name, data });
  });
  await setSipEnabled(t, true);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  enqueued.length = 0;
});

type SipInvestor = Awaited<ReturnType<typeof seedSipInvestor>>;

async function draftSip(opts: { amount?: string; day?: number; investor?: SipInvestor } = {}) {
  const investor = opts.investor ?? (await seedSipInvestor(t));
  const scheme = await seedSipScheme(t);
  const created = await t.app.get(SipService).createSip({
    investorId: investor.investorId,
    schemeId: scheme.id,
    amount: opts.amount ?? '5000.00',
    installmentDay: opts.day ?? 10,
    numberOfInstalments: null,
    userIp: '203.0.113.10',
    initiatedVia: 'web',
  });
  return { investor, scheme, ...created };
}

const lastJob = (name: JobName) => [...enqueued].reverse().find((j) => j.name === name);

/** Sends the factors the challenge requires, approves, and returns the job approve enqueued. */
async function approve(draft: { challengeId: string; investor: SipInvestor }, jobName: JobName): Promise<ConsentApprovedJobData> {
  const engine = t.app.get(ConsentEngine);
  const [row] = await t.db.db.select().from(consentChallenges).where(eq(consentChallenges.id, draft.challengeId));
  const needsEmail = row?.requiredFactors.includes('EMAIL') === true;
  await engine.sendOtp(draft.challengeId, 'SMS');
  if (needsEmail) await engine.sendOtp(draft.challengeId, 'EMAIL');
  await engine.approve(draft.challengeId, {
    smsCode: t.sms.latestCode(draft.investor.mobile) ?? '',
    ...(needsEmail ? { emailCode: t.email.latestCode(draft.investor.email) ?? '' } : {}),
  });
  const job = lastJob(jobName);
  expect(job, `approve enqueues ${jobName}`).toBeDefined();
  return job?.data as ConsentApprovedJobData;
}

const mandateSubmit = (data: unknown) => t.app.get(MandatesSubmitJob).handle(jobOf('mandates.submit', data));
const poll = (scope: 'PENDING' | 'APPROVED') => t.app.get(MandatesPollJob).handle(jobOf('mandates.poll', { scope }));
const sipSubmit = (data: unknown) => t.app.get(SipSubmitJob).handle(jobOf('plans.sip.submit', data));
const sipAdvance = (planId: string, challengeId: string) =>
  t.app.get(SipAdvanceJob).handle(jobOf('plans.sip.advance', { planId, challengeId }));
const sync = () => t.app.get(InstalmentsSyncJob).handle(jobOf('plans.instalments.sync', {}));
const planOf = async (id: string) => (await t.db.db.select().from(plans).where(eq(plans.id, id)))[0];
const mandateOf = async (id: string) => (await t.db.db.select().from(mandates).where(eq(mandates.id, id)))[0];
const challengeOf = async (id: string) => (await t.db.db.select().from(consentChallenges).where(eq(consentChallenges.id, id)))[0];
const auditFor = async (entityType: string, entityId: string) =>
  (await t.db.db.select().from(auditEvents).where(and(eq(auditEvents.entityType, entityType), eq(auditEvents.entityId, entityId)))).map((r) => r.action);
const notificationsFor = async (investorId: string, templateKey: string) =>
  t.db.db.select().from(notifications).where(and(eq(notifications.investorId, investorId), eq(notifications.templateKey, templateKey as never)));

/** New-mandate SIP driven to AUTH_PENDING (mandate) / MANDATE_SETUP (plan). */
async function toAuthPending(opts: { amount?: string; investor?: SipInvestor } = {}) {
  const draft = await draftSip(opts);
  await mandateSubmit(await approve(draft, 'mandates.submit'));
  return draft;
}

/** New-mandate SIP driven all the way to ACTIVE. */
async function activeSip(opts: { amount?: string; investor?: SipInvestor } = {}) {
  const draft = await toAuthPending(opts);
  t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'APPROVED');
  await poll('PENDING');
  await sipSubmit(lastJob('plans.sip.submit')?.data);
  const fpPlanId = (await planOf(draft.planId))?.fpPlanId as string;
  t.fakeFp.advancePlan(fpPlanId, 'review_completed');
  await sipAdvance(draft.planId, draft.challengeId);
  t.fakeFp.advancePlan(fpPlanId, 'active', { startDate: draft.firstInstalmentDate, nextInstallmentDate: draft.firstInstalmentDate });
  await sipAdvance(draft.planId, draft.challengeId);
  return { ...draft, fpPlanId };
}

describe('plans.createSip', () => {
  it('new mandate: CONSENT_PENDING plan + UPI_AUTOPAY mandate at 1,00,000, one MANDATE_REGISTRATION challenge, zero FP calls', async () => {
    const before = t.fakeFp.calls().length;
    const draft = await draftSip();
    expect(draft.newMandate).toBe(true);
    expect(await planOf(draft.planId)).toMatchObject({ status: 'CONSENT_PENDING', frequency: 'MONTHLY', consentChallengeId: draft.challengeId });
    expect(await mandateOf(draft.mandateId)).toMatchObject({ status: 'CONSENT_PENDING', rail: 'UPI_AUTOPAY', limitAmount: '100000.00' });
    expect((await challengeOf(draft.challengeId))?.subjectType).toBe('MANDATE_REGISTRATION');
    expect(t.fakeFp.calls()).toHaveLength(before);
    expect(await auditFor('plans', draft.planId)).toContain('SIP_CREATED');
    await expectNoPmWritesBeforeConsumed(t, draft.challengeId);
  });

  it('kill switch: plans.sip.enabled=false -> FEATURE_DISABLED', async () => {
    await setSipEnabled(t, false);
    try {
      await expect(draftSip()).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    } finally {
      await setSipEnabled(t, true);
    }
  });

  it('SIP_DAY_INVALID outside sip_dates; MANDATE_LIMIT_EXCEEDED above 1,00,000', async () => {
    await expect(draftSip({ day: 7 })).rejects.toMatchObject({ code: 'SIP_DAY_INVALID' });
    await expect(draftSip({ amount: '100001.00' })).rejects.toMatchObject({ code: 'MANDATE_LIMIT_EXCEEDED' });
  });
});

describe('mandate + SIP chain', () => {
  it('mandates.submit: UPI mandate on the bank old_id, AUTH_PENDING with a UPI intent, plan MANDATE_SETUP', async () => {
    const draft = await toAuthPending();
    const mandate = await mandateOf(draft.mandateId);
    expect(mandate).toMatchObject({ status: 'AUTH_PENDING', upiUri: expect.stringMatching(/^upi:\/\//) });
    expect(t.fakeFp.state.mandates.get(Number(mandate?.fpMandateId))?.raw).toEqual({
      mandate_type: 'UPI',
      bank_account_id: 5001,
      mandate_limit: 100000,
      provider_name: 'CYBRILLAPOA',
    });
    expect((await planOf(draft.planId))?.status).toBe('MANDATE_SETUP');
    await expectNoPmWritesBeforeConsumed(t, draft.challengeId);
  });

  it('bank APPROVED -> plans.sip.submit posts a monthly plan with no partner/euin/gateway/initiated_via -> UNDER_REVIEW', async () => {
    const draft = await toAuthPending();
    const mandate = await mandateOf(draft.mandateId);
    t.fakeFp.advanceMandate(Number(mandate?.fpMandateId), 'APPROVED');
    await poll('PENDING');
    expect((await mandateOf(draft.mandateId))?.status).toBe('APPROVED');
    expect(await auditFor('mandates', draft.mandateId)).toContain('MANDATE_APPROVED');
    await sipSubmit(lastJob('plans.sip.submit')?.data);
    const plan = await planOf(draft.planId);
    expect(plan?.status).toBe('UNDER_REVIEW');
    const raw = t.fakeFp.state.purchasePlans.get(plan?.fpPlanId as string)?.raw ?? {};
    expect(raw).toMatchObject({
      mf_investment_account: draft.investor.mfiaId,
      scheme: draft.scheme.isin,
      frequency: 'monthly',
      installment_day: 10,
      amount: '5000.00',
      systematic: true,
      payment_method: 'mandate',
      payment_source: String(mandate?.fpMandateId),
      source_ref_id: draft.planId,
      initiated_by: 'investor',
    });
    for (const key of ['partner', 'euin', 'gateway', 'initiated_via', 'start_date']) expect(raw).not.toHaveProperty(key);
    expect(await auditFor('plans', draft.planId)).toContain('SIP_SUBMITTED');
  });

  it('review_completed -> consent PATCH + confirm; active -> ACTIVE, SIP_ACTIVATED, one SIP_ACTIVE email', async () => {
    const draft = await activeSip();
    const plan = await planOf(draft.planId);
    expect(plan).toMatchObject({ status: 'ACTIVE', firstInstalmentDate: draft.firstInstalmentDate });
    expect(t.fakeFp.state.purchasePlans.get(draft.fpPlanId)?.consent).toEqual({
      isd_code: '91',
      mobile: expect.stringMatching(/^\d{10}$/),
      email: draft.investor.email,
    });
    expect(await auditFor('plans', draft.planId)).toContain('SIP_ACTIVATED');
    expect(await notificationsFor(draft.investor.investorId, 'SIP_ACTIVE')).toHaveLength(1);
  });

  it('reused mandate within headroom: SIP_REGISTRATION, no mandate write, plan write only after CONSUMED', async () => {
    const first = await activeSip({ amount: '5000.00' });
    const mandateCreates = t.fakeFp.calls({ op: 'mandate.create' }).length;
    const second = await draftSip({ investor: first.investor, amount: '5000.00' });
    expect(second).toMatchObject({ newMandate: false, mandateId: first.mandateId });
    expect((await challengeOf(second.challengeId))?.subjectType).toBe('SIP_REGISTRATION');
    await sipSubmit(await approve(second, 'plans.sip.submit'));
    expect((await planOf(second.planId))?.status).toBe('UNDER_REVIEW');
    expect(t.fakeFp.calls({ op: 'mandate.create' })).toHaveLength(mandateCreates);
    await expectNoPmWritesBeforeConsumed(t, second.challengeId);
  });

  it('headroom exceeded -> a new mandate', async () => {
    const first = await activeSip({ amount: '60000.00' });
    const second = await draftSip({ investor: first.investor, amount: '50000.00' });
    expect(second.newMandate).toBe(true);
    expect(second.mandateId).not.toBe(first.mandateId);
  });

  it('mandate REJECTED -> plan FAILED, no plan write', async () => {
    const planCreates = t.fakeFp.calls({ op: 'purchasePlan.create' }).length;
    const draft = await toAuthPending();
    t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'REJECTED');
    await poll('PENDING');
    expect((await mandateOf(draft.mandateId))?.status).toBe('REJECTED');
    expect(await planOf(draft.planId)).toMatchObject({ status: 'FAILED', failureCode: 'MANDATE_REJECTED' });
    expect(t.fakeFp.calls({ op: 'purchasePlan.create' })).toHaveLength(planCreates);
  });

  it('FP fails the plan in review -> REJECTED', async () => {
    const draft = await toAuthPending();
    t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'APPROVED');
    await poll('PENDING');
    await sipSubmit(lastJob('plans.sip.submit')?.data);
    t.fakeFp.advancePlan((await planOf(draft.planId))?.fpPlanId as string, 'failed');
    await sipAdvance(draft.planId, draft.challengeId);
    expect((await planOf(draft.planId))?.status).toBe('REJECTED');
  });

  it('external cancel of an APPROVED mandate -> CANCELLED, plan MANDATE_REVOKED, one MANDATE_REVOKED email', async () => {
    const draft = await activeSip();
    t.fakeFp.advanceMandate(Number((await mandateOf(draft.mandateId))?.fpMandateId), 'CANCELLED');
    await poll('APPROVED');
    await poll('APPROVED');
    expect(await mandateOf(draft.mandateId)).toMatchObject({ status: 'CANCELLED', cancelledBy: 'EXTERNAL' });
    expect((await planOf(draft.planId))?.status).toBe('MANDATE_REVOKED');
    expect(await notificationsFor(draft.investor.investorId, 'MANDATE_REVOKED')).toHaveLength(1);
  });

  it('7-day saga: mandate never approved -> EXPIRED, plan CONSENT_EXPIRED, no plan write (run last: moves the clock)', async () => {
    const planCreates = t.fakeFp.calls({ op: 'purchasePlan.create' }).length;
    const draft = await toAuthPending();
    t.clock.advance(7 * DAY + MINUTE);
    await poll('PENDING');
    expect((await mandateOf(draft.mandateId))?.status).toBe('EXPIRED');
    expect((await planOf(draft.planId))?.status).toBe('CONSENT_EXPIRED');
    expect(t.fakeFp.calls({ op: 'purchasePlan.create' })).toHaveLength(planCreates);
  });
});

describe('instalments', () => {
  it('sync upserts SIP_INSTALMENT orders idempotently and follows FP state', async () => {
    const draft = await activeSip();
    const fpPurchaseId = t.fakeFp.addInstalment(draft.fpPlanId, 'submitted');
    await sync();
    await sync();
    const rows = await t.db.db.select().from(orders).where(eq(orders.planId, draft.planId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ origin: 'SIP_INSTALMENT', status: 'PROCESSING', fpOrderId: fpPurchaseId, amount: '5000.00' });
    t.fakeFp.advance(fpPurchaseId, 'successful', { folioNumber: 'F-1' });
    await sync();
    expect((await t.db.db.select().from(orders).where(eq(orders.planId, draft.planId)))[0]?.status).toBe('UNITS_PENDING');
  });

  it('two consecutive misses -> exactly one SIP_INSTALMENT_MISSED_WARNING', async () => {
    const draft = await activeSip();
    t.fakeFp.addInstalment(draft.fpPlanId, 'failed');
    t.fakeFp.addInstalment(draft.fpPlanId, 'failed');
    await sync();
    await sync();
    expect(await notificationsFor(draft.investor.investorId, 'SIP_INSTALMENT_MISSED_WARNING')).toHaveLength(1);
  });
});

describe('guards', () => {
  it('trg_consent_guard refuses SUBMITTING on plans and mandates without a CONSUMED challenge', async () => {
    const draft = await draftSip();
    await expect(t.db.pool.query(`UPDATE app.plans SET status = 'SUBMITTING' WHERE id = $1`, [draft.planId])).rejects.toThrow(/trg_consent_guard/);
    await expect(t.db.pool.query(`UPDATE app.mandates SET status = 'SUBMITTING' WHERE id = $1`, [draft.mandateId])).rejects.toThrow(/trg_consent_guard/);
  });

  it('QUARTERLY is refused by the DB CHECK', async () => {
    const draft = await draftSip();
    await expect(t.db.pool.query(`UPDATE app.plans SET frequency = 'QUARTERLY' WHERE id = $1`, [draft.planId])).rejects.toThrow(/plans_frequency_ck/);
  });

  it('BOLA on plans.get, mandates.get and mandates.authorize', async () => {
    const draft = await draftSip();
    await expectBola(t, 'plans.get', { id: draft.planId });
    await expectBola(t, 'mandates.get', { id: draft.mandateId });
    await expectBola(t, 'mandates.authorize', { id: draft.mandateId });
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

```
pnpm --filter=@sanchay/domain test -- sip-dates
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- sip-mandate
```
Expected: `Cannot find module '../src/rules/sip-dates.js'`, `'./sip-eligibility.js'`, `'./fp-plan.js'`, `'./plans.js'` and `'../../src/modules/plans/instalments-sync.job.js'`.

- [ ] **Step 3: Minimal implementation**

`packages/domain/src/rules/sip-dates.ts`:
```ts
import { type IsoDate, toIsoDate } from '../ids.js';
import type { CutoffHolidays } from './cutoff.js';

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDateOf = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(day)}`;

function addIsoDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return isoDateOf(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function isBusinessDay(isoDate: string, holidays: CutoffHolidays): boolean {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(isoDate);
}

export interface FirstInstalmentDateInput {
  registeredOn: IsoDate;
  /** The investor's chosen day, 1..28; must be one of `sipDates`. */
  day: number;
  sipDates: readonly number[];
  holidays: CutoffHolidays;
}

/**
 * Spec §4.3 ACTIVE row: the first calendar occurrence of `day` at least `registeredOn + 2` days away,
 * rolled forward to the next business day (Mon–Fri, not a market holiday). Zero-padded ISO dates
 * compare chronologically as strings.
 */
export function firstInstalmentDate(input: FirstInstalmentDateInput): IsoDate {
  if (!input.sipDates.includes(input.day)) {
    throw new RangeError(`firstInstalmentDate: day ${input.day} is not one of the scheme's sip_dates`);
  }
  const earliest = addIsoDays(input.registeredOn, 2);
  let [year, month] = earliest.split('-').map(Number) as [number, number];
  for (let guard = 0; guard < 24; guard += 1) {
    const candidate = isoDateOf(year, month, input.day);
    if (candidate >= earliest) {
      let landing = candidate;
      while (!isBusinessDay(landing, input.holidays)) landing = addIsoDays(landing, 1);
      return toIsoDate(landing);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  throw new Error('firstInstalmentDate: no candidate within 24 months');
}
```
Append to `packages/domain/src/rules/index.ts`: `export * from './sip-dates.js';`. `CutoffHolidays` stays E22's single declaration in `cutoff.ts`; it is not re-declared here.

`apps/api/src/modules/plans/plans.schema.ts`:
```ts
import { MANDATE_RAILS, MANDATE_STATUSES, PLAN_STATUSES } from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import { bigint, check, date, index, inet, integer, numeric, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { ORDER_INITIATED_VIA } from '../orders/orders.schema.js';
import { newId } from '../platform/ids.js';

export const PLAN_TYPES = ['SIP'] as const;
/** Launch frequency set (spec §4.3): MONTHLY only; the DB CHECK refuses anything else. */
export const PLAN_FREQUENCIES = ['MONTHLY'] as const;
export const MANDATE_CANCELLED_BY = ['INVESTOR', 'EXTERNAL'] as const;
export const UPI_AUTOPAY_LIMIT_WIRE = '100000.00';

export const PLAN_AUDIT_ACTIONS = {
  SIP_CREATED: 'SIP_CREATED',
  SIP_SUBMITTED: 'SIP_SUBMITTED',
  SIP_ACTIVATED: 'SIP_ACTIVATED',
  MANDATE_APPROVED: 'MANDATE_APPROVED',
} as const;

export const mandates = appSchema.table(
  'mandates',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('mandates')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    bankAccountId: uuid('bank_account_id').notNull(),
    rail: text('rail', { enum: MANDATE_RAILS }).notNull(),
    limitAmount: numeric('limit_amount', { precision: 18, scale: 2, mode: 'string' }).notNull(),
    status: text('status', { enum: MANDATE_STATUSES }).notNull().default('CONSENT_PENDING'),
    consentChallengeId: uuid('consent_challenge_id'),
    /** FP's mandate id is an integer (research fp-api §4). */
    fpMandateId: bigint('fp_mandate_id', { mode: 'number' }),
    mandateRef: text('mandate_ref'),
    umrn: text('umrn'),
    fpStatus: text('fp_status'),
    upiUri: text('upi_uri'),
    approvedAt: tstz('approved_at'),
    rejectedReason: text('rejected_reason'),
    cancelledBy: text('cancelled_by', { enum: MANDATE_CANCELLED_BY }),
    finalAt: tstz('final_at'),
  },
  (t) => [
    check('mandates_rail_ck', inList('rail', MANDATE_RAILS)),
    check('mandates_status_ck', inList('status', MANDATE_STATUSES)),
    check(
      'mandates_limit_ck',
      sql`limit_amount IN (100000, 200000, 500000, 1000000, 2500000) AND (rail <> 'UPI_AUTOPAY' OR limit_amount = 100000)`,
    ),
    index('mandates_investor_idx').on(t.investorId, t.status),
  ],
);

export const plans = appSchema.table(
  'plans',
  {
    id: uuid('id').primaryKey().$defaultFn(() => newId('plans')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    schemeId: uuid('scheme_id').notNull(),
    folioId: uuid('folio_id'),
    type: text('type', { enum: PLAN_TYPES }).notNull().default('SIP'),
    amount: numeric('amount', { precision: 18, scale: 2, mode: 'string' }).notNull(),
    frequency: text('frequency', { enum: PLAN_FREQUENCIES }).notNull().default('MONTHLY'),
    installmentDay: smallint('installment_day').notNull(),
    /** null = "until I cancel". */
    numberOfInstalments: integer('number_of_instalments'),
    firstInstalmentDateShown: date('first_instalment_date_shown', { mode: 'string' }).notNull(),
    firstInstalmentDate: date('first_instalment_date', { mode: 'string' }),
    nextInstalmentDate: date('next_instalment_date', { mode: 'string' }),
    mandateId: uuid('mandate_id')
      .notNull()
      .references(() => mandates.id, { onDelete: 'restrict' }),
    status: text('status', { enum: PLAN_STATUSES }).notNull().default('CONSENT_PENDING'),
    consentChallengeId: uuid('consent_challenge_id'),
    arn: text('arn').notNull(),
    initiatedVia: text('initiated_via', { enum: ORDER_INITIATED_VIA }).notNull(),
    userIp: inet('user_ip').notNull(),
    fpPlanId: text('fp_plan_id'),
    fpState: text('fp_state'),
    failureCode: text('failure_code'),
    finalAt: tstz('final_at'),
  },
  (t) => [
    check('plans_type_ck', inList('type', PLAN_TYPES)),
    check('plans_frequency_ck', inList('frequency', PLAN_FREQUENCIES)),
    check('plans_status_ck', inList('status', PLAN_STATUSES)),
    check('plans_installment_day_ck', sql`installment_day BETWEEN 1 AND 28`),
    check('plans_instalments_ck', sql`number_of_instalments IS NULL OR number_of_instalments BETWEEN 1 AND 360`),
    index('plans_investor_idx').on(t.investorId, t.status),
    index('plans_mandate_idx').on(t.mandateId, t.status),
  ],
);
```
Append to `apps/api/src/db/app-schema.ts`: `export * from '../modules/plans/plans.schema.js';`.

`apps/api/src/modules/orders/orders.schema.ts` (E20; add to the `orders` table's extra-config array, and add `uniqueIndex` to the `drizzle-orm/pg-core` import). NULLs are distinct, so one-time orders (`plan_id` NULL) are unaffected:
```ts
    uniqueIndex('orders_plan_fp_order_uq').on(t.planId, t.fpOrderId),
```

`apps/api/drizzle/0027_plans_mandates_guard.sql` (custom, after the generated `0026_plans_mandates`):
```sql
CREATE TRIGGER "trg_plans_consent_guard"
  BEFORE UPDATE OF status ON "app"."plans"
  FOR EACH ROW
  WHEN (NEW.status = 'SUBMITTING' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "app"."trg_consent_guard"();
--> statement-breakpoint
CREATE TRIGGER "trg_mandates_consent_guard"
  BEFORE UPDATE OF status ON "app"."mandates"
  FOR EACH ROW
  WHEN (NEW.status = 'SUBMITTING' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "app"."trg_consent_guard"();
```

`apps/api/src/modules/plans/fp-plan.ts`:
```ts
const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

/** Typed view of D3's raw mf_purchase_plan (research fp-api §4, ONDC plan flow). */
export interface FpPlanView {
  id: string;
  state: string;
  sourceRefId: string | null;
  startDate: string | null;
  nextInstallmentDate: string | null;
  hasConsent: boolean;
}

export function toFpPlanView(raw: Record<string, unknown>): FpPlanView {
  return {
    id: String(raw.id),
    state: String(raw.state),
    sourceRefId: text(raw.source_ref_id),
    startDate: text(raw.start_date),
    nextInstallmentDate: text(raw.next_installment_date),
    hasConsent: raw.consent !== null && raw.consent !== undefined,
  };
}

/** PG mandate object: integer id, status CREATED | SUBMITTED | APPROVED | REJECTED | CANCELLED. */
export interface FpMandateView {
  id: number;
  status: string;
  mandateRef: string | null;
  umrn: string | null;
}

export function toFpMandateView(raw: Record<string, unknown>): FpMandateView {
  return {
    id: Number(String(raw.id)),
    status: String(raw.mandate_status ?? raw.status ?? '').toUpperCase(),
    mandateRef: text(raw.mandate_ref),
    umrn: text(raw.umrn),
  };
}

/** `POST /api/pg/payments/emandate/auth` with `upi.type='uri'` returns the UPI intent in `upi.uri`. */
export function upiUriOf(raw: Record<string, unknown>): string | null {
  const upi = raw.upi as { uri?: unknown } | null | undefined;
  return typeof upi?.uri === 'string' ? upi.uri : null;
}
```

`apps/api/src/modules/plans/plan-transitions.ts`:
```ts
import { canTransition, type MandateStatus, type PlanStatus } from '@sanchay/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { orderEvents } from '../orders/orders.schema.js';
import { AppError } from '../platform/errors.js';
import { mandates, plans } from './plans.schema.js';

/** Moves a plan along D5's PLAN machine and appends its order_events row; refuses an illegal edge. */
export async function movePlan(
  exec: DbExecutor,
  plan: { id: string; status: PlanStatus },
  to: PlanStatus,
  trigger: string,
  values: Partial<typeof plans.$inferInsert> = {},
): Promise<void> {
  if (!canTransition('PLAN', plan.status, to, trigger)) {
    throw new AppError('PLAN_STATE_INVALID', { message: `PLAN ${plan.status} -> ${to} (${trigger}) is not allowed` });
  }
  await exec.update(plans).set({ ...values, status: to }).where(eq(plans.id, plan.id));
  await exec.insert(orderEvents).values({ planId: plan.id, fromStatus: plan.status, toStatus: to, trigger });
}

export async function moveMandate(
  exec: DbExecutor,
  mandate: { id: string; status: MandateStatus },
  to: MandateStatus,
  trigger: string,
  values: Partial<typeof mandates.$inferInsert> = {},
): Promise<void> {
  if (!canTransition('MANDATE', mandate.status, to, trigger)) {
    throw new AppError('MANDATE_STATE_INVALID', { message: `MANDATE ${mandate.status} -> ${to} (${trigger}) is not allowed` });
  }
  await exec.update(mandates).set({ ...values, status: to }).where(eq(mandates.id, mandate.id));
  await exec.insert(orderEvents).values({ mandateId: mandate.id, fromStatus: mandate.status, toStatus: to, trigger });
}

/** Moves every plan still waiting (MANDATE_SETUP) on a mandate that will never be usable. */
export async function settleWaitingPlans(
  exec: DbExecutor,
  mandateId: string,
  to: 'FAILED' | 'CONSENT_EXPIRED',
  trigger: string,
  values: Partial<typeof plans.$inferInsert>,
): Promise<void> {
  const waiting = await exec
    .select({ id: plans.id, status: plans.status })
    .from(plans)
    .where(and(eq(plans.mandateId, mandateId), eq(plans.status, 'MANDATE_SETUP')));
  for (const plan of waiting) await movePlan(exec, plan, to, trigger, values);
}
```

`apps/api/src/modules/plans/sip-eligibility.ts`:
```ts
import { Money } from '@sanchay/money';
import type { SchemeThresholds } from '../catalogue/catalogue.schema.js';
import { AppError } from '../platform/errors.js';

/** Platform floor under every scheme's own SIP minimum. */
export const SIP_FLOOR = Money.parse('100.00');
/** UPI Autopay mandates are fixed at ₹1,00,000 (spec §4.3); one SIP can never exceed it. */
export const UPI_AUTOPAY_LIMIT = Money.parse('100000.00');
/** "Until I cancel" is sent to FP as no instalment count; a fixed count is capped here. */
export const MAX_INSTALMENTS = 360;

export interface SipScheme {
  sipMin: Money;
  sipMax: Money | null;
  sipMultiple: Money;
  sipDates: readonly number[];
}

const field = (path: string, code: string) => ({ fields: [{ path, code, message: code }] });

/** A scheme row (D8) as a SIP target; SCHEME_NOT_ORDERABLE when it cannot take a SIP. */
export function sipSchemeOf(row: {
  status: string;
  sipAllowed: boolean;
  sipDates: number[] | null;
  thresholds: SchemeThresholds | null;
}): SipScheme {
  if (row.status !== 'PUBLISHED' || !row.sipAllowed || row.thresholds === null || row.sipDates === null || row.sipDates.length === 0) {
    throw new AppError('SCHEME_NOT_ORDERABLE');
  }
  return {
    sipMin: Money.parse(row.thresholds.sipMin),
    sipMax: row.thresholds.sipMax === null ? null : Money.parse(row.thresholds.sipMax),
    sipMultiple: Money.parse(row.thresholds.sipMultiple),
    sipDates: row.sipDates,
  };
}

/** The checks that gate the SIP's P/M writes. F10's quote calls the same function so the two never drift. */
export function assertSipEligible(input: { scheme: SipScheme; amount: Money; installmentDay: number }): void {
  const { scheme, amount } = input;
  if (!scheme.sipDates.includes(input.installmentDay)) throw new AppError('SIP_DAY_INVALID', field('installmentDay', 'SIP_DAY_INVALID'));
  const minimum = scheme.sipMin.gt(SIP_FLOOR) ? scheme.sipMin : SIP_FLOOR;
  if (amount.lt(minimum)) throw new AppError('AMOUNT_BELOW_MIN', field('amount', 'AMOUNT_BELOW_MIN'));
  if (scheme.sipMax !== null && amount.gt(scheme.sipMax)) throw new AppError('AMOUNT_ABOVE_MAX', field('amount', 'AMOUNT_ABOVE_MAX'));
  if (!amount.isMultipleOf(scheme.sipMultiple)) throw new AppError('AMOUNT_NOT_MULTIPLE', field('amount', 'AMOUNT_NOT_MULTIPLE'));
  if (amount.gt(UPI_AUTOPAY_LIMIT)) throw new AppError('MANDATE_LIMIT_EXCEEDED', field('amount', 'MANDATE_LIMIT_EXCEEDED'));
}
```

`apps/api/src/modules/plans/sip.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { type CutoffHolidays, firstInstalmentDate, type IsoDate, type PlanStatus, toIsoDate } from '@sanchay/domain';
import { Money } from '@sanchay/money';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { marketHolidays, schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { CHALLENGE_EXPIRY_MS, ConsentEngine } from '../legal-consent/consent-engine.js';
import { bankAccounts } from '../onboarding/bank.schema.js';
import { type InitiatedVia, orderEvents } from '../orders/orders.schema.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { RuntimeConfig } from '../platform/runtime-config.js';
import { PLAN_AUDIT_ACTIONS, mandates, plans, UPI_AUTOPAY_LIMIT_WIRE } from './plans.schema.js';
import { assertSipEligible, sipSchemeOf } from './sip-eligibility.js';

export interface CreateSipInput {
  investorId: string;
  schemeId: string;
  amount: string;
  installmentDay: number;
  numberOfInstalments: number | null;
  userIp: string;
  initiatedVia: InitiatedVia;
}

export interface CreatedSip {
  planId: string;
  mandateId: string;
  challengeId: string;
  expiresAt: string;
  newMandate: boolean;
  firstInstalmentDate: string;
}

/** Plans whose amount counts against a mandate's limit. */
const HEADROOM_STATUSES: PlanStatus[] = ['CONSENTED', 'MANDATE_SETUP', 'SUBMITTING', 'UNDER_REVIEW', 'CONFIRMING', 'ACTIVE', 'RECONCILING', 'CANCEL_PENDING'];
const IST_OFFSET_MS = 330 * 60_000;

export const istToday = (now: Date): IsoDate => toIsoDate(new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10));

@Injectable()
export class SipService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createSip(input: CreateSipInput): Promise<CreatedSip> {
    const db = this.dbh.db;
    if (!(await RuntimeConfig.get(db, 'plans.sip.enabled'))) throw new AppError('FEATURE_DISABLED');
    const [investor] = await db.select().from(investors).where(eq(investors.id, input.investorId));
    if (investor === undefined || !investor.canPurchase || investor.fpMfInvestmentAccountId === null) throw new AppError('PURCHASE_BLOCKED');
    const [scheme] = await db.select().from(schemes).where(eq(schemes.id, input.schemeId));
    if (scheme === undefined) throw new AppError('NOT_FOUND');
    const sip = sipSchemeOf(scheme);
    const amount = Money.parse(input.amount);
    assertSipEligible({ scheme: sip, amount, installmentDay: input.installmentDay });
    const [bank] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.investorId, input.investorId), eq(bankAccounts.status, 'VERIFIED'), isNotNull(bankAccounts.fpBankOldId)))
      .orderBy(desc(bankAccounts.isPrimary), desc(bankAccounts.createdAt))
      .limit(1);
    if (bank === undefined) throw new AppError('BANK_NOT_VERIFIED');

    const now = this.clock.now();
    const today = istToday(now);
    const shown = firstInstalmentDate({
      registeredOn: today,
      day: input.installmentDay,
      sipDates: sip.sipDates,
      holidays: await this.holidaysFrom(db, today),
    });

    return db.transaction(async (tx) => {
      // Serialises this investor's SIP drafts so two concurrent drafts cannot both claim the same headroom.
      await tx.select({ id: investors.id }).from(investors).where(eq(investors.id, input.investorId)).for('update');
      const reused = await this.mandateWithHeadroom(tx, input.investorId, amount, now);
      const newMandate = reused === null;
      const mandateId = reused ?? newId('mandates');
      if (newMandate) {
        await tx.insert(mandates).values({
          id: mandateId,
          createdBy: input.investorId,
          updatedBy: input.investorId,
          investorId: input.investorId,
          bankAccountId: bank.id,
          rail: 'UPI_AUTOPAY',
          limitAmount: UPI_AUTOPAY_LIMIT_WIRE,
        });
        await tx.insert(orderEvents).values({ mandateId, toStatus: 'CONSENT_PENDING', trigger: 'plans.createSip' });
      }
      const planId = newId('plans');
      await tx.insert(plans).values({
        id: planId,
        createdBy: input.investorId,
        updatedBy: input.investorId,
        investorId: input.investorId,
        schemeId: input.schemeId,
        amount: amount.toWire(),
        installmentDay: input.installmentDay,
        numberOfInstalments: input.numberOfInstalments,
        firstInstalmentDateShown: shown,
        mandateId,
        arn: this.config.env.SANCHAY_PLATFORM_ARN,
        initiatedVia: input.initiatedVia,
        userIp: input.userIp,
      });
      await tx.insert(orderEvents).values({ planId, toStatus: 'CONSENT_PENDING', trigger: 'plans.createSip' });
      await this.audit.record(tx, {
        action: PLAN_AUDIT_ACTIONS.SIP_CREATED,
        actorType: 'INVESTOR',
        actorId: input.investorId,
        entityType: 'plans',
        entityId: planId,
      });
      // One challenge covers the plan and, when needed, the new mandate; its subject type sets the saga
      // window (E4: MANDATE_REGISTRATION = 7 days, SIP_REGISTRATION = 60 minutes).
      const challenge = await this.consent.create(tx, {
        investorId: input.investorId,
        subjectType: newMandate ? 'MANDATE_REGISTRATION' : 'SIP_REGISTRATION',
        subjects: newMandate
          ? [
              { table: 'plans', id: planId },
              { table: 'mandates', id: mandateId },
            ]
          : [{ table: 'plans', id: planId }],
        templateKey: newMandate ? 'TPL_MANDATE_REGISTRATION' : 'TPL_SIP_REGISTRATION',
        folioId: null,
        amount: amount.toWire(),
        fields: {
          action: 'invest monthly',
          amount: amount.toWire(),
          schemeShort: scheme.name.slice(0, 30),
          schemeIsin: scheme.isin,
          installmentDay: String(input.installmentDay),
          firstInstalmentDate: shown,
          mandateLimit: UPI_AUTOPAY_LIMIT_WIRE,
        },
      });
      await tx.update(plans).set({ consentChallengeId: challenge.challengeId }).where(eq(plans.id, planId));
      if (newMandate) {
        await tx.update(mandates).set({ consentChallengeId: challenge.challengeId }).where(eq(mandates.id, mandateId));
      }
      return {
        planId,
        mandateId,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt.toISOString(),
        newMandate,
        firstInstalmentDate: shown,
      };
    });
  }

  async get(investorId: string, planId: string) {
    const [row] = await this.dbh.db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.investorId, investorId)));
    if (row === undefined) throw new AppError('NOT_FOUND');
    return row;
  }

  async list(investorId: string) {
    return this.dbh.db.select().from(plans).where(eq(plans.investorId, investorId)).orderBy(desc(plans.createdAt));
  }

  /** The investor's APPROVED UPI Autopay mandate with room for `amount`, oldest first; null when none. */
  private async mandateWithHeadroom(exec: DbExecutor, investorId: string, amount: Money, now: Date): Promise<string | null> {
    const approved = await exec
      .select({ id: mandates.id, limitAmount: mandates.limitAmount })
      .from(mandates)
      .where(and(eq(mandates.investorId, investorId), eq(mandates.rail, 'UPI_AUTOPAY'), eq(mandates.status, 'APPROVED')))
      .orderBy(asc(mandates.createdAt));
    // A CONSENT_PENDING draft holds headroom only while its challenge can still be approved.
    const freshSince = new Date(now.getTime() - CHALLENGE_EXPIRY_MS);
    for (const mandate of approved) {
      const [used] = await exec
        .select({ total: sql<string>`COALESCE(SUM(${plans.amount}), 0)::numeric(18,2)::text` })
        .from(plans)
        .where(
          and(
            eq(plans.mandateId, mandate.id),
            or(inArray(plans.status, HEADROOM_STATUSES), and(eq(plans.status, 'CONSENT_PENDING'), gt(plans.createdAt, freshSince))),
          ),
        );
      if (!Money.parse(used?.total ?? '0.00').add(amount).gt(Money.parse(mandate.limitAmount))) return mandate.id;
    }
    return null;
  }

  private async holidaysFrom(exec: DbExecutor, today: IsoDate): Promise<CutoffHolidays> {
    const rows = await exec.select({ day: marketHolidays.holidayDate }).from(marketHolidays).where(gte(marketHolidays.holidayDate, today));
    const days = new Set(rows.map((r) => r.day));
    return { has: (isoDate) => days.has(isoDate) };
  }
}
```

`apps/api/src/modules/plans/mandates.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { AppError } from '../platform/errors.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { mandates } from './plans.schema.js';

@Injectable()
export class MandatesService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Jobs) private readonly jobs: Jobs,
  ) {}

  async get(investorId: string, mandateId: string) {
    const [row] = await this.dbh.db.select().from(mandates).where(and(eq(mandates.id, mandateId), eq(mandates.investorId, investorId)));
    if (row === undefined) throw new AppError('NOT_FOUND');
    return row;
  }

  async list(investorId: string) {
    return this.dbh.db.select().from(mandates).where(eq(mandates.investorId, investorId)).orderBy(desc(mandates.createdAt));
  }

  /**
   * The investor abandoned the first UPI intent: re-mint it. The FP call is class M, so it runs in the
   * worker (mandates.submit, reauthorise) inside the same consent's 7-day saga, never on this request path.
   */
  async authorize(investorId: string, mandateId: string): Promise<{ ok: true }> {
    const row = await this.get(investorId, mandateId);
    if (row.status !== 'AUTH_PENDING' || row.consentChallengeId === null) throw new AppError('MANDATE_STATE_INVALID');
    await this.jobs.enqueue(
      this.dbh.db,
      'mandates.submit',
      { challengeId: row.consentChallengeId, subjectIds: [row.id], reauthorise: true },
      { singletonKey: `mandate-auth:${row.id}` },
    );
    return { ok: true };
  }
}
```

`apps/api/src/modules/plans/mandates-submit.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { MandateStatus } from '@sanchay/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpAmbiguousError, FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { bankAccounts } from '../onboarding/bank.schema.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { ReconBreaks } from '../platform/runtime-config.js';
import { toFpMandateView, upiUriOf } from './fp-plan.js';
import { moveMandate, movePlan, settleWaitingPlans } from './plan-transitions.js';
import { mandates, plans } from './plans.schema.js';

/** `ConsentApprovedJobData` from approve (CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION), or a re-authorise from mandates.authorize. */
export interface MandateSubmitData {
  challengeId: string;
  subjectIds: string[];
  reauthorise?: boolean;
}

type MandateRow = typeof mandates.$inferSelect;

/**
 * Worker only. Registers the UPI Autopay mandate at PG and mints its UPI intent, inside useConsumed.
 * Resumable: a retry skips the create once `fp_mandate_id` is stored.
 */
@Injectable()
@JobHandler('mandates.submit')
export class MandatesSubmitJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpTransact) private readonly fp: FpTransact,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'mandates.submit'>): Promise<void> {
    const { challengeId, subjectIds } = job.data as MandateSubmitData;
    const db = this.dbh.db;
    const [found] = await db
      .select()
      .from(mandates)
      .where(and(inArray(mandates.id, subjectIds), eq(mandates.consentChallengeId, challengeId)));
    if (found === undefined) return;
    let mandate: MandateRow = found;

    if (mandate.status === 'CONSENT_PENDING') {
      await db.transaction(async (tx) => {
        await moveMandate(tx, mandate, 'CONSENTED', 'approve');
        const drafts = await tx
          .select({ id: plans.id, status: plans.status })
          .from(plans)
          .where(and(eq(plans.mandateId, mandate.id), eq(plans.consentChallengeId, challengeId), eq(plans.status, 'CONSENT_PENDING')));
        for (const plan of drafts) {
          await movePlan(tx, plan, 'CONSENTED', 'approve');
          await movePlan(tx, { id: plan.id, status: 'CONSENTED' }, 'MANDATE_SETUP', 'new_mandate');
        }
      });
      mandate = { ...mandate, status: 'CONSENTED' };
    }
    if (!['CONSENTED', 'SUBMITTING', 'CREATED', 'AUTH_PENDING'].includes(mandate.status)) return;

    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, mandate.bankAccountId));
    const bankOldId = bank?.fpBankOldId ?? null;
    if (bankOldId === null) throw new AppError('INTERNAL', { message: 'mandate bank is not registered at FP' });
    const mandateType = mandate.rail === 'ENACH' ? 'E_MANDATE' : 'UPI';
    // FP takes the limit as a whole-rupee integer; every allowed limit (mandates_limit_ck) is one.
    const mandateLimit = Number.parseInt(mandate.limitAmount, 10);

    try {
      await this.consent.useConsumed(challengeId, async (consumed) => {
        let current = mandate;
        if (current.status === 'CONSENTED') {
          await moveMandate(db, current, 'SUBMITTING', 'job_submit');
          current = { ...current, status: 'SUBMITTING' };
        }
        if (current.status === 'SUBMITTING') {
          const created = toFpMandateView(
            await this.fp.createMandate({ bankAccountId: bankOldId, mandateType, mandateLimit }, consumed),
          );
          await moveMandate(db, current, 'CREATED', 'fp_mandate_created', {
            fpMandateId: created.id,
            mandateRef: created.mandateRef,
            fpStatus: created.status,
          });
          current = { ...current, status: 'CREATED', fpMandateId: created.id };
        }
        if (current.fpMandateId === null) return;
        const upiUri = upiUriOf(await this.fp.authoriseMandate({ mandateId: String(current.fpMandateId), mandateType }, consumed));
        if (current.status === 'CREATED') {
          await moveMandate(db, current, 'AUTH_PENDING', 'emandate_auth_created', { upiUri });
        } else {
          await db.update(mandates).set({ upiUri }).where(eq(mandates.id, current.id)); // re-authorise: same state, new intent
        }
      });
    } catch (err) {
      await this.onFailure(mandate.id, err);
    }
  }

  private async onFailure(mandateId: string, err: unknown): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    const [after] = await db.select().from(mandates).where(eq(mandates.id, mandateId));
    const status = after?.status as MandateStatus | undefined;
    if (after === undefined) throw err;
    if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && status === 'CONSENTED') {
      await db.transaction(async (tx) => {
        await moveMandate(tx, after, 'CONSENT_EXPIRED', 'execute_before_missed', { finalAt: now });
        await settleWaitingPlans(tx, after.id, 'CONSENT_EXPIRED', 'seven_day_saga_no_plan_write', { finalAt: now });
      });
      return;
    }
    if (status === 'SUBMITTING' && err instanceof FpRejectedError) {
      await db.transaction(async (tx) => {
        await moveMandate(tx, after, 'REJECTED', 'live_check_failed', { rejectedReason: err.providerCode ?? `HTTP_${err.httpStatus}`, finalAt: now });
        await settleWaitingPlans(tx, after.id, 'FAILED', 'mandate_rejected_or_expired', { failureCode: 'MANDATE_REJECTED', finalAt: now });
      });
      return;
    }
    if (status === 'SUBMITTING' && (err instanceof FpAmbiguousError || !(err instanceof AppError))) {
      // D3 has no FP mandate list-by-bank read, so a lost create response cannot be adopted automatically.
      await db.transaction(async (tx) => {
        await moveMandate(tx, after, 'RECONCILING', 'ambiguous');
        await ReconBreaks.open(tx, {
          kind: 'MANDATE_CREATE_AMBIGUOUS',
          entityType: 'mandates',
          entityId: after.id,
          severity: 'CRITICAL',
          detail: { bankAccountId: after.bankAccountId },
        });
      });
      return;
    }
    throw err;
  }
}
```

`apps/api/src/modules/plans/mandates-poll.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { MandateStatus } from '@sanchay/domain';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle } from '../../db/client.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { consentRecords } from '../legal-consent/legal-consent.schema.js';
import { Notify } from '../notifications/notify.service.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { toFpMandateView } from './fp-plan.js';
import { moveMandate, movePlan, settleWaitingPlans } from './plan-transitions.js';
import { mandates, PLAN_AUDIT_ACTIONS, plans } from './plans.schema.js';

export interface MandatesPollData {
  scope: 'PENDING' | 'APPROVED';
}

type MandateRow = typeof mandates.$inferSelect;

/**
 * Worker only. PENDING (every 10 min): steps AUTH_PENDING/BANK_PENDING mandates along D5's MANDATE machine
 * and starts the waiting SIPs on approval. APPROVED (daily 07:30): catches a cancel made at the bank.
 */
@Injectable()
@JobHandler('mandates.poll')
export class MandatesPollJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Notify) private readonly notify: Notify,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'mandates.poll'>): Promise<void> {
    const { scope } = job.data as MandatesPollData;
    const statuses: MandateStatus[] = scope === 'APPROVED' ? ['APPROVED'] : ['AUTH_PENDING', 'BANK_PENDING'];
    const rows = await this.dbh.db
      .select()
      .from(mandates)
      .where(and(inArray(mandates.status, statuses), isNotNull(mandates.fpMandateId)));
    for (const mandate of rows) await this.pollOne(mandate);
  }

  private async pollOne(mandate: MandateRow): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    const fp = toFpMandateView(await this.fpRead.mandate(String(mandate.fpMandateId)));
    // Expire only what the bank has not decided: an approval that lands late keeps the mandate (reusable),
    // and plans.sip.submit then settles the plan as CONSENT_EXPIRED when useConsumed refuses.
    const undecided = fp.status === 'CREATED' || fp.status === 'SUBMITTED';
    if (mandate.status !== 'APPROVED' && undecided && (await this.sagaLapsed(mandate, now))) {
      await db.transaction(async (tx) => {
        await moveMandate(tx, mandate, 'EXPIRED', 'seven_day_no_approval', { fpStatus: fp.status, finalAt: now });
        await settleWaitingPlans(tx, mandate.id, 'CONSENT_EXPIRED', 'seven_day_saga_no_plan_write', { finalAt: now });
      });
      return;
    }
    if (fp.status === mandate.fpStatus && fp.status !== 'CANCELLED') return;

    await db.transaction(async (tx) => {
      if (mandate.status === 'APPROVED') {
        if (fp.status === 'CANCELLED') await this.revoke(tx, mandate, now);
        return;
      }
      let current = mandate;
      const step = async (to: MandateStatus, trigger: string, values: Partial<typeof mandates.$inferInsert> = {}) => {
        await moveMandate(tx, current, to, trigger, { fpStatus: fp.status, ...values });
        current = { ...current, status: to };
      };
      if (fp.status === 'CREATED') return;
      if (current.status === 'AUTH_PENDING') await step('BANK_PENDING', 'fp_submitted');
      if (fp.status === 'APPROVED') {
        await step('APPROVED', 'fp_approved', { approvedAt: now, umrn: fp.umrn });
        await this.audit.record(tx, { action: PLAN_AUDIT_ACTIONS.MANDATE_APPROVED, actorType: 'SYSTEM', entityType: 'mandates', entityId: mandate.id });
        const waiting = await tx
          .select({ id: plans.id, challengeId: plans.consentChallengeId })
          .from(plans)
          .where(and(eq(plans.mandateId, mandate.id), eq(plans.status, 'MANDATE_SETUP')));
        for (const plan of waiting) {
          if (plan.challengeId === null) continue;
          await this.jobs.enqueue(tx, 'plans.sip.submit', { challengeId: plan.challengeId, subjectIds: [plan.id] }, { singletonKey: plan.id });
        }
      } else if (fp.status === 'REJECTED' || fp.status === 'CANCELLED') {
        await step('REJECTED', 'fp_rejected', { rejectedReason: fp.status, finalAt: now });
        await settleWaitingPlans(tx, mandate.id, 'FAILED', 'mandate_rejected_or_expired', { failureCode: 'MANDATE_REJECTED', finalAt: now });
      }
    });
  }

  /** A cancel this app did not make: every ACTIVE SIP on the mandate stops (recovery is P2, spec §4.3). */
  private async revoke(tx: DbExecutor, mandate: MandateRow, now: Date): Promise<void> {
    await moveMandate(tx, mandate, 'CANCELLED', 'investor_or_fp_cancel', { fpStatus: 'CANCELLED', cancelledBy: 'EXTERNAL', finalAt: now });
    const active = await tx
      .select({ id: plans.id, status: plans.status })
      .from(plans)
      .where(and(eq(plans.mandateId, mandate.id), eq(plans.status, 'ACTIVE')));
    for (const plan of active) await movePlan(tx, plan, 'MANDATE_REVOKED', 'fp_mandate_cancelled_external', { finalAt: now });
    await this.notify.enqueue(tx, 'MANDATE_REVOKED', { investorId: mandate.investorId, data: {}, dedupeKey: `mandate-revoked:${mandate.id}` });
  }

  private async sagaLapsed(mandate: MandateRow, now: Date): Promise<boolean> {
    if (mandate.consentChallengeId === null) return false;
    const [record] = await this.dbh.db
      .select({ sagaExpiresAt: consentRecords.sagaExpiresAt })
      .from(consentRecords)
      .where(eq(consentRecords.challengeId, mandate.consentChallengeId))
      .limit(1);
    return record?.sagaExpiresAt != null && now.getTime() > record.sagaExpiresAt.getTime();
  }
}
```

`apps/api/src/modules/plans/sip-submit.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { PlanStatus } from '@sanchay/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpAmbiguousError, FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { toFpPlanView } from './fp-plan.js';
import { movePlan } from './plan-transitions.js';
import { mandates, PLAN_AUDIT_ACTIONS, plans } from './plans.schema.js';

/** From approve (CONSENT_SUBJECT_JOBS.SIP_REGISTRATION, a reused mandate) or from mandates.poll on approval. */
export interface SipSubmitData {
  challengeId: string;
  subjectIds: string[];
}

const ADVANCE_POLL_SECONDS = 30;

/** Worker only. POSTs the ONDC purchase plan inside useConsumed once its mandate is APPROVED. */
@Injectable()
@JobHandler('plans.sip.submit')
export class SipSubmitJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpTransact) private readonly fp: FpTransact,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'plans.sip.submit'>): Promise<void> {
    const { challengeId, subjectIds } = job.data as SipSubmitData;
    const db = this.dbh.db;
    let [plan] = await db
      .select()
      .from(plans)
      .where(and(inArray(plans.id, subjectIds), eq(plans.consentChallengeId, challengeId)));
    if (plan === undefined) return;
    if (plan.status === 'CONSENT_PENDING') {
      await movePlan(db, plan, 'CONSENTED', 'approve');
      plan = { ...plan, status: 'CONSENTED' as PlanStatus };
    }
    if (plan.status !== 'CONSENTED' && plan.status !== 'MANDATE_SETUP') return; // already submitted or settled

    const [mandate] = await db.select().from(mandates).where(eq(mandates.id, plan.mandateId));
    const fpMandateId = mandate?.status === 'APPROVED' ? mandate.fpMandateId : null;
    if (fpMandateId === null) {
      throw new AppError('MANDATE_STATE_INVALID', { message: 'plans.sip.submit needs an APPROVED mandate' });
    }
    const [investor] = await db.select().from(investors).where(eq(investors.id, plan.investorId));
    const [scheme] = await db.select().from(schemes).where(eq(schemes.id, plan.schemeId));
    const mfia = investor?.fpMfInvestmentAccountId ?? null;
    if (scheme === undefined || mfia === null) throw new AppError('INTERNAL', { message: 'plan has no scheme or FP investment account' });

    const current = plan;
    const trigger = current.status === 'CONSENTED' ? 'mandate_reused_with_headroom' : 'mandate_approved';
    let raw: Record<string, unknown>;
    try {
      raw = await this.consent.useConsumed(challengeId, async (consumed) => {
        await movePlan(db, current, 'SUBMITTING', trigger);
        // FP refuses gateway, initiated_via and start_date on plans; partner/euin are never sent (H-11).
        return this.fp.createPurchasePlan(
          {
            mf_investment_account: mfia,
            scheme: scheme.isin,
            frequency: 'monthly',
            installment_day: current.installmentDay,
            ...(current.numberOfInstalments === null ? {} : { number_of_installments: current.numberOfInstalments }),
            amount: current.amount,
            systematic: true,
            payment_method: 'mandate',
            payment_source: String(fpMandateId),
            source_ref_id: current.id,
            user_ip: current.userIp,
            initiated_by: 'investor',
          },
          consumed,
        );
      });
    } catch (err) {
      await this.onFailure(current.id, challengeId, err);
      return;
    }

    const view = toFpPlanView(raw);
    await db.transaction(async (tx) => {
      await movePlan(tx, { id: current.id, status: 'SUBMITTING' }, 'UNDER_REVIEW', 'fp_created', { fpPlanId: view.id, fpState: view.state });
      await this.audit.record(tx, { action: PLAN_AUDIT_ACTIONS.SIP_SUBMITTED, actorType: 'SYSTEM', entityType: 'plans', entityId: current.id });
      await this.jobs.enqueue(tx, 'plans.sip.advance', { planId: current.id, challengeId }, { startAfter: ADVANCE_POLL_SECONDS, singletonKey: current.id });
    });
  }

  private async onFailure(planId: string, challengeId: string, err: unknown): Promise<void> {
    const db = this.dbh.db;
    const now = this.clock.now();
    const [after] = await db.select().from(plans).where(eq(plans.id, planId));
    if (after === undefined) throw err;
    if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && after.status === 'CONSENTED') {
      await movePlan(db, after, 'CONSENT_EXPIRED', 'execute_before_missed', { finalAt: now });
      return;
    }
    if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && after.status === 'MANDATE_SETUP') {
      await movePlan(db, after, 'CONSENT_EXPIRED', 'seven_day_saga_no_plan_write', { finalAt: now });
      return;
    }
    if (after.status === 'SUBMITTING' && err instanceof FpRejectedError) {
      await movePlan(db, after, 'REJECTED', 'live_check_failed', { failureCode: err.providerCode ?? `HTTP_${err.httpStatus}`, finalAt: now });
      return;
    }
    if (after.status === 'SUBMITTING' && (err instanceof FpAmbiguousError || !(err instanceof AppError))) {
      await db.transaction(async (tx) => {
        await movePlan(tx, after, 'RECONCILING', 'ambiguous');
        // plans.sip.advance adopts it by source_ref_id (= plan id).
        await this.jobs.enqueue(tx, 'plans.sip.advance', { planId, challengeId }, { startAfter: ADVANCE_POLL_SECONDS, singletonKey: planId });
      });
      return;
    }
    throw err;
  }
}
```

`apps/api/src/modules/plans/sip-advance.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpRejectedError } from '../../integrations/fp/fp-errors.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { FpTransact } from '../../integrations/fp/fp-transact.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { InvestorAccounts } from '../identity/investor-accounts.service.js';
import { ConsentEngine } from '../legal-consent/consent-engine.js';
import { Notify } from '../notifications/notify.service.js';
import { orderEvents } from '../orders/orders.schema.js';
import { AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock, MINUTE } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { Jobs } from '../platform/jobs/jobs.service.js';
import { type FpPlanView, toFpPlanView } from './fp-plan.js';
import { movePlan } from './plan-transitions.js';
import { PLAN_AUDIT_ACTIONS, plans } from './plans.schema.js';

export interface SipAdvanceData {
  planId: string;
  challengeId: string;
}

type PlanRow = typeof plans.$inferSelect;
const POLL_SECONDS = 60;

/**
 * Worker only. Drives a submitted plan through FP review, the consent + confirm PATCH, and activation;
 * also adopts a RECONCILING plan by source_ref_id. Re-enqueues itself while FP is working.
 */
@Injectable()
@JobHandler('plans.sip.advance')
export class SipAdvanceJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ConsentEngine) private readonly consent: ConsentEngine,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(FpTransact) private readonly fp: FpTransact,
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Notify) private readonly notify: Notify,
    @Inject(Jobs) private readonly jobs: Jobs,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(job: Job<'plans.sip.advance'>): Promise<void> {
    const { planId, challengeId } = job.data as SipAdvanceData;
    const db = this.dbh.db;
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
    if (plan === undefined) return;
    if (plan.status === 'RECONCILING' && plan.fpPlanId === null) return this.adopt(plan, challengeId);
    if ((plan.status !== 'UNDER_REVIEW' && plan.status !== 'CONFIRMING') || plan.fpPlanId === null) return;

    const view = toFpPlanView(await this.fpRead.purchasePlan(plan.fpPlanId));
    const now = this.clock.now();
    if (view.state === 'failed' || view.state === 'cancelled') {
      const trigger = plan.status === 'UNDER_REVIEW' ? 'fp_review_failed' : 'fp_confirm_rejected';
      await movePlan(db, plan, 'REJECTED', trigger, { fpState: view.state, finalAt: now });
      return;
    }
    if (plan.status === 'CONFIRMING' && view.state === 'active') {
      await this.activate(plan, view);
      return;
    }
    // UNDER_REVIEW at review_completed, or a CONFIRMING plan whose confirm PATCH never landed.
    if (view.state === 'review_completed') {
      try {
        await this.consent.useConsumed(challengeId, async (consumed) => {
          if (plan.status === 'UNDER_REVIEW') await movePlan(db, plan, 'CONFIRMING', 'fp_review_completed', { fpState: view.state });
          await this.fp.updatePurchasePlan({ id: view.id, consent: await this.contacts(plan.investorId), state: 'confirmed' }, consumed);
        });
      } catch (err) {
        const [after] = await db.select().from(plans).where(eq(plans.id, planId));
        if (err instanceof AppError && err.code === 'CONSENT_EXPIRED' && after?.status === 'UNDER_REVIEW') {
          await movePlan(db, after, 'CONSENT_EXPIRED', 'saga_expired_under_review', { finalAt: now });
          return;
        }
        if (err instanceof FpRejectedError && after?.status === 'CONFIRMING') {
          await movePlan(db, after, 'REJECTED', 'fp_confirm_rejected', { failureCode: err.providerCode ?? `HTTP_${err.httpStatus}`, finalAt: now });
          return;
        }
        throw err;
      }
    }
    await this.jobs.enqueue(db, 'plans.sip.advance', { planId, challengeId }, { startAfter: POLL_SECONDS, singletonKey: planId });
  }

  private async activate(plan: PlanRow, view: FpPlanView): Promise<void> {
    const firstInstalmentDate = view.startDate ?? plan.firstInstalmentDateShown;
    const [scheme] = await this.dbh.db.select({ name: schemes.name }).from(schemes).where(eq(schemes.id, plan.schemeId));
    await this.dbh.db.transaction(async (tx) => {
      await movePlan(tx, plan, 'ACTIVE', 'fp_submitted_active', {
        fpState: view.state,
        firstInstalmentDate,
        nextInstalmentDate: view.nextInstallmentDate ?? firstInstalmentDate,
      });
      await this.audit.record(tx, { action: PLAN_AUDIT_ACTIONS.SIP_ACTIVATED, actorType: 'SYSTEM', entityType: 'plans', entityId: plan.id });
      await this.notify.enqueue(tx, 'SIP_ACTIVE', {
        investorId: plan.investorId,
        data: { schemeName: scheme?.name ?? '', firstInstalmentDate },
        dedupeKey: `sip-active:${plan.id}`,
      });
    });
  }

  /** LOOKUP-ADOPT by source_ref_id; absent 10 minutes after entering RECONCILING -> FAILED. */
  private async adopt(plan: PlanRow, challengeId: string): Promise<void> {
    const db = this.dbh.db;
    const [investor] = await db.select().from(investors).where(eq(investors.id, plan.investorId));
    const mfia = investor?.fpMfInvestmentAccountId ?? null;
    if (mfia === null) throw new AppError('INTERNAL', { message: 'plan investor has no FP investment account' });
    const { items } = await this.fpRead.purchasePlans({ mfInvestmentAccount: mfia });
    const found = items.map(toFpPlanView).find((p) => p.sourceRefId === plan.id);
    if (found !== undefined) {
      await movePlan(db, plan, 'UNDER_REVIEW', 'lookup_adopt_mapped', { fpPlanId: found.id, fpState: found.state });
    } else {
      const [entered] = await db
        .select({ at: orderEvents.occurredAt })
        .from(orderEvents)
        .where(and(eq(orderEvents.planId, plan.id), eq(orderEvents.toStatus, 'RECONCILING')))
        .orderBy(desc(orderEvents.occurredAt))
        .limit(1);
      const now = this.clock.now();
      if (entered !== undefined && now.getTime() - entered.at.getTime() >= 10 * MINUTE) {
        await movePlan(db, plan, 'FAILED', 'provider_object_absent', { failureCode: 'PROVIDER_OBJECT_ABSENT', finalAt: now });
        return;
      }
    }
    await this.jobs.enqueue(db, 'plans.sip.advance', { planId: plan.id, challengeId }, { startAfter: POLL_SECONDS, singletonKey: plan.id });
  }

  /** The contacts the consent OTP went to (research fp-api §2 consent object). */
  private async contacts(investorId: string): Promise<Record<string, string>> {
    const [investor] = await this.dbh.db.select().from(investors).where(eq(investors.id, investorId));
    if (investor === undefined) throw new AppError('NOT_FOUND');
    const mobile = this.accounts.decryptMobile(investor).replace(/^\+?91/, '');
    const email = this.accounts.decryptEmail(investor);
    return { isd_code: '91', mobile, ...(email === null ? {} : { email }) };
  }
}
```

`apps/api/src/modules/plans/instalments-sync.job.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { type FpOrderState, fpStateToOrderStatus, type OrderStatus } from '@sanchay/domain';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { FpRead } from '../../integrations/fp/fp-read.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { Notify } from '../notifications/notify.service.js';
import { toFpPurchaseView } from '../orders/fp-purchase.js';
import { orderEvents, orders } from '../orders/orders.schema.js';
import { newId } from '../platform/ids.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { mandates, plans } from './plans.schema.js';

type PlanRow = typeof plans.$inferSelect;
const FP_ORDER_STATES = new Set(['under_review', 'pending', 'submitted', 'successful', 'failed', 'expired', 'reversed']);
const MISSED: ReadonlySet<OrderStatus> = new Set<OrderStatus>(['FAILED', 'EXPIRED']);

/**
 * Worker only, 08:30 and 20:30 IST. Mirrors each ACTIVE plan's FP instalments (mf_purchases with
 * `plan` set) into orders(origin='SIP_INSTALMENT'). FP creates and moves these orders; nothing here
 * writes to FP, so no consent applies (SEBI-2FA-S) and statuses are copied, not stepped via moveOrder.
 */
@Injectable()
@JobHandler('plans.instalments.sync')
export class InstalmentsSyncJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(FpRead) private readonly fpRead: FpRead,
    @Inject(Notify) private readonly notify: Notify,
  ) {}

  async handle(_job: Job<'plans.instalments.sync'>): Promise<void> {
    const active = await this.dbh.db
      .select()
      .from(plans)
      .where(and(eq(plans.status, 'ACTIVE'), isNotNull(plans.fpPlanId)));
    for (const plan of active) await this.syncPlan(plan);
  }

  private async syncPlan(plan: PlanRow): Promise<void> {
    const db = this.dbh.db;
    const [mandate] = await db.select({ bankAccountId: mandates.bankAccountId }).from(mandates).where(eq(mandates.id, plan.mandateId));
    if (mandate === undefined) return;
    const { items } = await this.fpRead.purchases({ plan: plan.fpPlanId as string });
    for (const raw of items) {
      const fp = toFpPurchaseView(raw);
      if (!FP_ORDER_STATES.has(fp.state)) continue;
      const status = fpStateToOrderStatus(fp.state as FpOrderState, { unitsAllotted: fp.allottedUnits !== null });
      const mirrored = {
        fpState: fp.state,
        allottedUnits: fp.allottedUnits,
        purchasedAmount: fp.purchasedAmount,
        allottedNavDate: fp.allottedNavDate,
        failureCode: fp.failureCode,
      };
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: orders.id, status: orders.status, fpState: orders.fpState })
          .from(orders)
          .where(and(eq(orders.planId, plan.id), eq(orders.fpOrderId, fp.id)));
        if (existing === undefined) {
          const orderId = newId('orders');
          await tx.insert(orders).values({
            id: orderId,
            createdBy: plan.investorId,
            updatedBy: plan.investorId,
            investorId: plan.investorId,
            type: 'PURCHASE',
            origin: 'SIP_INSTALMENT',
            planId: plan.id,
            schemeId: plan.schemeId,
            folioId: plan.folioId,
            amount: plan.amount,
            status,
            bankAccountId: mandate.bankAccountId,
            arn: plan.arn,
            initiatedVia: plan.initiatedVia,
            userIp: plan.userIp,
            fpOrderId: fp.id,
            fpOldId: fp.oldId,
            ...mirrored,
          });
          await tx.insert(orderEvents).values({ orderId, planId: plan.id, toStatus: status, trigger: 'fp_instalment_sync' });
          return;
        }
        if (existing.status === status && existing.fpState === fp.state) return;
        await tx.update(orders).set({ ...mirrored, status }).where(eq(orders.id, existing.id));
        if (existing.status !== status) {
          await tx.insert(orderEvents).values({ orderId: existing.id, planId: plan.id, fromStatus: existing.status, toStatus: status, trigger: 'fp_instalment_sync' });
        }
      });
    }
    await this.warnOnMisses(plan);
  }

  /** Two consecutive FAILED/EXPIRED instalments -> one warning per miss streak (keyed by the streak's first miss). */
  private async warnOnMisses(plan: PlanRow): Promise<void> {
    const recent = await this.dbh.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.planId, plan.id), eq(orders.origin, 'SIP_INSTALMENT')))
      .orderBy(desc(orders.fpOldId))
      .limit(12);
    const streak: typeof recent = [];
    for (const order of recent) {
      if (!MISSED.has(order.status)) break;
      streak.push(order);
    }
    const streakStart = streak.at(-1);
    if (streak.length < 2 || streakStart === undefined) return;
    const [scheme] = await this.dbh.db.select({ name: schemes.name }).from(schemes).where(eq(schemes.id, plan.schemeId));
    await this.notify.enqueue(this.dbh.db, 'SIP_INSTALMENT_MISSED_WARNING', {
      investorId: plan.investorId,
      data: { schemeName: scheme?.name ?? '' },
      dedupeKey: `sip-missed:${plan.id}:${streakStart.id}`,
    });
  }
}
```

`apps/api/src/integrations/fp/fp-transact.ts` (replace the four stubs):
```ts
  async createPurchasePlan(input: Record<string, unknown>, consent: ConsumedConsent): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchasePlan.create', {
      body: input,
      consent,
      aggregate: { type: 'plans', id: String(input.source_ref_id) },
    });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  /** ONDC plan confirm: `{id, consent, state:'confirmed'}` (research fp-api §4). */
  async updatePurchasePlan(input: { id: string } & Record<string, unknown>, consent: ConsumedConsent): Promise<Record<string, unknown>> {
    const result = await this.transport.call('purchasePlan.update', { body: input, consent });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  async createMandate(
    input: { bankAccountId: number; mandateType: 'UPI' | 'E_MANDATE'; mandateLimit: number },
    consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    const body = {
      mandate_type: input.mandateType,
      bank_account_id: input.bankAccountId,
      mandate_limit: input.mandateLimit,
      provider_name: 'CYBRILLAPOA',
    };
    const result = await this.transport.call('mandate.create', { body, consent });
    return (result.body ?? {}) as Record<string, unknown>;
  }

  /**
   * UPI returns the intent in `upi.uri`; E_MANDATE (F3) returns a bank `token_url`. No postback URL: the
   * app polls `mandates.poll`.
   */
  async authoriseMandate(
    input: { mandateId: string; mandateType: 'UPI' | 'E_MANDATE' },
    consent: ConsumedConsent,
  ): Promise<Record<string, unknown>> {
    const result = await this.transport.call('mandateAuth.create', {
      body: { mandate_id: Number(input.mandateId), ...(input.mandateType === 'UPI' ? { upi: { type: 'uri' } } : {}) },
      consent,
    });
    return (result.body ?? {}) as Record<string, unknown>;
  }
```

`apps/api/src/integrations/fp/fake/fake-fp.state.ts` (D4; key-level edits):
- `StoredPurchase`: add `plan: string | null;`.
- `StoredMandate`: `status` becomes mutable (it already is), and add `readonly raw: Record<string, unknown>;`.
- Add the plan store:
```ts
export interface StoredPurchasePlan {
  readonly id: string;
  readonly oldId: number;
  state: string;
  readonly sourceRefId: string;
  readonly mfInvestmentAccount: string;
  readonly paymentSource: string;
  consent: Record<string, unknown> | null;
  startDate: string | null;
  nextInstallmentDate: string | null;
  /** The create body exactly as received, for payload assertions. */
  readonly raw: Record<string, unknown>;
}
```
and in `FakeFpState`: `readonly purchasePlans = new Map<string, StoredPurchasePlan>();`.

`apps/api/src/integrations/fp/fake/fake-fp.ts` (D4; key-level edits):
- `purchasePayload`: add `plan: p.plan,`. The `purchase.create` case sets `plan: null`, and `mandate.create` stores `raw: body`.
- Replace the `purchase.list` case:
```ts
      case 'purchase.list': {
        const sourceRefId = query.get('source_ref_id');
        const plan = query.get('plan');
        const bySource = sourceRefId === null ? [...this.state.purchases.values()] : this.state.findPurchasesBySourceRefId(sourceRefId);
        const items = plan === null ? bySource : bySource.filter((p) => p.plan === plan);
        return { statusCode: 200, data: { object: 'list', data: items.map(purchasePayload) } };
      }
```
- Add the cases below before `default`, the `planPayload`/`mandatePayload` helpers beside `purchasePayload`, and the three test helpers beside `advance`:
```ts
function planPayload(p: StoredPurchasePlan): Record<string, unknown> {
  return {
    ...p.raw,
    object: 'mf_purchase_plan',
    id: p.id,
    old_id: p.oldId,
    state: p.state,
    consent: p.consent,
    start_date: p.startDate,
    next_installment_date: p.nextInstallmentDate,
  };
}

function mandatePayload(m: StoredMandate): Record<string, unknown> {
  return { id: m.id, mandate_ref: m.mandateRef, mandate_status: m.status, umrn: m.status === 'APPROVED' ? `UMRN${m.id}` : null };
}

const fpError = (statusCode: number, code: string, message: string): FakeReply => ({
  statusCode,
  data: { error: { status: statusCode, code, message } },
});
```
```ts
      case 'mandate.get': {
        const mandate = this.state.mandates.get(Number(params.id));
        return mandate === undefined ? fpError(404, 'NOT_FOUND', `mandate ${params.id} not found`) : { statusCode: 200, data: mandatePayload(mandate) };
      }
      case 'mandateAuth.create': {
        const mandate = this.state.mandates.get(Number(body.mandate_id));
        if (mandate === undefined) return fpError(404, 'NOT_FOUND', `mandate ${String(body.mandate_id)} not found`);
        if (mandate.status !== 'CREATED') return fpError(400, 'INVALID_STATE', 'mandate is not awaiting authorisation');
        if (!Object.hasOwn(body, 'upi')) {
          return { statusCode: 200, data: { mandate_id: mandate.id, token_url: `https://pg.fake.local/emandate/${mandate.mandateRef}` } };
        }
        return { statusCode: 200, data: { mandate_id: mandate.id, upi: { type: 'uri', uri: `upi://mandate?pa=fake@upi&tr=${mandate.mandateRef}` } } };
      }
      case 'purchasePlan.create': {
        const refused = ['gateway', 'initiated_via', 'start_date'].filter((key) => Object.hasOwn(body, key));
        if (refused.length > 0) return fpError(400, 'UNSUPPORTED_PARAMETER', `not accepted on purchase plans: ${refused.join(', ')}`);
        const id = this.state.nextId('mfpp_');
        const plan: StoredPurchasePlan = {
          id,
          oldId: this.state.nextOldId(),
          state: 'created',
          sourceRefId: String(body.source_ref_id ?? ''),
          mfInvestmentAccount: String(body.mf_investment_account ?? ''),
          paymentSource: String(body.payment_source ?? ''),
          consent: null,
          startDate: null,
          nextInstallmentDate: null,
          raw: body,
        };
        this.state.purchasePlans.set(id, plan);
        return { statusCode: 200, data: planPayload(plan) };
      }
      case 'purchasePlan.get': {
        const plan = this.state.purchasePlans.get(params.id!);
        return plan === undefined ? fpError(404, 'NOT_FOUND', `mf_purchase_plan ${params.id} not found`) : { statusCode: 200, data: planPayload(plan) };
      }
      case 'purchasePlan.list': {
        const account = query.get('mf_investment_account');
        const items = [...this.state.purchasePlans.values()].filter((p) => account === null || p.mfInvestmentAccount === account);
        return { statusCode: 200, data: { object: 'list', data: items.map(planPayload) } };
      }
      case 'purchasePlan.update': {
        const plan = this.state.purchasePlans.get(String(body.id ?? ''));
        if (plan === undefined) return fpError(404, 'NOT_FOUND', `mf_purchase_plan ${String(body.id)} not found`);
        if (Object.hasOwn(body, 'consent')) plan.consent = body.consent as Record<string, unknown>;
        if (body.state === 'confirmed') {
          const mandate = this.state.mandates.get(Number(plan.paymentSource));
          if (plan.state !== 'review_completed' || plan.consent === null) return fpError(400, 'INVALID_STATE', 'confirm needs review_completed + consent');
          if (mandate?.status !== 'APPROVED') return fpError(400, 'MANDATE_NOT_APPROVED', 'payment_source mandate is not APPROVED');
          plan.state = 'confirmed';
        }
        return { statusCode: 200, data: planPayload(plan) };
      }
```
```ts
  advanceMandate(id: number, status: StoredMandate['status']): void {
    const mandate = this.state.mandates.get(id);
    if (mandate === undefined) throw new Error(`FakeFp.advanceMandate: unknown mandate ${id}`);
    mandate.status = status;
  }

  advancePlan(id: string, state: string, fields: { startDate?: string; nextInstallmentDate?: string } = {}): void {
    const plan = this.state.purchasePlans.get(id);
    if (plan === undefined) throw new Error(`FakeFp.advancePlan: unknown plan ${id}`);
    plan.state = state;
    if (fields.startDate !== undefined) plan.startDate = fields.startDate;
    if (fields.nextInstallmentDate !== undefined) plan.nextInstallmentDate = fields.nextInstallmentDate;
  }

  /** An instalment FP raised on a plan (an mf_purchase with `plan` set); returns its id for `advance`. */
  addInstalment(planId: string, state: string): string {
    const plan = this.state.purchasePlans.get(planId);
    if (plan === undefined) throw new Error(`FakeFp.addInstalment: unknown plan ${planId}`);
    const id = this.state.nextId('mfp_');
    const oldId = this.state.nextOldId();
    this.state.purchases.set(id, {
      id,
      oldId,
      state,
      amount: String(plan.raw.amount ?? '0.00'),
      scheme: String(plan.raw.scheme ?? ''),
      mfInvestmentAccount: plan.mfInvestmentAccount,
      sourceRefId: '',
      folioNumber: null,
      consent: null,
      plan: planId,
    });
    this.state.purchasesByOldId.set(oldId, id);
    return id;
  }
```
(Import `StoredMandate` and `StoredPurchasePlan` alongside `StoredPurchase`.)

`packages/contract/src/plans.ts`:
```ts
import { oc } from '@orpc/contract';
import { moneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) => oc.route({ method, path, tags: ['plans'], summary });
const IDEMPOTENCY = ['IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS'] as const;

/** Monthly is the only launch frequency, so it is not an input; strictObject refuses a `frequency` key. */
export const CreateSipInputSchema = z.strictObject({
  schemeId: z.uuid(),
  amount: moneyWireSchema,
  installmentDay: z.number().int().min(1).max(28),
  numberOfInstalments: z.number().int().min(1).max(360).nullable().default(null),
});

export const SipCreatedSchema = z.strictObject({
  planId: z.uuid(),
  mandateId: z.uuid(),
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime(),
  newMandate: z.boolean(),
  firstInstalmentDate: z.iso.date(),
});

export const PlanSchema = z.object({
  id: z.uuid(),
  schemeId: z.uuid(),
  mandateId: z.uuid(),
  amount: moneyWireSchema,
  frequency: z.literal('MONTHLY'),
  installmentDay: z.number().int(),
  numberOfInstalments: z.number().int().nullable(),
  status: z.string(),
  firstInstalmentDateShown: z.iso.date(),
  firstInstalmentDate: z.iso.date().nullable(),
  nextInstalmentDate: z.iso.date().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const plansContract = {
  createSip: route('POST', '/plans/sips', 'Register a monthly SIP and its consent challenge')
    .errors(
      errorMap(
        ...COMMON_ERRORS,
        ...SESSION_ERRORS,
        ...IDEMPOTENCY,
        'FEATURE_DISABLED',
        'PURCHASE_BLOCKED',
        'SCHEME_NOT_ORDERABLE',
        'SIP_DAY_INVALID',
        'AMOUNT_BELOW_MIN',
        'AMOUNT_ABOVE_MAX',
        'AMOUNT_NOT_MULTIPLE',
        'MANDATE_LIMIT_EXCEEDED',
        'BANK_NOT_VERIFIED',
        'CONSENT_DESTINATION_UNAVAILABLE',
      ),
    )
    .input(CreateSipInputSchema)
    .output(SipCreatedSchema),
  list: route('GET', '/plans', 'List my SIPs').errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS)).output(z.array(PlanSchema)),
  get: route('GET', '/plans/{id}', 'Get one of my SIPs')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({ id: z.uuid() }))
    .output(PlanSchema),
};
```

`packages/contract/src/mandates.ts`:
```ts
import { oc } from '@orpc/contract';
import { moneyWireSchema } from '@sanchay/validation';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) => oc.route({ method, path, tags: ['mandates'], summary });

export const MandateSchema = z.object({
  id: z.uuid(),
  rail: z.string(),
  limitAmount: moneyWireSchema,
  status: z.string(),
  /** The UPI intent to open, present only while AUTH_PENDING. */
  upiUri: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const mandatesContract = {
  list: route('GET', '/mandates', 'List my mandates').errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS)).output(z.array(MandateSchema)),
  get: route('GET', '/mandates/{id}', 'Get one of my mandates')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({ id: z.uuid() }))
    .output(MandateSchema),
  authorize: route('POST', '/mandates/{id}/authorize', 'Re-mint the UPI Autopay intent for a pending mandate')
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS, 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS', 'MANDATE_STATE_INVALID'))
    .input(z.strictObject({ id: z.uuid() }))
    .output(z.strictObject({ ok: z.literal(true) })),
};
```

`apps/api/src/modules/plans/plans.router.ts`:
```ts
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import type { plans } from './plans.schema.js';
import { SipService } from './sip.service.js';

const toWire = (row: typeof plans.$inferSelect) => ({
  id: row.id,
  schemeId: row.schemeId,
  mandateId: row.mandateId,
  amount: row.amount,
  frequency: row.frequency,
  installmentDay: row.installmentDay,
  numberOfInstalments: row.numberOfInstalments,
  status: row.status,
  firstInstalmentDateShown: row.firstInstalmentDateShown,
  firstInstalmentDate: row.firstInstalmentDate,
  nextInstalmentDate: row.nextInstalmentDate,
  failureCode: row.failureCode,
  createdAt: row.createdAt.toISOString(),
});

@Controller()
export class PlansRouter {
  constructor(
    @Inject(SipService) private readonly sips: SipService,
    @Inject(IdempotencyService) private readonly idem: IdempotencyService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.plans.createSip)
  createSip() {
    return implement(contract.plans.createSip)
      .use(requireIdempotency(this.idem, this.cls))
      .handler(({ input }) => {
        const auth = requireAuth(this.cls);
        return this.sips.createSip({
          ...input,
          investorId: auth.investorId,
          userIp: this.cls.get('ip') ?? '0.0.0.0',
          initiatedVia: String(auth.platform).toUpperCase() === 'ANDROID' ? 'mobile_app_android' : 'web',
        });
      });
  }

  @Implement(contract.plans.list)
  list() {
    return implement(contract.plans.list).handler(async () => (await this.sips.list(requireAuth(this.cls).investorId)).map(toWire));
  }

  @Implement(contract.plans.get)
  get() {
    return implement(contract.plans.get).handler(async ({ input }) => toWire(await this.sips.get(requireAuth(this.cls).investorId, input.id)));
  }
}
```

`apps/api/src/modules/plans/mandates.router.ts`:
```ts
import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { requireAuth } from '../identity/request-auth.js';
import { requireIdempotency } from '../platform/idempotency.middleware.js';
import { IdempotencyService } from '../platform/idempotency.service.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { MandatesService } from './mandates.service.js';
import type { mandates } from './plans.schema.js';

const toWire = (row: typeof mandates.$inferSelect) => ({
  id: row.id,
  rail: row.rail,
  limitAmount: row.limitAmount,
  status: row.status,
  upiUri: row.status === 'AUTH_PENDING' ? row.upiUri : null,
  approvedAt: row.approvedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

@Controller()
export class MandatesRouter {
  constructor(
    @Inject(MandatesService) private readonly mandatesService: MandatesService,
    @Inject(IdempotencyService) private readonly idem: IdempotencyService,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.mandates.list)
  list() {
    return implement(contract.mandates.list).handler(async () => (await this.mandatesService.list(requireAuth(this.cls).investorId)).map(toWire));
  }

  @Implement(contract.mandates.get)
  get() {
    return implement(contract.mandates.get).handler(async ({ input }) =>
      toWire(await this.mandatesService.get(requireAuth(this.cls).investorId, input.id)),
    );
  }

  @Implement(contract.mandates.authorize)
  authorize() {
    return implement(contract.mandates.authorize)
      .use(requireIdempotency(this.idem, this.cls))
      .handler(({ input }) => this.mandatesService.authorize(requireAuth(this.cls).investorId, input.id));
  }
}
```

`apps/api/src/modules/plans/plans.module.ts`:
```ts
import { type DynamicModule, Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CONSENT_SUBJECT_JOBS } from '../legal-consent/consent-engine.js';
import { LegalConsentModule } from '../legal-consent/legal-consent.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InstalmentsSyncJob } from './instalments-sync.job.js';
import { MandatesPollJob } from './mandates-poll.job.js';
import { MandatesRouter } from './mandates.router.js';
import { MandatesService } from './mandates.service.js';
import { MandatesSubmitJob } from './mandates-submit.job.js';
import { PlansRouter } from './plans.router.js';
import { SipAdvanceJob } from './sip-advance.job.js';
import { SipService } from './sip.service.js';
import { SipSubmitJob } from './sip-submit.job.js';

// Loaded in every role: approve (api) reads these to start the saga.
CONSENT_SUBJECT_JOBS.MANDATE_REGISTRATION = 'mandates.submit';
CONSENT_SUBJECT_JOBS.SIP_REGISTRATION = 'plans.sip.submit';

@Module({})
export class PlansModule {
  static forRoot(env: Env): DynamicModule {
    const workerOnly =
      env.SANCHAY_APP_ROLE === 'worker' ? [MandatesSubmitJob, MandatesPollJob, SipSubmitJob, SipAdvanceJob, InstalmentsSyncJob] : [];
    return {
      module: PlansModule,
      imports: [LegalConsentModule, IdentityModule, NotificationsModule],
      controllers: [PlansRouter, MandatesRouter],
      providers: [SipService, MandatesService, ...workerOnly],
      exports: [SipService, MandatesService],
    };
  }
}
```

Key-level edits:
- `apps/api/src/modules/platform/jobs/job-registry.ts`: append `'mandates.submit'`, `'mandates.poll'`, `'plans.sip.submit'`, `'plans.sip.advance'`, `'plans.instalments.sync'` to `JOB_NAMES`.
- `apps/api/src/modules/platform/jobs/schedules.ts` (inside `registerSchedules`):
```ts
  await boss.schedule('mandates.poll', '*/10 * * * *', { scope: 'PENDING' }, { tz, key: 'mandates-poll-pending' });
  await boss.schedule('mandates.poll', '30 7 * * *', { scope: 'APPROVED' }, { tz, key: 'mandates-poll-approved' });
  await boss.schedule('plans.instalments.sync', '30 8 * * *', {}, { tz, key: 'plans-instalments-morning' });
  await boss.schedule('plans.instalments.sync', '30 20 * * *', {}, { tz, key: 'plans-instalments-evening' });
```
- `apps/api/src/modules/platform/ids.ts`: append `'plans' | 'mandates'`.
- `packages/contract/src/errors.ts`: append `PLAN_STATE_INVALID: 409` and `MANDATE_STATE_INVALID: 409`.
- `packages/app-core/src/errors/messages.ts`: add `['PLAN_STATE_INVALID', 'This SIP can no longer be changed.']` and `['MANDATE_STATE_INVALID', 'This mandate is not waiting for your approval right now.']`. The C6 all-codes test stays green.
- `packages/contract/src/index.ts`: add `plans: plansContract` and `mandates: mandatesContract`, then regenerate `apps/api/openapi.json`.
- `apps/api/src/app.module.ts`: add `PlansModule.forRoot(env)`.

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api db:generate --name=plans_mandates
pnpm --filter=@sanchay/api db:generate --custom --name=plans_mandates_guard
pnpm --filter=@sanchay/domain test -- sip-dates
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- sip-mandate
pnpm --filter=@sanchay/app-core test
pnpm --filter=@sanchay/api openapi
git diff --exit-code apps/api/openapi.json
```
Paste the trigger SQL above into the generated `0027_plans_mandates_guard.sql` before running the tests. Expected:
- `sip-dates` 8/8.
- `sip-eligibility` 8/8 and `fp-plan` 3/3.
- `plans` (contract) 3/3.
- `sip-mandate.int.test.ts` 17/17.
- The app-core all-codes test is green.
- `openapi.json` is clean after regeneration.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/domain/src/rules packages/domain/test/sip-dates.test.ts apps/api/src/modules/plans apps/api/src/modules/orders/orders.schema.ts apps/api/src/integrations/fp apps/api/src/db/app-schema.ts apps/api/src/modules/platform apps/api/src/app.module.ts apps/api/test/int packages/contract/src packages/app-core/src/errors/messages.ts
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int -- sip-mandate
pnpm lint
git add packages/domain/src/rules packages/domain/test/sip-dates.test.ts apps/api/src/modules/plans apps/api/src/modules/orders/orders.schema.ts apps/api/src/integrations/fp/fp-transact.ts apps/api/src/integrations/fp/fake apps/api/src/db/app-schema.ts apps/api/src/modules/platform/jobs apps/api/src/modules/platform/ids.ts apps/api/src/app.module.ts apps/api/drizzle apps/api/openapi.json apps/api/test/int/sip-seed.ts apps/api/test/int/sip-mandate.int.test.ts packages/contract/src packages/app-core/src/errors/messages.ts
git commit -m "feat(api): SIP registration and UPI Autopay mandate backend (F2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task F3: [T6] eNACH rail and limit ladder (Dev A, 6 h) (trim candidate)

**Files:**
- **Create:** `packages/domain/src/rules/mandate-ladder.ts`, `packages/domain/test/mandate-ladder.test.ts`, `apps/api/test/int/mandate-enach.int.test.ts`
- **Create (migration):** `apps/api/drizzle/0028_mandates_auth_url.sql` (generated: `mandates.auth_url_enc`)
- **Modify (F2 files):** `apps/api/src/modules/plans/{plans.schema.ts, fp-plan.ts, fp-plan.test.ts, sip-eligibility.ts, sip-eligibility.test.ts, sip.service.ts, mandates-submit.job.ts, mandates.service.ts, mandates.router.ts}`, `packages/contract/src/plans.ts`, `packages/contract/src/plans.test.ts`, `packages/contract/src/mandates.ts`, `apps/api/openapi.json`
- **Modify:** `packages/domain/src/rules/index.ts`

**Interfaces:**
- **Prerequisites:** F2. F2's `MandatesSubmitJob` already sends `mandate_type`/`mandate_limit` from the mandate row and asks for a UPI intent only for `UPI`. F2's FakeFp also already returns a `token_url` when no `upi` key is sent. So this task adds no second submit job and changes no FP call.
- **Consumes:** `Money`, `Rounding` (`@sanchay/money`); `MANDATE_RAILS`, `type MandateRail` (`@sanchay/domain`); `Crypto.encrypt/decrypt(…, {table, column, rowId})` and `asRowId` (Plan 01); the `mandates_limit_ck` CHECK (F2), which already allows every ladder rung, so no new CHECK is needed.
- **Produces:**
  - `mandateLimitFor(required: Money): Money | null` and `MANDATE_LIMIT_LADDER` in `@sanchay/domain`. It returns the smallest rung ≥ 1.5 × `required`, or `null` above the top rung (₹25,00,000). The 1.5× product is truncated (`Rounding.DOWN`) to money scale. That is the only mode that satisfies the spec boundaries: ML-02, 66,666.67 → ₹1,00,000, and ML-03, 66,666.68 → ₹2,00,000. `CEIL` or `HALF_UP` would push 66,666.67 into the ₹2,00,000 rung.
  - `plans.createSip` input gains `rail: 'UPI_AUTOPAY' | 'ENACH'`, default `'UPI_AUTOPAY'`.
  - **eNACH mandate sizing:**
    - Reuse works as in F2 but per rail: an `APPROVED` mandate of the same rail with headroom.
    - A new eNACH mandate's limit is `mandateLimitFor(Σ live plans on mandates of the same bank + this amount)`. "Live" uses F2's headroom predicate.
    - Above the top rung, the request is refused with `MANDATE_LIMIT_EXCEEDED`.
    - The UPI Autopay cap (₹1,00,000 per SIP) applies to the UPI rail only.
  - **Encrypted auth URL:** `mandates.auth_url_enc` (`bytea`) holds the eNACH `token_url`, encrypted with AAD `mandates.auth_url_enc.<id>`. It is written by `mandates.submit` and by a re-authorise.
  - **API:** `MandatesService.authUrlOf(row)` decrypts it. `mandates.get`/`list` return `authUrl`, which is set only for `ENACH` while `AUTH_PENDING`, next to F2's `upiUri`.
- **Review fixes** (the draft was written against F2's draft):
  - It redefined `MandatesSubmitJob` with a `handle({mandateId, challengeId})` payload and the invented `FpTransact.call('pg.*')`.
  - It added a `MandatesService.createOrReuse` that F2 never had.
  - It imported the subpath `@sanchay/domain/rules/mandate-ladder.js`, and threw an `Error` from `@sanchay/domain`, which cannot import `AppError`.
  - It relied on F2 having "reserved" an `authUrlEnc` column that no migration created.
  - Its tests used nonexistent helpers (`createInvestorWithBankAndFolio`, `approveConsentChallenge`, `t.jobs.runOnce`, `t.runtimeConfig`, `t.fixtures`, `fakeFp.lastEmandateTokenUrl`).
  - The fix: the ladder is a pure `Money | null` rule, the vectors live in the domain test, and the integration test reuses F2's `sip-seed.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/mandate-ladder.test.ts`:
```ts
import { Money } from '@sanchay/money';
import { describe, expect, it } from 'vitest';
import { mandateLimitFor } from '../src/rules/mandate-ladder.js';

const VECTORS: ReadonlyArray<{ id: string; sum: string; limit: string | null }> = [
  { id: 'ML-01', sum: '0.00', limit: '100000.00' },
  { id: 'ML-02', sum: '66666.67', limit: '100000.00' },
  { id: 'ML-03', sum: '66666.68', limit: '200000.00' },
  { id: 'ML-04', sum: '133333.33', limit: '200000.00' },
  { id: 'ML-05', sum: '133333.34', limit: '500000.00' },
  { id: 'ML-06', sum: '333333.33', limit: '500000.00' },
  { id: 'ML-07', sum: '333333.34', limit: '1000000.00' },
  { id: 'ML-08', sum: '1666666.68', limit: null },
];

describe('mandateLimitFor (ML-01..08)', () => {
  for (const v of VECTORS) {
    it(`${v.id}: Σ ${v.sum} -> ${v.limit ?? 'refused'}`, () => {
      expect(mandateLimitFor(Money.parse(v.sum))?.toWire() ?? null).toBe(v.limit);
    });
  }
});
```

Append to `apps/api/src/modules/plans/sip-eligibility.test.ts`'s `assertSipEligible` block:
```ts
  it('the ₹1,00,000 cap is UPI-only: eNACH above it passes here (the ladder decides)', () => {
    expect(() => assertSipEligible({ scheme, amount: Money.parse('150000.00'), installmentDay: 10, rail: 'ENACH' })).not.toThrow();
  });
```

Append to `apps/api/src/modules/plans/fp-plan.test.ts`:
```ts
describe('tokenUrlOf', () => {
  it('reads the eNACH token_url', () => {
    expect(tokenUrlOf({ token_url: 'https://pg.example/e/1' })).toBe('https://pg.example/e/1');
    expect(tokenUrlOf({ upi: { uri: 'upi://x' } })).toBeNull();
  });
});
```
(and add `tokenUrlOf` to that file's import).

Append to `packages/contract/src/plans.test.ts`:
```ts
describe('CreateSipInputSchema rail', () => {
  it('defaults to UPI_AUTOPAY and accepts ENACH only as the other rail', () => {
    expect(CreateSipInputSchema.parse(valid).rail).toBe('UPI_AUTOPAY');
    expect(CreateSipInputSchema.parse({ ...valid, rail: 'ENACH' }).rail).toBe('ENACH');
    expect(CreateSipInputSchema.safeParse({ ...valid, rail: 'NACH_PHYSICAL' }).success).toBe(false);
  });
});
```

`apps/api/test/int/mandate-enach.int.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ConsentApprovedJobData, ConsentEngine } from '../../src/modules/legal-consent/consent-engine.js';
import { consentChallenges } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { MandatesService } from '../../src/modules/plans/mandates.service.js';
import { MandatesSubmitJob } from '../../src/modules/plans/mandates-submit.job.js';
import { mandates } from '../../src/modules/plans/plans.schema.js';
import { SipService } from '../../src/modules/plans/sip.service.js';
import { Jobs } from '../../src/modules/platform/jobs/jobs.service.js';
import { bootFpTestApp, type FpTestApp } from './fake-fp.js';
import { jobOf } from './jobs.js';
import { seedSipInvestor, seedSipScheme, setSipEnabled } from './sip-seed.js';

let t: FpTestApp;
const enqueued: Array<{ name: string; data: unknown }> = [];

beforeAll(async () => {
  t = await bootFpTestApp();
  vi.spyOn(t.app.get(Jobs), 'enqueue').mockImplementation(async (_exec, name, data) => {
    enqueued.push({ name, data });
  });
  await setSipEnabled(t, true);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  enqueued.length = 0;
});

type SipInvestor = Awaited<ReturnType<typeof seedSipInvestor>>;

async function draftEnach(amount: string, investor?: SipInvestor) {
  const who = investor ?? (await seedSipInvestor(t));
  const scheme = await seedSipScheme(t);
  const created = await t.app.get(SipService).createSip({
    investorId: who.investorId,
    schemeId: scheme.id,
    amount,
    installmentDay: 10,
    numberOfInstalments: null,
    rail: 'ENACH',
    userIp: '203.0.113.10',
    initiatedVia: 'web',
  });
  return { investor: who, ...created };
}

async function approve(draft: { challengeId: string; investor: SipInvestor }): Promise<ConsentApprovedJobData> {
  const engine = t.app.get(ConsentEngine);
  const [row] = await t.db.db.select().from(consentChallenges).where(eq(consentChallenges.id, draft.challengeId));
  const needsEmail = row?.requiredFactors.includes('EMAIL') === true;
  await engine.sendOtp(draft.challengeId, 'SMS');
  if (needsEmail) await engine.sendOtp(draft.challengeId, 'EMAIL');
  await engine.approve(draft.challengeId, {
    smsCode: t.sms.latestCode(draft.investor.mobile) ?? '',
    ...(needsEmail ? { emailCode: t.email.latestCode(draft.investor.email) ?? '' } : {}),
  });
  const job = [...enqueued].reverse().find((j) => j.name === 'mandates.submit');
  expect(job, 'approve enqueues mandates.submit').toBeDefined();
  return job?.data as ConsentApprovedJobData;
}

const mandateOf = async (id: string) => (await t.db.db.select().from(mandates).where(eq(mandates.id, id)))[0];

describe('eNACH mandate', () => {
  it('E_MANDATE at the ladder limit; the token_url is stored encrypted and surfaced as authUrl, never upiUri', async () => {
    const draft = await draftEnach('2000.00');
    expect(await mandateOf(draft.mandateId)).toMatchObject({ rail: 'ENACH', limitAmount: '100000.00' });
    await t.app.get(MandatesSubmitJob).handle(jobOf('mandates.submit', await approve(draft)));

    const mandate = await mandateOf(draft.mandateId);
    expect(mandate).toMatchObject({ status: 'AUTH_PENDING', upiUri: null });
    expect(mandate?.authUrlEnc).toBeInstanceOf(Buffer);
    expect(t.fakeFp.state.mandates.get(Number(mandate?.fpMandateId))?.raw).toMatchObject({ mandate_type: 'E_MANDATE', mandate_limit: 100000 });
    expect(t.app.get(MandatesService).authUrlOf(mandate as NonNullable<typeof mandate>)).toBe(
      `https://pg.fake.local/emandate/${mandate?.mandateRef}`,
    );
  });

  it('sizes a new eNACH mandate at 1.5x the live SIPs on the same bank: 60,000 + 40,001 -> ₹2,00,000', async () => {
    const first = await draftEnach('60000.00');
    expect((await mandateOf(first.mandateId))?.limitAmount).toBe('100000.00');
    const second = await draftEnach('40001.00', first.investor);
    expect(second.newMandate).toBe(true);
    expect((await mandateOf(second.mandateId))?.limitAmount).toBe('200000.00');
  });

  it('above the top rung -> MANDATE_LIMIT_EXCEEDED', async () => {
    await expect(draftEnach('1700000.00')).rejects.toMatchObject({ code: 'MANDATE_LIMIT_EXCEEDED' });
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

```
pnpm --filter=@sanchay/domain test -- mandate-ladder
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- mandate-enach
```
Expected:
- `Cannot find module '../src/rules/mandate-ladder.js'`.
- `tokenUrlOf` is not exported.
- The `rail` assertions fail (`undefined`, and the `strictObject` refuses the key).
- The integration test fails typecheck on `rail` and `authUrlOf`.

- [ ] **Step 3: Minimal implementation**

`packages/domain/src/rules/mandate-ladder.ts`:
```ts
import { Money, Rounding } from '@sanchay/money';

/** eNACH limit rungs (spec §4.3); the `mandates_limit_ck` CHECK allows exactly these. */
export const MANDATE_LIMIT_LADDER: readonly Money[] = ['100000.00', '200000.00', '500000.00', '1000000.00', '2500000.00'].map((v) =>
  Money.parse(v),
);

/**
 * Smallest rung ≥ 1.5 × `required` (the monthly SIPs the mandate must carry), or null above the top rung.
 * The product is truncated to money scale: only DOWN keeps 66,666.67 in the ₹1,00,000 rung (ML-02).
 */
export function mandateLimitFor(required: Money): Money | null {
  const needed = required.multiply('1.5', Rounding.DOWN);
  return MANDATE_LIMIT_LADDER.find((rung) => rung.gte(needed)) ?? null;
}
```
Append to `packages/domain/src/rules/index.ts`: `export * from './mandate-ladder.js';`.

`apps/api/src/modules/plans/plans.schema.ts` (in `mandates`, after `upiUri`; add `bytea` to the `app-schema.js` import):
```ts
    /** eNACH `token_url`, encrypted (AAD mandates.auth_url_enc.<id>); null for UPI. */
    authUrlEnc: bytea('auth_url_enc'),
```

`apps/api/src/modules/plans/fp-plan.ts` (append):
```ts
/** `POST /api/pg/payments/emandate/auth` for E_MANDATE returns the bank page in `token_url`. */
export function tokenUrlOf(raw: Record<string, unknown>): string | null {
  return typeof raw.token_url === 'string' ? raw.token_url : null;
}
```

`apps/api/src/modules/plans/sip-eligibility.ts`:
- Add `import type { MandateRail } from '@sanchay/domain';`.
- Change `assertSipEligible`'s input type to `{ scheme: SipScheme; amount: Money; installmentDay: number; rail?: MandateRail }`.
- Replace its last line:
```ts
  // The UPI Autopay mandate is fixed at ₹1,00,000; an eNACH mandate is sized by the ladder instead (F3).
  if ((input.rail ?? 'UPI_AUTOPAY') === 'UPI_AUTOPAY' && amount.gt(UPI_AUTOPAY_LIMIT)) {
    throw new AppError('MANDATE_LIMIT_EXCEEDED', field('amount', 'MANDATE_LIMIT_EXCEEDED'));
  }
```

`apps/api/src/modules/plans/sip.service.ts`:
- Imports: add `type MandateRail` and `mandateLimitFor` to the `@sanchay/domain` import.
- `CreateSipInput` gains `rail: MandateRail;`.
- `createSip` passes the rail to the eligibility check: `assertSipEligible({ scheme: sip, amount, installmentDay: input.installmentDay, rail: input.rail });`.
- Inside the transaction, replace everything from `const reused = …` down to the end of the `if (newMandate) { … }` insert block with:
```ts
      const reused = await this.mandateWithHeadroom(tx, input.investorId, input.rail, amount, now);
      const newMandate = reused === null;
      const mandateId = reused ?? newId('mandates');
      let limitWire: string | null = null;
      if (newMandate) {
        limitWire = input.rail === 'UPI_AUTOPAY' ? UPI_AUTOPAY_LIMIT_WIRE : await this.enachLimit(tx, input.investorId, bank.id, amount, now);
        await tx.insert(mandates).values({
          id: mandateId,
          createdBy: input.investorId,
          updatedBy: input.investorId,
          investorId: input.investorId,
          bankAccountId: bank.id,
          rail: input.rail,
          limitAmount: limitWire,
        });
        await tx.insert(orderEvents).values({ mandateId, toStatus: 'CONSENT_PENDING', trigger: 'plans.createSip' });
      }
```
- In the consent `fields`, replace `mandateLimit: UPI_AUTOPAY_LIMIT_WIRE,` with `...(limitWire === null ? {} : { mandateLimit: limitWire }),`.
- Replace `mandateWithHeadroom` and add `livePlans`/`enachLimit`:
```ts
  /** Plans whose amount counts against a mandate: live states, plus CONSENT_PENDING drafts still approvable. */
  private livePlans(now: Date) {
    const freshSince = new Date(now.getTime() - CHALLENGE_EXPIRY_MS);
    return or(inArray(plans.status, HEADROOM_STATUSES), and(eq(plans.status, 'CONSENT_PENDING'), gt(plans.createdAt, freshSince)));
  }

  /** The investor's APPROVED mandate on `rail` with room for `amount`, oldest first; null when none. */
  private async mandateWithHeadroom(exec: DbExecutor, investorId: string, rail: MandateRail, amount: Money, now: Date): Promise<string | null> {
    const approved = await exec
      .select({ id: mandates.id, limitAmount: mandates.limitAmount })
      .from(mandates)
      .where(and(eq(mandates.investorId, investorId), eq(mandates.rail, rail), eq(mandates.status, 'APPROVED')))
      .orderBy(asc(mandates.createdAt));
    for (const mandate of approved) {
      const [used] = await exec
        .select({ total: sql<string>`COALESCE(SUM(${plans.amount}), 0)::numeric(18,2)::text` })
        .from(plans)
        .where(and(eq(plans.mandateId, mandate.id), this.livePlans(now)));
      if (!Money.parse(used?.total ?? '0.00').add(amount).gt(Money.parse(mandate.limitAmount))) return mandate.id;
    }
    return null;
  }

  /** eNACH ladder (spec §4.3): ≥ 1.5 × every live SIP on this bank's mandates plus this one. */
  private async enachLimit(exec: DbExecutor, investorId: string, bankAccountId: string, amount: Money, now: Date): Promise<string> {
    const [onBank] = await exec
      .select({ total: sql<string>`COALESCE(SUM(${plans.amount}), 0)::numeric(18,2)::text` })
      .from(plans)
      .innerJoin(mandates, eq(plans.mandateId, mandates.id))
      .where(and(eq(plans.investorId, investorId), eq(mandates.bankAccountId, bankAccountId), this.livePlans(now)));
    const limit = mandateLimitFor(Money.parse(onBank?.total ?? '0.00').add(amount));
    if (limit === null) throw new AppError('MANDATE_LIMIT_EXCEEDED', { fields: [{ path: 'amount', code: 'MANDATE_LIMIT_EXCEEDED', message: 'MANDATE_LIMIT_EXCEEDED' }] });
    return limit.toWire();
  }
```

`apps/api/src/modules/plans/mandates-submit.job.ts`:
- Imports: add `import { Crypto } from '../platform/crypto.js';`, `asRowId` from `../platform/ids.js`, and `tokenUrlOf` next to `upiUriOf`.
- Constructor: add `@Inject(Crypto) private readonly crypto: Crypto,`.
- Replace the tail of the `useConsumed` callback, from `const upiUri = …` to the end of its `if/else`:
```ts
        const auth = await this.fp.authoriseMandate({ mandateId: String(current.fpMandateId), mandateType }, consumed);
        const tokenUrl = tokenUrlOf(auth);
        const intent =
          mandateType === 'UPI'
            ? { upiUri: upiUriOf(auth) }
            : {
                authUrlEnc:
                  tokenUrl === null
                    ? null
                    : this.crypto.encrypt(tokenUrl, { table: 'mandates', column: 'auth_url_enc', rowId: asRowId('mandates', current.id) }),
              };
        if (current.status === 'CREATED') {
          await moveMandate(db, current, 'AUTH_PENDING', 'emandate_auth_created', intent);
        } else {
          await db.update(mandates).set(intent).where(eq(mandates.id, current.id)); // re-authorise: same state, new intent
        }
```

`apps/api/src/modules/plans/mandates.service.ts`:
- Add `import { Crypto } from '../platform/crypto.js';` and `import { asRowId } from '../platform/ids.js';`.
- Constructor: add `@Inject(Crypto) private readonly crypto: Crypto,`.
- Add the method:
```ts
  /** The eNACH bank page to open; only while the mandate waits for the investor. */
  authUrlOf(row: typeof mandates.$inferSelect): string | null {
    if (row.rail !== 'ENACH' || row.status !== 'AUTH_PENDING' || row.authUrlEnc === null) return null;
    return this.crypto.decrypt(row.authUrlEnc, { table: 'mandates', column: 'auth_url_enc', rowId: asRowId('mandates', row.id) });
  }
```

`apps/api/src/modules/plans/mandates.router.ts`:
- Change `toWire` to take the decrypted URL: `const toWire = (row: typeof mandates.$inferSelect, authUrl: string | null) => ({ …, authUrl, … })`, adding `authUrl` after `upiUri`.
- Call sites become `toWire(row, this.mandatesService.authUrlOf(row))`: in `list`, `.map((row) => toWire(row, this.mandatesService.authUrlOf(row)))`; in `get`, bind the row first.

`packages/contract/src/plans.ts` (`CreateSipInputSchema`, after `numberOfInstalments`):
```ts
  rail: z.enum(['UPI_AUTOPAY', 'ENACH']).default('UPI_AUTOPAY'),
```

`packages/contract/src/mandates.ts` (`MandateSchema`, after `upiUri`):
```ts
  /** The eNACH bank page to open, present only for ENACH while AUTH_PENDING. */
  authUrl: z.string().nullable(),
```

Update F2's callers:
- `sip-mandate.int.test.ts`'s `draftSip` passes `rail: 'UPI_AUTOPAY'`.
- `PlansRouter.createSip` already spreads `input`, so it passes the parsed `rail`.

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter=@sanchay/api db:generate --name=mandates_auth_url
pnpm --filter=@sanchay/domain test -- mandate-ladder
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test -- sip-eligibility fp-plan
pnpm --filter=@sanchay/contract test -- plans
pnpm --filter=@sanchay/api test:int -- mandate-enach sip-mandate
pnpm --filter=@sanchay/api openapi
git diff --exit-code apps/api/openapi.json
```
Expected:
- `mandate-ladder` 8/8.
- `sip-eligibility` 9/9 and `fp-plan` 4/4.
- Contract `plans` 4/4.
- `mandate-enach` 3/3 and `sip-mandate` still 17/17.
- `openapi.json` is clean after regeneration.

- [ ] **Step 5: Commit**

```
pnpm exec biome check --write packages/domain/src/rules packages/domain/test/mandate-ladder.test.ts apps/api/src/modules/plans apps/api/test/int/mandate-enach.int.test.ts apps/api/test/int/sip-mandate.int.test.ts packages/contract/src
pnpm --filter=@sanchay/api typecheck
pnpm --filter=@sanchay/api test:int -- mandate-enach sip-mandate
pnpm lint
git add packages/domain/src/rules packages/domain/test/mandate-ladder.test.ts apps/api/src/modules/plans apps/api/drizzle apps/api/openapi.json apps/api/test/int/mandate-enach.int.test.ts apps/api/test/int/sip-mandate.int.test.ts packages/contract/src
git commit -m "feat(api): eNACH mandate rail and limit ladder (F3, T6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

