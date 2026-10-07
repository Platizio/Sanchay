import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import type { SanchayStackConfig } from './config.js';

export interface SanchayMvpStackProps extends StackProps {
  config: SanchayStackConfig;
}

/** Spec §2.4: the one ECS service, in every env. deploy.yml forces new deployments by this name. */
export const SERVICE_NAME = 'sanchay-app';
/** BRIEF D6: the RDS master login (secret sanchay/{env}/db-master). Never the NOLOGIN app role's name. */
export const DB_MASTER_USER = 'sanchay_master';

/** R-11: raw AWS policy id, not the CDK enum name, so this stays correct across aws-cdk-lib versions. */
const ALB_TLS_POLICY = 'ELBSecurityPolicy-TLS13-1-2-2021-06' as elbv2.SslPolicy;
const ARM64_LINUX: ecs.RuntimePlatform = {
  cpuArchitecture: ecs.CpuArchitecture.ARM64,
  operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
};
const API_PORT = 3000;
const WEB_PORT = 3001;
/**
 * R-12 liveness. Both target groups probe /api/v1/health on the api port of the same task: Next.js
 * serves no /api/v1/* route in AWS (next.config.ts rewrites are local only), so a web-port probe
 * would 404 and ECS would replace every task. A crashed web process still stops the task, because
 * every container in it is essential.
 */
const HEALTH_CHECK: elbv2.HealthCheck = {
  path: '/api/v1/health',
  port: String(API_PORT),
  protocol: elbv2.Protocol.HTTP,
  healthyHttpCodes: '200',
};

export class SanchayMvpStack extends Stack {
  constructor(scope: Construct, id: string, props: SanchayMvpStackProps) {
    super(scope, id, props);
    const { config } = props;
    const envName = config.envName;
    // R-31: the real hosts in the sanchay.in zone; there is no dev domain.
    const domain = config.rootDomain;
    const wwwOrigin = `https://www.${domain}`;
    const appOrigin = `https://app.${domain}`;
    const apiOrigin = `https://api.${domain}`;

    // --- Network -----------------------------------------------------------------------
    // PB-19: Cybrilla allowlists this address. A teardown or a replacement keeps it (to re-attach, not
    // re-allowlist); a failed first create removes it, so the retry allocates one again.
    const natEip = new ec2.CfnEIP(this, 'NatEip', { domain: 'vpc' });
    natEip.applyRemovalPolicy(RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: ec2.NatProvider.gateway({ eipAllocationIds: [natEip.attrAllocationId] }),
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // --- S3, ECR -------------------------------------------------------------------------
    // Spec §2.4: sanchay-{env}-docs with public access blocked, SSE and versioning. Its name is fixed, so,
    // as for the logs and repositories (R-34), a teardown or rename keeps it and a failed first create
    // removes it, so the retry can create the name again.
    const documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `sanchay-${envName}-docs`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    // R-34: two repositories, one per image, each keeping its own last 20. A stack teardown or rename
    // keeps them; a failed first create removes them, so the retry can create the names again.
    const apiRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: `sanchay-${envName}-api`,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    const webRepo = new ecr.Repository(this, 'WebRepo', {
      repositoryName: `sanchay-${envName}-web`,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 20 }],
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });

    // --- Secrets (R-19 owning containers) -------------------------------------------------
    // Final review MF-8: the keyring is the only key to the encrypted PII in the retained database, and the
    // other secrets are populated out-of-band, so a teardown or a rename keeps all of them (a failed first
    // create removes them, as for the repositories and log groups).
    const keptSecret = { removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE } as const;
    const keyringSecret = new secretsmanager.Secret(this, 'KeyringSecret', {
      ...keptSecret,
      secretName: `sanchay/${envName}/keyring`,
      description: 'SANCHAY_KEYRING_JSON (owning containers: api, worker). Populated out-of-band.',
    });
    const fpSecret = new secretsmanager.Secret(this, 'FpSecret', {
      ...keptSecret,
      secretName: `sanchay/${envName}/fp`,
      description:
        'SANCHAY_FP_CREDENTIALS_JSON (owning container: worker only). Populated out-of-band.',
    });
    const fpWebhookSecret = new secretsmanager.Secret(this, 'FpWebhookSecret', {
      ...keptSecret,
      secretName: `sanchay/${envName}/fp-webhook`,
      description: 'SANCHAY_FP_WEBHOOK_SECRET (owning container: api only). Populated out-of-band.',
    });
    const msg91Secret = new secretsmanager.Secret(this, 'Msg91Secret', {
      ...keptSecret,
      secretName: `sanchay/${envName}/msg91`,
      description:
        'SANCHAY_MSG91_CREDENTIALS_JSON (owning containers: api, worker). Populated out-of-band.',
    });

