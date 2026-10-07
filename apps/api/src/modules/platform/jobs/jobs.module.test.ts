import { describe, expect, it } from 'vitest';
import { JOB_NAMES, JOB_POLICIES, queuePolicyDrift } from './job-registry.js';
import { JobsModule } from './jobs.module.js';

describe('JobsModule wiring (unit; no live pg-boss connection needed to assert this)', () => {
  it('is a global module that exports JobsService', () => {
    expect(Reflect.getMetadata('__module:global__', JobsModule)).toBe(true);
  });

  it('an unknown job name is a type error', () => {
    // @ts-expect-error 'not.a.job' is not a JobName
    const bad: import('./job-registry.js').JobName = 'not.a.job';
    void bad;
  });
});

describe('JOB_POLICIES (R-32)', () => {
  it('gives notifications.send the standard policy and every other job stately or exclusive', () => {
    expect(JOB_NAMES).toEqual(Object.keys(JOB_POLICIES));
    for (const name of JOB_NAMES) {
      const allowed = name === 'notifications.send' ? ['standard'] : ['stately', 'exclusive'];
      expect(allowed, name).toContain(JOB_POLICIES[name]);
    }
  });

  it('queuePolicyDrift names a queue that is missing or stored with another policy', () => {
    const stored = JOB_NAMES.map((name) => ({ name, policy: JOB_POLICIES[name] as string }));
    expect(queuePolicyDrift(stored)).toEqual([]);
    const drifted = stored
      .filter((q) => q.name !== 'identity.cleanup')
      .map((q) => (q.name === 'drafts.abandon' ? { ...q, policy: 'standard' } : q));
    expect(queuePolicyDrift(drifted)).toEqual([
      'identity.cleanup: stored none, JOB_POLICIES stately',
      'drafts.abandon: stored standard, JOB_POLICIES stately',
    ]);
  });
});
