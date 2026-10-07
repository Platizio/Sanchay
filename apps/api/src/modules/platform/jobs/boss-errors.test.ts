import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';
import { attachBossErrorLog } from './boss-errors.js';

describe('attachBossErrorLog', () => {
  it('without a listener an emitted pg-boss error throws (the failure this guards against)', () => {
    const boss = new PgBoss({ connectionString: 'postgres://u:p@127.0.0.1:1/x' });
    expect(() => boss.emit('error', new Error('blip'))).toThrow();
  });

  it('registers an error listener that logs and does not throw, even when the sink throws', () => {
    const boss = new PgBoss({ connectionString: 'postgres://u:p@127.0.0.1:1/x' });
    const seen: string[] = [];
    attachBossErrorLog(boss, (err) => {
      seen.push(err.message);
    });
    expect(boss.listenerCount('error')).toBeGreaterThan(0);
    expect(() => boss.emit('error', new Error('blip'))).not.toThrow();
    expect(seen).toEqual(['blip']);

    const noisy = new PgBoss({ connectionString: 'postgres://u:p@127.0.0.1:1/x' });
    attachBossErrorLog(noisy, () => {
      throw new Error('sink down');
    });
    expect(() => noisy.emit('error', new Error('blip'))).not.toThrow();
  });
});
