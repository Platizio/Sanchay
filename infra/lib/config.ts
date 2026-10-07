/**
 * R-31: prod is the only AWS environment (no dev stack and no dev domain; development runs locally on
 * docker compose). The name still prefixes every resource (`sanchay-prod-*`, `sanchay/prod/*`).
 */
export type SanchayEnvName = 'prod';

/**
 * Values that differ per deploy and are never committed, read from the environment of the `cdk`
 * process (`process.env` by default; deploy.yml passes them from the GitHub environment).
 */
export type DeployInputSource = Readonly<Record<string, string | undefined>>;

export interface SanchayStackConfig {
  envName: SanchayEnvName;
  /** The apex: the stack serves www, app and api under it and answers the apex with a 301 to www. */
  rootDomain: string;
  multiAz: boolean;
  deletionProtection: boolean;
  backupRetentionDays: number;
  desiredCount: number;
  /**
   * 'owner/repo' whose GitHub Actions runs may assume the deploy role: the deploy input
   * SANCHAY_GITHUB_REPOSITORY (deploy.yml passes `github.repository`, the exact case IAM compares).
   * Never a constant: the owner is the company organisation, whose name R-19's brand lint keeps out
   * of code. Without it the stack builds no deploy role (the tests); bin/sanchay.ts requires it.
   */
  githubRepo: string | undefined;
  /** Spec §2.4 sizes the RDS instance at db.t4g.medium. */
  dbInstanceSize: 'MICRO' | 'MEDIUM';
  /** D3 boot invariants 8/9: fake is refused outside local/test, production only in prod. */
  fpProviderMode: 'sandbox' | 'production';
  /** docs/research/fp-api.md §0 (worker only, R-19). */
  fpBaseUrl: string;
  /** D6 SANCHAY_SES_FROM (api, worker). */
  sesFrom: string;
  /** E21 SANCHAY_PLATFORM_ARN (every API-image container); deploy input. */
  platformArn: string;
  /** B2 invariant 7 / R-10 SANCHAY_SMS_RETRIEVER_HASH (api only, R-19); deploy input. */
  smsRetrieverHash: string;
}

type StaticConfig = Omit<SanchayStackConfig, 'githubRepo' | 'platformArn' | 'smsRetrieverHash'>;

/** R-31: E25 deploys prod from these values in S2 week 2 (closed to investors); F1 hardens it in S4. */
const PROD_CONFIG: StaticConfig = {
  envName: 'prod',
  rootDomain: 'sanchay.in',
  multiAz: true,
  deletionProtection: true,
  backupRetentionDays: 14,
  desiredCount: 2,
  dbInstanceSize: 'MEDIUM',
  fpProviderMode: 'production',
  fpBaseUrl: 'https://api.fintechprimitives.com',
  sesFrom: 'noreply@sanchay.in',
};

/** Same patterns as E21's EnvSchema.SANCHAY_PLATFORM_ARN and B2's SANCHAY_SMS_RETRIEVER_HASH. */
const PLATFORM_ARN = /^ARN-\d+$/;
const RETRIEVER_HASH = /^[A-Za-z0-9+/]{11}$/;
/** GitHub's <owner>/<repo>, as `github.repository` prints it. */
const GITHUB_REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;

export class StackConfigError extends Error {
  override name = 'StackConfigError';
}

function blankToUndefined(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Refuses to synthesise without the deploy inputs the containers need to boot, so a missing GitHub
 * environment variable fails `cdk deploy` before CloudFormation is touched instead of leaving a
 * service whose containers the boot guard refuses.
 */
export function loadStackConfig(
  envName: SanchayEnvName,
  source: DeployInputSource = process.env,
): SanchayStackConfig {
  const base = PROD_CONFIG;
  const githubRepo = blankToUndefined(source.SANCHAY_GITHUB_REPOSITORY);
  const platformArn = blankToUndefined(source.SANCHAY_PLATFORM_ARN);
  const smsRetrieverHash = blankToUndefined(source.SANCHAY_SMS_RETRIEVER_HASH);
  const problems: string[] = [];
  if (githubRepo !== undefined && !GITHUB_REPOSITORY.test(githubRepo)) {
    problems.push('SANCHAY_GITHUB_REPOSITORY must be <owner>/<repo>');
  }
  if (platformArn === undefined) {
    problems.push('SANCHAY_PLATFORM_ARN is required (E21: every API-image container)');
  } else if (!PLATFORM_ARN.test(platformArn)) {
    problems.push('SANCHAY_PLATFORM_ARN must look like ARN-<digits>');
  }
  if (smsRetrieverHash === undefined) {
    problems.push('SANCHAY_SMS_RETRIEVER_HASH is required (boot invariant 7, R-10)');
  } else if (!RETRIEVER_HASH.test(smsRetrieverHash)) {
    problems.push('SANCHAY_SMS_RETRIEVER_HASH must be 11 characters of [A-Za-z0-9+/]');
  }
  if (problems.length > 0 || platformArn === undefined || smsRetrieverHash === undefined) {
    throw new StackConfigError(`Stack config ${envName} refused:\n- ${problems.join('\n- ')}`);
  }
  return { ...base, githubRepo, platformArn, smsRetrieverHash };
}

/**
 * What a real `cdk synth|deploy` needs on top of loadStackConfig (bin/sanchay.ts calls it): the
 * repository the GitHub deploy role trusts. Tests synthesise without it and get no deploy role.
 */
export function assertDeployInputs(config: SanchayStackConfig): void {
  const problems: string[] = [];
  if (config.githubRepo === undefined) {
    problems.push('SANCHAY_GITHUB_REPOSITORY is required (the GitHub deploy role trusts it)');
  }
  if (problems.length > 0) {
    throw new StackConfigError(
      `Stack config ${config.envName} refused:\n- ${problems.join('\n- ')}`,
    );
  }
}
