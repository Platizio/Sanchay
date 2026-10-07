import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  assertDeployInputs,
  loadStackConfig,
  type SanchayStackConfig,
  StackConfigError,
} from '../lib/config.js';
import { SanchayMvpStack } from '../lib/sanchay-mvp-stack.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

/** Fake deploy inputs: E21's test ARN and B2's test retriever hash. */
const DEPLOY_INPUTS = {
  SANCHAY_PLATFORM_ARN: 'ARN-000000',
  SANCHAY_SMS_RETRIEVER_HASH: 'FA+9qCX9VSu',
};
/** What a real deploy also passes: the repository the deploy role trusts (a fake owner). */
const WITH_REPO = { ...DEPLOY_INPUTS, SANCHAY_GITHUB_REPOSITORY: 'example-org/sanchay' };

function synth(config: SanchayStackConfig, context: Record<string, string> = {}): Template {
  const app = new App({ context });
  const stack = new SanchayMvpStack(app, `SanchayMvpStack-${config.envName}`, {
    env: { account: '111111111111', region: 'ap-south-1' },
    config,
  });
  return Template.fromStack(stack);
}

function synthProdTemplate(context: Record<string, string> = {}): Template {
  return synth(loadStackConfig('prod', DEPLOY_INPUTS), context);
}

interface ContainerDef {
  Name: string;
  Environment?: Array<{ Name: string; Value: unknown }>;
  Secrets?: Array<{ Name: string }>;
}

/** Every container definition in the template, by name (web, api, worker, migrate). */
function containersOf(template: Template): Map<string, ContainerDef> {
  const out = new Map<string, ContainerDef>();
  for (const def of Object.values(template.findResources('AWS::ECS::TaskDefinition'))) {
    for (const c of def.Properties.ContainerDefinitions as ContainerDef[]) out.set(c.Name, c);
  }
  return out;
}

function envOf(c: ContainerDef | undefined): Record<string, unknown> {
  return Object.fromEntries((c?.Environment ?? []).map((e) => [e.Name, e.Value]));
}

function secretNamesOf(c: ContainerDef | undefined): string[] {
  return (c?.Secrets ?? []).map((s) => s.Name).sort();
}

function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(StackConfigError);
    return (error as Error).message;
  }
  throw new Error('expected a StackConfigError');
}