    // --- RDS PostgreSQL (R-15: sslmode=verify-full at the app; force_ssl=1 here) ---------
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'RDS ingress only from the ECS service (R-11 SG isolation)',
      allowAllOutbound: false,
    });
    // B6's Testcontainers image is postgres 18.6. aws-cdk-lib 2.216.0 has no VER_18_6 constant
    // (its newest PostgreSQL constant is VER_17_6), so the version is named explicitly.
    const pgEngine = rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.of('18.6', '18'),
    });
    const dbParamGroup = new rds.ParameterGroup(this, 'DbParamGroup', {
      engine: pgEngine,
      parameters: { 'rds.force_ssl': '1' },
    });
    const dbInstance = new rds.DatabaseInstance(this, 'Database', {
      engine: pgEngine,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        config.dbInstanceSize === 'MEDIUM' ? ec2.InstanceSize.MEDIUM : ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      multiAz: config.multiAz,
      allocatedStorage: 20,
      storageEncrypted: true,
      parameterGroup: dbParamGroup,
      securityGroups: [dbSecurityGroup],
      // BRIEF D6: the master is not `sanchay_app`, the NOLOGIN role 0000_bootstrap creates and
      // 0003_grants scopes; with that name the app would log in as rds_superuser.
      credentials: rds.Credentials.fromGeneratedSecret(DB_MASTER_USER, {
        secretName: `sanchay/${envName}/db-master`,
      }),
      databaseName: 'sanchay',
      deletionProtection: config.deletionProtection,
      backupRetention: Duration.days(config.backupRetentionDays),
      removalPolicy: config.deletionProtection ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    const dbMasterSecret = dbInstance.secret;
    if (dbMasterSecret === undefined) {
      throw new Error('Credentials.fromGeneratedSecret always attaches a secret');
    }
    // MF-8, as the secrets above. `dbInstance.secret` is the attachment; the Secret itself is the instance's child.
    const generatedSecret = dbInstance.node.findChild('Secret');
    if (!(generatedSecret instanceof secretsmanager.Secret)) {
      throw new Error('The RDS instance Secret child is not a secretsmanager.Secret');
    }
    generatedSecret.applyRemovalPolicy(RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

    // --- Logs, cluster, ECS Exec (R-16) ---------------------------------------------------
    // R-34: one group for every container (each gets its own streams through the awslogs prefix), 400
    // days. A stack teardown or rename keeps it (CERT-In needs 180 days); a failed first create removes
    // it, so the retry can create the name again. The ECS Exec group holds the same kind of record.
    const appLogGroup = new logs.LogGroup(this, 'AppLogGroup', {
      logGroupName: `/sanchay/${envName}/app`,
      retention: logs.RetentionDays.THIRTEEN_MONTHS, // = 400 days
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    const execLogGroup = new logs.LogGroup(this, 'ExecLogGroup', {
      logGroupName: `/sanchay/${envName}/ecs-exec`,
      retention: logs.RetentionDays.THIRTEEN_MONTHS,
      removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `sanchay-${envName}`,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      executeCommandConfiguration: {
        logging: ecs.ExecuteCommandLogging.OVERRIDE,
        // false: with true, ECS Exec refuses every session unless the log group has a KMS key, and
        // R-34 defers a customer-managed key to Phase 2 (CloudWatch Logs still encrypts at rest).
        logConfiguration: { cloudWatchLogGroup: execLogGroup, cloudWatchEncryptionEnabled: false },
      },
    });

    // --- Task definition: web + api + worker in one Fargate ARM64 task -------------------
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    documentsBucket.grantReadWrite(taskRole);
    // D6 SesEmailSender (SES v2 SendEmail): only from SANCHAY_SES_FROM. The resource is every identity
    // because, while the account is in the SES sandbox, recipients are identities that IAM checks too.
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SesSendFromSanchayDomain',
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: [`arn:aws:ses:${this.region}:${this.account}:identity/*`],
        conditions: { StringEquals: { 'ses:FromAddress': config.sesFrom } },
      }),
    );

    const taskDef = new ecs.FargateTaskDefinition(this, 'AppTaskDef', {
      cpu: 1024,
      memoryLimitMiB: 2048,
      runtimePlatform: ARM64_LINUX,
      taskRole,
    });
    const logging = ecs.LogDrivers.awsLogs({ streamPrefix: envName, logGroup: appLogGroup });

    // BRIEF D6: the migrate task logs in as the RDS master. F1 moves api and worker to the LOGIN role
    // sanchay_app_login (secret sanchay/{env}/db-app); until then they share the master login.
    const migrateDbLogin = { user: DB_MASTER_USER, secret: dbMasterSecret };
    const appDbLogin = { user: DB_MASTER_USER, secret: dbMasterSecret };
    const dbEnv = (user: string): Record<string, string> => ({
      SANCHAY_DB_HOST: dbInstance.instanceEndpoint.hostname,
      SANCHAY_DB_PORT: String(dbInstance.instanceEndpoint.port),
      SANCHAY_DB_NAME: 'sanchay',
      SANCHAY_DB_USER: user,
    });
    const dbPassword = (secret: secretsmanager.ISecret) => ({
      SANCHAY_DB_PASSWORD: ecs.Secret.fromSecretsManager(secret, 'password'),
    });

    // Every key parseEnv and assertBootInvariants demand of every API-image role (Plans 01-03),
    // plain values only. SANCHAY_API_ORIGIN (E2) and SANCHAY_PLATFORM_ARN (E21) are set before
    // those tasks make them required, so the stack keeps booting when they land.
    const bootEnv: Record<string, string> = {
      SANCHAY_APP_ENV: envName,
      SANCHAY_APP_ORIGIN: appOrigin,
      SANCHAY_API_ORIGIN: apiOrigin,
      SANCHAY_CLIENT_IP_SOURCE: 'alb',
      SANCHAY_KEY_SERVICE: 'secrets',
      SANCHAY_PROVIDER_MODE_FP: config.fpProviderMode,
      SANCHAY_PILOT_INVITE_ONLY: 'true',
      SANCHAY_PLATFORM_ARN: config.platformArn,
    };
    // api and worker send SMS and email (boot invariants 1, 11, 12); migrate sends nothing.
    const senderEnv: Record<string, string> = {
      SANCHAY_PROVIDER_MODE_SMS: 'msg91',
      SANCHAY_PROVIDER_MODE_EMAIL: 'ses',
      SANCHAY_SES_FROM: config.sesFrom,
    };

    taskDef.addContainer('web', {
      image: ecs.ContainerImage.fromEcrRepository(webRepo, 'latest'),
      logging,
      portMappings: [{ containerPort: WEB_PORT }],
      environment: {
        SANCHAY_APP_ENV: envName,
        // Next.js standalone listens on PORT (default 3000, the api's port in the shared task network).
        PORT: String(WEB_PORT),
        HOSTNAME: '0.0.0.0',
        // apps/web/src/proxy.ts routes by host (H-1): www -> /site, app -> the app.
        SANCHAY_WWW_ORIGIN: wwwOrigin,
        SANCHAY_APP_ORIGIN: appOrigin,
        SANCHAY_API_ORIGIN: apiOrigin,
      },
    });

    taskDef.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
      logging,
      portMappings: [{ containerPort: API_PORT }],
      environment: {
        ...bootEnv,
        ...senderEnv,
        ...dbEnv(appDbLogin.user),
        SANCHAY_APP_ROLE: 'api',
        HOST: '0.0.0.0',
        PORT: String(API_PORT),
        SANCHAY_SMS_RETRIEVER_HASH: config.smsRetrieverHash,
      },
      secrets: {
        ...dbPassword(appDbLogin.secret),
        SANCHAY_KEYRING_JSON: ecs.Secret.fromSecretsManager(keyringSecret),
        SANCHAY_FP_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(fpWebhookSecret),
        SANCHAY_MSG91_CREDENTIALS_JSON: ecs.Secret.fromSecretsManager(msg91Secret),
      },
    });

    taskDef.addContainer('worker', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
      logging,
      environment: {
        ...bootEnv,
        ...senderEnv,
        ...dbEnv(appDbLogin.user),
        SANCHAY_APP_ROLE: 'worker',
        SANCHAY_FP_BASE_URL: config.fpBaseUrl,
      },
      secrets: {
        ...dbPassword(appDbLogin.secret),
        SANCHAY_KEYRING_JSON: ecs.Secret.fromSecretsManager(keyringSecret),
        SANCHAY_FP_CREDENTIALS_JSON: ecs.Secret.fromSecretsManager(fpSecret),
        SANCHAY_MSG91_CREDENTIALS_JSON: ecs.Secret.fromSecretsManager(msg91Secret),
      },
    });

    // --- One-off migrate task (run by hand: aws ecs run-task --overrides, R-16) ----------
    const migrateTaskDef = new ecs.FargateTaskDefinition(this, 'MigrateTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: ARM64_LINUX,
      taskRole,
    });
    migrateTaskDef.addContainer('migrate', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
      logging,
      environment: { ...bootEnv, ...dbEnv(migrateDbLogin.user), SANCHAY_APP_ROLE: 'migrate' },
      secrets: {
        ...dbPassword(migrateDbLogin.secret),
        SANCHAY_KEYRING_JSON: ecs.Secret.fromSecretsManager(keyringSecret),
      },
      command: ['node', 'dist/cli/migrate.js'],
    });

    // --- Service, ALB, listener rules (R-11) ----------------------------------------------
    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
      description: 'ECS service: web, api, worker',
    });
    dbSecurityGroup.addIngressRule(
      serviceSecurityGroup,
      ec2.Port.tcp(5432),
      'ECS service only (R-11 SG isolation)',
    );

    // First deploy (ADR-0014): this stack creates the ECR repositories empty and the secrets with
    // placeholder values, so `-c noTasks=true` creates the service with no tasks; F1 uses the same
    // flag to move the stack onto its D6 logins. Every other deploy runs config.desiredCount. R-31's
    // pause (closed to investors until GO-1) is D7's invite gate and RuntimeConfig, not this flag.
    const noTasksFlag: unknown = this.node.tryGetContext('noTasks');
    const noTasks = noTasksFlag === true || noTasksFlag === 'true';
    const service = new ecs.FargateService(this, 'Service', {
      serviceName: SERVICE_NAME,
      cluster,
      taskDefinition: taskDef,
      desiredCount: noTasks ? 0 : config.desiredCount,
      // Start new tasks before stopping old ones, so a rollout never drops below the running count.
      minHealthyPercent: 100,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      enableExecuteCommand: true,
      circuitBreaker: { rollback: true },
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    alb.setAttribute('routing.http.xff_header_processing.mode', 'append');
    const [albSecurityGroup] = alb.connections.securityGroups;
    if (albSecurityGroup === undefined) {
      throw new Error('an ApplicationLoadBalancer always has a security group');
    }
    serviceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(API_PORT));
    serviceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(WEB_PORT));

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: config.rootDomain });
    const cert = new acm.Certificate(this, 'Cert', {
      domainName: `*.${domain}`,
      subjectAlternativeNames: [domain],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    alb.addListener('HttpRedirect', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({ protocol: 'HTTPS', port: '443' }),
    });
    // R-31: no ingress allow-list. Until GO-1 the boot guard's invariant 10 keeps sign-in
    // invite-only (D7) and RuntimeConfig keeps orders.enabled and plans.sip.enabled false (D1).
    const httpsListener = alb.addListener('HttpsListener', {
      port: 443,
      certificates: [cert],
      sslPolicy: ALB_TLS_POLICY,
      open: true,
    });

    const apiTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      vpc,
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: HEALTH_CHECK,
    });
    const webTargetGroup = new elbv2.ApplicationTargetGroup(this, 'WebTargetGroup', {
      vpc,
      port: WEB_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: HEALTH_CHECK,
    });
    apiTargetGroup.addTarget(
      service.loadBalancerTarget({ containerName: 'api', containerPort: API_PORT }),
    );
    webTargetGroup.addTarget(
      service.loadBalancerTarget({ containerName: 'web', containerPort: WEB_PORT }),
    );

    httpsListener.addAction('DefaultToWeb', {
      action: elbv2.ListenerAction.forward([webTargetGroup]),
    });
    new elbv2.ApplicationListenerRule(this, 'ApiHostAllPaths', {
      listener: httpsListener,
      priority: 10,
      conditions: [elbv2.ListenerCondition.hostHeaders([`api.${domain}`])],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    new elbv2.ApplicationListenerRule(this, 'AppHostApiPath', {
      listener: httpsListener,
      priority: 20,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([`app.${domain}`]),
        elbv2.ListenerCondition.pathPatterns(['/api/v1/*']),
      ],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    // Spec §2.4 and H-1: the apex sanchay.in answers 301 to www.sanchay.in, keeping the path and
    // query. Port 80 sends it to HTTPS first, like every host; the certificate covers it.
    new elbv2.ApplicationListenerRule(this, 'ApexToWww', {
      listener: httpsListener,
      priority: 5,
      conditions: [elbv2.ListenerCondition.hostHeaders([domain])],
      action: elbv2.ListenerAction.redirect({ host: `www.${domain}`, permanent: true }),
    });

    // --- Route 53: www, app, api and the apex in the sanchay.in hosted zone (R-31) ------------
    const albTarget = route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb));
    for (const sub of ['www', 'app', 'api']) {
      new route53.ARecord(this, `${sub.charAt(0).toUpperCase()}${sub.slice(1)}Record`, {
        zone,
        recordName: sub,
        target: albTarget,
      });
    }
    // The zone apex: the ALB answers it with ApexToWww's 301.
    new route53.ARecord(this, 'ApexRecord', { zone, target: albTarget });

    // R-12's NAV-age alarm is not built here: no task before F1 publishes a NAV metric, and an alarm
    // without data is either always in ALARM or never fires. F1 (Plan 04) adds the metric source
    // (the worker's ops.gauges.emit job and its log metric filters) and the alarm.

    // --- GitHub OIDC deploy role -----------------------------------------------------------
    // Trusts only jobs of the GitHub `prod` environment (both founders are its required reviewers)
    // in the repository named by the deploy input SANCHAY_GITHUB_REPOSITORY (bin/sanchay.ts refuses
    // a deploy without it); a template synthesised without it (the tests) has no deploy role. The
    // OIDC provider is one per account, and this is the account's only stack (R-31).
    const githubRepo = config.githubRepo;
    if (githubRepo !== undefined) {
      const oidcProvider = new iam.OpenIdConnectProvider(this, 'GithubOidc', {
        url: 'https://token.actions.githubusercontent.com',
        clientIds: ['sts.amazonaws.com'],
      });
      const deployRole = new iam.Role(this, 'GithubDeployRole', {
        roleName: `sanchay-${envName}-github-deploy`,
        assumedBy: new iam.WebIdentityPrincipal(oidcProvider.openIdConnectProviderArn, {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `repo:${githubRepo}:environment:${envName}`,
          },
        }),
        description: 'Assumed by .github/workflows/deploy.yml via OIDC (no long-lived AWS keys).',
      });
      // Least privilege: exactly what deploy.yml does. CloudFormation work goes through the CDK
      // bootstrap roles.
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'AssumeCdkBootstrapRoles',
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:aws:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`,
          ],
        }),
      );
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'EcrLogin',
          actions: ['ecr:GetAuthorizationToken'],
          resources: ['*'],
        }),
      );
      apiRepo.grantPullPush(deployRole);
      webRepo.grantPullPush(deployRole);
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'ReadStackOutputs',
          actions: ['cloudformation:DescribeStacks'],
          resources: [this.stackId],
        }),
      );
      // deploy.yml runs the migrate task before every rollout (spec §2.4), then reads its exit code.
      migrateTaskDef.grantRun(deployRole);
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'WaitForMigrateTask',
          actions: ['ecs:DescribeTasks'],
          resources: [`arn:aws:ecs:${this.region}:${this.account}:task/${cluster.clusterName}/*`],
        }),
      );
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          sid: 'ForceNewDeployment',
          actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
          resources: [service.serviceArn],
        }),
      );
      new CfnOutput(this, 'GithubDeployRoleArn', { value: deployRole.roleArn });
    }

    // --- Outputs -----------------------------------------------------------------------
    new CfnOutput(this, 'NatEipAddress', {
      value: natEip.ref,
      description: 'Register this IP with Cybrilla for the production IP allowlist (G-B7)',
    });
    new CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'MigrateTaskDefinitionArn', { value: migrateTaskDef.taskDefinitionArn });
    new CfnOutput(this, 'ApiRepoUri', { value: apiRepo.repositoryUri });
    new CfnOutput(this, 'WebRepoUri', { value: webRepo.repositoryUri });
    // The network configuration of every one-off run-task (migrate here; F7's ops CLIs later).
    new CfnOutput(this, 'AppSubnetIds', {
      value: vpc
        .selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS })
        .subnetIds.join(','),
    });
    new CfnOutput(this, 'ServiceSecurityGroupId', { value: serviceSecurityGroup.securityGroupId });
  }
}
