import { App } from 'aws-cdk-lib';
import { assertDeployInputs, loadStackConfig } from '../lib/config.js';
import { SanchayMvpStack } from '../lib/sanchay-mvp-stack.js';

const app = new App();
// R-31: prod is the only stack. Reads SANCHAY_PLATFORM_ARN, SANCHAY_SMS_RETRIEVER_HASH and
// SANCHAY_GITHUB_REPOSITORY from this process's environment; a real synth or deploy also needs the
// repository the deploy role trusts.
const config = loadStackConfig('prod');
assertDeployInputs(config);

new SanchayMvpStack(app, 'SanchayMvpStack-prod', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // Spec §2.4: ap-south-1 only. The cdk CLI overwrites CDK_DEFAULT_REGION with the caller's AWS
    // default region (us-east-1 when none is configured), so the region is pinned, not read.
    region: 'ap-south-1',
  },
  config,
});