describe('SanchayMvpStack-prod (E25, R-31)', () => {
  it('FP secret only in worker container', () => {
    const containers = containersOf(synthProdTemplate());
    const worker = containers.get('worker');
    const api = containers.get('api');
    const web = containers.get('web');
    expect(secretNamesOf(worker)).toContain('SANCHAY_FP_CREDENTIALS_JSON');
    expect(secretNamesOf(api)).not.toContain('SANCHAY_FP_CREDENTIALS_JSON');
    expect(secretNamesOf(web)).not.toContain('SANCHAY_FP_CREDENTIALS_JSON');
    // R-19: SANCHAY_KEYRING_JSON goes into api and worker only (migrate: the boot guard's keyring check).
    expect(secretNamesOf(worker)).toContain('SANCHAY_KEYRING_JSON');
    expect(secretNamesOf(api)).toContain('SANCHAY_KEYRING_JSON');
    expect(secretNamesOf(web)).not.toContain('SANCHAY_KEYRING_JSON');
  });

  it('RDS StorageEncrypted and force_ssl', () => {
    const template = synthProdTemplate();
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      StorageEncrypted: true,
      Engine: 'postgres',
      EngineVersion: '18.6',
    });
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({ 'rds.force_ssl': '1' }),
    });
  });

  it('ALB TLS policy', () => {
    synthProdTemplate().hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Protocol: 'HTTPS',
      SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
    });
  });

  it('listener rules: api host (any path) and app host + /api/v1/* → api target group (R-11)', () => {
    const template = synthProdTemplate();
    const toApi = [
      Match.objectLike({
        Type: 'forward',
        TargetGroupArn: { Ref: Match.stringLikeRegexp('^ApiTargetGroup') },
      }),
    ];
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: [
        Match.objectLike({
          Field: 'host-header',
          HostHeaderConfig: { Values: ['api.sanchay.in'] },
        }),
      ],
      Actions: toApi,
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: Match.arrayWith([
        Match.objectLike({
          Field: 'host-header',
          HostHeaderConfig: { Values: ['app.sanchay.in'] },
        }),
        Match.objectLike({
          Field: 'path-pattern',
          PathPatternConfig: { Values: ['/api/v1/*'] },
        }),
      ]),
      Actions: toApi,
    });
  });

  it('the apex sanchay.in answers 301 to www (spec §2.4, H-1)', () => {
    const template = synthProdTemplate();
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: [
        Match.objectLike({
          Field: 'host-header',
          HostHeaderConfig: { Values: ['sanchay.in'] },
        }),
      ],
      Actions: [
        Match.objectLike({
          Type: 'redirect',
          RedirectConfig: Match.objectLike({ Host: 'www.sanchay.in', StatusCode: 'HTTP_301' }),
        }),
      ],
    });
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'sanchay.in.',
      Type: 'A',
    });
  });

  it('health check path /api/v1/health on the api port, for both target groups (R-12)', () => {
    const groups = Object.values(
      synthProdTemplate().findResources('AWS::ElasticLoadBalancingV2::TargetGroup'),
    );
    expect(groups.map((g) => g.Properties.Port).sort()).toEqual([3000, 3001]);
    for (const group of groups) {
      expect(group.Properties.HealthCheckPath).toBe('/api/v1/health');
      expect(group.Properties.HealthCheckPort).toBe('3000');
    }
  });

  it('SG: RDS reachable only from service', () => {
    const ingress = synthProdTemplate().findResources('AWS::EC2::SecurityGroupIngress', {
      Properties: { FromPort: 5432, ToPort: 5432 },
    });
    const rules = Object.values(ingress);
    expect(rules).toHaveLength(1);
    const [rule] = rules;
    expect(JSON.stringify(rule?.Properties)).not.toContain('0.0.0.0/0');
    expect(rule?.Properties.SourceSecurityGroupId).toBeDefined();
  });

  it('log groups: 400 days, kept on a teardown or rename, removed after a failed first create (R-34)', () => {
    const template = synthProdTemplate();
    template.resourceCountIs('AWS::Logs::LogGroup', 2);
    for (const name of ['/sanchay/prod/app', '/sanchay/prod/ecs-exec']) {
      template.hasResource('AWS::Logs::LogGroup', {
        Properties: Match.objectLike({ LogGroupName: name, RetentionInDays: 400 }),
        DeletionPolicy: 'RetainExceptOnCreate',
        UpdateReplacePolicy: 'Retain',
      });
    }
  });

  it('image repositories sanchay-prod-api and sanchay-prod-web keep 20 images each and survive a teardown (R-34)', () => {
    const template = synthProdTemplate();
    template.resourceCountIs('AWS::ECR::Repository', 2);
    for (const name of ['sanchay-prod-api', 'sanchay-prod-web']) {
      template.hasResource('AWS::ECR::Repository', {
        Properties: Match.objectLike({
          RepositoryName: name,
          LifecyclePolicy: { LifecyclePolicyText: Match.stringLikeRegexp('"countNumber":20') },
        }),
        DeletionPolicy: 'RetainExceptOnCreate',
        UpdateReplacePolicy: 'Retain',
      });
    }
  });

  it('S3 document bucket sanchay-prod-docs: SSE, public access blocked, versioned, survives a teardown (spec §2.4)', () => {
    const template = synthProdTemplate();
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResource('AWS::S3::Bucket', {
      Properties: Match.objectLike({
        BucketName: 'sanchay-prod-docs',
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        VersioningConfiguration: { Status: 'Enabled' },
      }),
      // A fixed name: a teardown or rename keeps it, a failed first create removes it so the retry works.
      DeletionPolicy: 'RetainExceptOnCreate',
      UpdateReplacePolicy: 'Retain',
    });
  });

  it('the NAT EIP that Cybrilla allowlists survives a teardown or replacement (PB-19)', () => {
    const template = synthProdTemplate();
    template.resourceCountIs('AWS::EC2::EIP', 1);
    const eips = template.findResources('AWS::EC2::EIP', {
      Properties: { Domain: 'vpc' },
      DeletionPolicy: 'RetainExceptOnCreate',
      UpdateReplacePolicy: 'Retain',
    });
    const [eipId] = Object.keys(eips);
    expect(eipId).toBeDefined();
    template.resourceCountIs('AWS::EC2::NatGateway', 1);
    template.hasResourceProperties('AWS::EC2::NatGateway', {
      AllocationId: { 'Fn::GetAtt': [eipId, 'AllocationId'] },
    });
  });

  it('ECS Exec logging configured on cluster sanchay-prod', () => {
    synthProdTemplate().hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'sanchay-prod',
      Configuration: {
        ExecuteCommandConfiguration: Match.objectLike({
          Logging: 'OVERRIDE',
          // No KMS key on the exec log group (R-34 defers one), so session encryption stays off.
          LogConfiguration: Match.objectLike({ CloudWatchEncryptionEnabled: false }),
        }),
      },
    });
  });

  it('DATABASE_URL in prod carries sslmode=verify-full and the CA file exists in the image', () => {
    const entrypoint = readFileSync(path.join(repoRoot, 'apps/api/docker-entrypoint.sh'), 'utf8');
    expect(entrypoint).toContain('sslmode=verify-full');
    const dockerfile = readFileSync(path.join(repoRoot, 'apps/api/Dockerfile'), 'utf8');
    expect(dockerfile).toContain('rds-global-bundle.pem');
    expect(dockerfile).toContain('NODE_EXTRA_CA_CERTS');
    expect(existsSync(path.join(repoRoot, 'infra/certs/rds-global-bundle.pem'))).toBe(true);
  });

  it('the web runtime stage carries the platform ARN and its validity date, which the (app) and (auth) layouts read per request (final review MF-7)', () => {
    const dockerfile = readFileSync(path.join(repoRoot, 'apps/web/Dockerfile'), 'utf8');
    const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
    expect(runtime).toContain('ENV SANCHAY_PLATFORM_ARN=');
    expect(runtime).toContain('ENV SANCHAY_PLATFORM_ARN_VALID_TILL=');
  });

  it('the api image carries data/ and keeps JSON import attributes (Plan 03 E9 loads its questionnaire at boot)', () => {
    const dockerfile = readFileSync(path.join(repoRoot, 'apps/api/Dockerfile'), 'utf8');
    expect(dockerfile).toContain('COPY data /repo/data');
    const swcrc = JSON.parse(readFileSync(path.join(repoRoot, 'apps/api/.swcrc'), 'utf8')) as {
      jsc?: { experimental?: { keepImportAttributes?: unknown } };
    };
    expect(swcrc.jsc?.experimental?.keepImportAttributes).toBe(true);
  });

  it('RDS master is sanchay_master in sanchay/prod/db-master, and migrate logs in as it (D6)', () => {
    const template = synthProdTemplate();
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'sanchay/prod/db-master',
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: '{"username":"sanchay_master"}',
      }),
    });
    // Parse each generated secret's SecretStringTemplate: JSON.stringify(template) escapes the quotes
    // inside it, so a substring search for '"username":"sanchay_app"' could never fail.
    const usernames = Object.values(template.findResources('AWS::SecretsManager::Secret')).flatMap(
      (secret) => {
        const raw: unknown = secret.Properties.GenerateSecretString?.SecretStringTemplate;
        return typeof raw === 'string'
          ? [(JSON.parse(raw) as { username?: unknown }).username]
          : [];
      },
    );
    expect(usernames).toContain('sanchay_master');
    expect(usernames).not.toContain('sanchay_app');
    expect(envOf(containersOf(template).get('migrate')).SANCHAY_DB_USER).toBe('sanchay_master');
  });

  it('api, worker and migrate carry every key parseEnv and the boot guard need (R-19 owners)', () => {
    const containers = containersOf(synthProdTemplate());
    const api = containers.get('api');
    const worker = containers.get('worker');
    const migrate = containers.get('migrate');
    for (const [container, role] of [
      [api, 'api'],
      [worker, 'worker'],
      [migrate, 'migrate'],
    ] as const) {
      expect(envOf(container)).toMatchObject({
        SANCHAY_APP_ENV: 'prod',
        SANCHAY_APP_ROLE: role,
        SANCHAY_APP_ORIGIN: 'https://app.sanchay.in',
        SANCHAY_API_ORIGIN: 'https://api.sanchay.in',
        SANCHAY_CLIENT_IP_SOURCE: 'alb',
        SANCHAY_KEY_SERVICE: 'secrets',
        SANCHAY_PROVIDER_MODE_FP: 'production',
        SANCHAY_PILOT_INVITE_ONLY: 'true',
        SANCHAY_PLATFORM_ARN: 'ARN-000000',
      });
    }
    for (const container of [api, worker]) {
      expect(envOf(container)).toMatchObject({
        SANCHAY_PROVIDER_MODE_SMS: 'msg91',
        SANCHAY_PROVIDER_MODE_EMAIL: 'ses',
        SANCHAY_SES_FROM: 'noreply@sanchay.in',
      });
    }
    expect(envOf(migrate)).not.toHaveProperty('SANCHAY_PROVIDER_MODE_SMS');
    expect(envOf(api).SANCHAY_SMS_RETRIEVER_HASH).toBe('FA+9qCX9VSu');
    expect(envOf(worker)).not.toHaveProperty('SANCHAY_SMS_RETRIEVER_HASH');
    expect(envOf(worker).SANCHAY_FP_BASE_URL).toBe('https://api.fintechprimitives.com');
    expect(envOf(api)).not.toHaveProperty('SANCHAY_FP_BASE_URL');
    expect(secretNamesOf(api)).toEqual([
      'SANCHAY_DB_PASSWORD',
      'SANCHAY_FP_WEBHOOK_SECRET',
      'SANCHAY_KEYRING_JSON',
      'SANCHAY_MSG91_CREDENTIALS_JSON',
    ]);
    expect(secretNamesOf(worker)).toEqual([
      'SANCHAY_DB_PASSWORD',
      'SANCHAY_FP_CREDENTIALS_JSON',
      'SANCHAY_KEYRING_JSON',
      'SANCHAY_MSG91_CREDENTIALS_JSON',
    ]);
    expect(secretNamesOf(migrate)).toEqual(['SANCHAY_DB_PASSWORD', 'SANCHAY_KEYRING_JSON']);
  });

  it('web listens on 3001 and knows the www and app hosts (apps/web/src/proxy.ts)', () => {
    const web = containersOf(synthProdTemplate()).get('web');
    expect(envOf(web)).toMatchObject({
      SANCHAY_APP_ENV: 'prod',
      PORT: '3001',
      HOSTNAME: '0.0.0.0',
      SANCHAY_WWW_ORIGIN: 'https://www.sanchay.in',
      SANCHAY_APP_ORIGIN: 'https://app.sanchay.in',
      SANCHAY_API_ORIGIN: 'https://api.sanchay.in',
    });
    expect(secretNamesOf(web)).toEqual([]);
  });

  it('one service sanchay-app: 2 tasks, never below 100 % healthy, rollback circuit breaker; -c noTasks=true creates it with no tasks', () => {
    synthProdTemplate().hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'sanchay-app',
      DesiredCount: 2,
      DeploymentConfiguration: Match.objectLike({
        MinimumHealthyPercent: 100,
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      }),
    });
    synthProdTemplate({ noTasks: 'true' }).hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'sanchay-app',
      DesiredCount: 0,
    });
  });

  it('the tasks may send SES email only from SANCHAY_SES_FROM (D6)', () => {
    synthProdTemplate().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'SesSendFromSanchayDomain',
            Action: ['ses:SendEmail', 'ses:SendRawEmail'],
            Condition: { StringEquals: { 'ses:FromAddress': 'noreply@sanchay.in' } },
          }),
        ]),
      },
    });
  });

  it('prod database: Multi-AZ, 14-day backups, deletion protection, db.t4g.medium (spec §2.4)', () => {
    synthProdTemplate().hasResourceProperties('AWS::RDS::DBInstance', {
      MultiAZ: true,
      BackupRetentionPeriod: 14,
      DeletionProtection: true,
      DBInstanceClass: 'db.t4g.medium',
    });
  });

  it('closed to investors until GO-1 (R-31): invite-only, no orders or SIP override, no ingress allow-list', () => {
    const template = synthProdTemplate();
    for (const c of containersOf(template).values()) {
      const env = envOf(c);
      // D1's RuntimeConfig defaults orders.enabled and plans.sip.enabled to false; nothing here may set them.
      expect(Object.keys(env).join(' ')).not.toMatch(/ORDERS|SIP/);
      if (env.SANCHAY_APP_ROLE !== undefined) expect(env.SANCHAY_PILOT_INVITE_ONLY).toBe('true');
    }
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({ CidrIp: '0.0.0.0/0', FromPort: 443, ToPort: 443 }),
      ]),
    });
  });

  it('the GitHub deploy role trusts only the prod environment of SANCHAY_GITHUB_REPOSITORY, is no administrator, and exists only with it', () => {
    const deployRole = { Properties: { RoleName: 'sanchay-prod-github-deploy' } };
    expect(Object.keys(synthProdTemplate().findResources('AWS::IAM::Role', deployRole))).toEqual(
      [],
    );
    const template = synth(loadStackConfig('prod', WITH_REPO));
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'sanchay-prod-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:example-org/sanchay:environment:prod',
              },
            },
          }),
        ],
      },
    });
    expect(JSON.stringify(template.toJSON())).not.toContain('AdministratorAccess');
    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);
    template.hasOutput('GithubDeployRoleArn', {});
  });

  it('the deploy role can do exactly what deploy.yml does, the migrate run included', () => {
    const template = synth(loadStackConfig('prod', WITH_REPO));
    const statements = Object.values(template.findResources('AWS::IAM::Policy'))
      .filter((p) => JSON.stringify(p.Properties.Roles).includes('GithubDeployRole'))
      .flatMap((p) => p.Properties.PolicyDocument.Statement as Array<Record<string, unknown>>);
    const sids = statements.map((s) => s.Sid).filter((s) => s !== undefined);
    expect(sids).toEqual(
      expect.arrayContaining([
        'AssumeCdkBootstrapRoles',
        'EcrLogin',
        'ReadStackOutputs',
        'WaitForMigrateTask',
        'ForceNewDeployment',
      ]),
    );
    const runTask = statements.find((s) => s.Action === 'ecs:RunTask');
    expect(JSON.stringify(runTask?.Resource)).toContain('MigrateTaskDef');
    expect(statements.some((s) => s.Action === 'iam:PassRole')).toBe(true);
  });
});

