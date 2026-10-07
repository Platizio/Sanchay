import { describe, expect, it, vi } from 'vitest';

const started: Array<{ listenersAtStart: number }> = [];

vi.mock('pg-boss', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeBoss extends EventEmitter {
    async start(): Promise<void> {
      started.push({ listenersAtStart: this.listenerCount('error') });
    }
    async stop(): Promise<void> {}
  }
  return { PgBoss: FakeBoss };
});
vi.mock('./client.js', () => ({
  createDb: () => ({ db: {}, close: async () => undefined }),
}));
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: async () => undefined }));

describe('runMigrations pg-boss bootstrap', () => {
  it('has an error listener on the bootstrap PgBoss before start()', async () => {
    const { runMigrations } = await import('./migrate.js');
    await runMigrations('postgres://u:p@127.0.0.1:1/x');
    expect(started).toEqual([{ listenersAtStart: 1 }]);
  });
});
