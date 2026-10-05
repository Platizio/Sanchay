import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { loadStackConfig } from '../lib/config.js';
import { SanchayMvpStack } from '../lib/sanchay-mvp-stack.js';

/** G-E3 items that the prod template itself evidences (E25 asserts the same on dev). */
function synthProdTemplate(): Template {
  const app = new App();
  const stack = new SanchayMvpStack(app, 'SanchayMvpStack-prod', {
    env: { account: '111111111111', region: 'ap-south-1' },
    config: loadStackConfig('prod'),
  });
  return Template.fromStack(stack);
}

interface ContainerDef {
  Name: string;
  Environment?: Array<{ Name: string; Value?: unknown }>;
  Secrets?: Array<{ Name: string }>;
}

const template = synthProdTemplate();
const containers = Object.values(template.findResources('AWS::ECS::TaskDefinition')).flatMap(
  (def) => def.Properties.ContainerDefinitions as ContainerDef[],
);

/** Names that must only ever arrive as ECS `Secrets` (Secrets Manager), never as plain env. */
const SECRET_NAME =
  /(_KEY|_SECRET|_TOKEN|_PASSWORD|_PEPPER|_KEYRING_JSON|_CREDENTIALS_JSON)$|^DATABASE_URL$/;

describe('SanchayMvpStack-prod: G-E3', () => {
  it('RDS storage is encrypted and rds.force_ssl is on', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', { StorageEncrypted: true });
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({ 'rds.force_ssl': '1' }),
    });
  });

  it('HTTPS uses the TLS 1.3/1.2 policy and port 80 only redirects to HTTPS', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Protocol: 'HTTPS',
      SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-2021-06',
    });
    const listeners = Object.values(
      template.findResources('AWS::ElasticLoadBalancingV2::Listener'),
    ).map(
      (l) => l.Properties as { Protocol: string; DefaultActions: Array<Record<string, unknown>> },
    );
    const plain = listeners.filter((l) => l.Protocol === 'HTTP');
    expect(plain.length).toBeGreaterThan(0);
    for (const listener of plain) {
      for (const action of listener.DefaultActions) {
        expect(action).toMatchObject({ Type: 'redirect', RedirectConfig: { Protocol: 'HTTPS' } });
      }
    }
  });

  it('no secret-shaped variable is passed as plain container environment', () => {
    const leaked = containers.flatMap((c) =>
      (c.Environment ?? [])
        .filter((e) => SECRET_NAME.test(e.Name))
        .map((e) => `${c.Name}:${e.Name}`),
    );
    expect(leaked).toEqual([]);
  });

  it('the FP credentials reach the worker only', () => {
    const holders = containers
      .filter((c) => (c.Secrets ?? []).some((s) => s.Name === 'SANCHAY_FP_CREDENTIALS_JSON'))
      .map((c) => c.Name);
    expect(holders).toEqual(['worker']);
  });
});
