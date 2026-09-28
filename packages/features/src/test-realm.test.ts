import { describe, expect, it } from 'vitest';

interface NodeUtilModule {
  transferableAbortController(): AbortController;
}

const nodeUtil = (
  globalThis as unknown as { process: { getBuiltinModule(id: 'node:util'): NodeUtilModule } }
).process.getBuiltinModule('node:util');

describe('jsdom test realm', () => {
  it("gives TanStack Query Node's AbortController so Node's Request accepts its signal", () => {
    const reference = nodeUtil.transferableAbortController();
    expect(globalThis.AbortController).toBe(reference.constructor);
    expect(globalThis.AbortSignal).toBe(reference.signal.constructor);
    const controller = new AbortController();
    const request = new Request('http://app.test/api/v1/auth/session', {
      signal: controller.signal,
    });
    controller.abort();
    expect(request.signal.aborted).toBe(true);
  });
});