describe('loadStackConfig (E25)', () => {
  it('refuses to synthesise without the two deploy inputs, naming each', () => {
    const message = refusal(() => loadStackConfig('prod', {}));
    expect(message).toContain('SANCHAY_PLATFORM_ARN is required');
    expect(message).toContain('SANCHAY_SMS_RETRIEVER_HASH is required');
  });

  it('refuses a malformed platform ARN or retriever hash', () => {
    expect(
      refusal(() => loadStackConfig('prod', { ...DEPLOY_INPUTS, SANCHAY_PLATFORM_ARN: '12345' })),
    ).toContain('ARN-<digits>');
    expect(
      refusal(() =>
        loadStackConfig('prod', { ...DEPLOY_INPUTS, SANCHAY_SMS_RETRIEVER_HASH: 'short' }),
      ),
    ).toContain('11 characters');
  });

  it('reads SANCHAY_GITHUB_REPOSITORY, refuses a malformed one, and a real deploy needs it', () => {
    expect(loadStackConfig('prod', DEPLOY_INPUTS).githubRepo).toBeUndefined();
    expect(loadStackConfig('prod', WITH_REPO).githubRepo).toBe('example-org/sanchay');
    // The repository lands in the role's trust policy: a wildcard would trust other repositories.
    for (const repo of ['no-slash', 'example-org/*', '*/sanchay', 'example-org/sanchay:ref']) {
      expect(
        refusal(() =>
          loadStackConfig('prod', { ...DEPLOY_INPUTS, SANCHAY_GITHUB_REPOSITORY: repo }),
        ),
      ).toContain('<owner>/<repo>');
    }
    // bin/sanchay.ts: a synth or deploy without the repository is refused before CloudFormation.
    expect(refusal(() => assertDeployInputs(loadStackConfig('prod', DEPLOY_INPUTS)))).toContain(
      'SANCHAY_GITHUB_REPOSITORY is required',
    );
    expect(() => assertDeployInputs(loadStackConfig('prod', WITH_REPO))).not.toThrow();
  });
});
