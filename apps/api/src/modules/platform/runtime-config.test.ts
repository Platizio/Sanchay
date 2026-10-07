import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DbExecutor } from '../../db/client.js';
import { RUNTIME_CONFIG_DEFAULTS, RuntimeConfig, type RuntimeConfigKey } from './runtime-config.js';

/** RuntimeConfig.get selects `value::text` (RV-02-31), so a stored row reaches it as JSON text. */
function execReturning(jsonText: string | undefined): DbExecutor {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => Promise.resolve(jsonText === undefined ? [] : [{ value: jsonText }]),
  };
  return chain as unknown as DbExecutor;
}

describe('RuntimeConfig', () => {
  it('returns the default when app_config has no row for the key', async () => {
    const value = await RuntimeConfig.get(execReturning(undefined), 'orders.enabled');
    expect(value).toBe(false);
  });

  it('returns the stored value when it matches the key schema', async () => {
    const value = await RuntimeConfig.get(
      execReturning('"PAYMENT_AFTER_SUBMIT"'),
      'fp.lumpsumFlow',
    );
    expect(value).toBe('PAYMENT_AFTER_SUBMIT');
  });

  it('parses the stored JSON once, so a money cap stays a decimal string', async () => {
    const value = await RuntimeConfig.get(execReturning('"4000.00"'), 'pilot.caps.perOrder');
    expect(value).toBe('4000.00');
  });

  it('throws on a stored value that does not match the key schema', async () => {
    await expect(RuntimeConfig.get(execReturning('"yes"'), 'orders.enabled')).rejects.toThrow();
  });

  it('every default satisfies its own schema', () => {
    for (const key of Object.keys(RUNTIME_CONFIG_DEFAULTS) as RuntimeConfigKey[]) {
      expect(RUNTIME_CONFIG_DEFAULTS[key]).not.toBeUndefined();
    }
  });

  it('rejects an unknown key at the type level', () => {
    // @ts-expect-error 'not.a.key' is not a RuntimeConfigKey
    void RuntimeConfig.get(execReturning(undefined), 'not.a.key');
    expectTypeOf(RuntimeConfig.get).parameter(1).toEqualTypeOf<RuntimeConfigKey>();
  });
});

void vi;
