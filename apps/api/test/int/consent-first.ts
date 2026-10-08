import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { consentChallenges } from '../../src/modules/legal-consent/legal-consent.schema.js';
import type { FpTestApp } from './fake-fp.js';

/**
 * The canonical consent-first assertion (outline §0.1): "FakeFp has zero P/M writes before CONSUMED".
 * FakeFp stamps its call log from the app Clock, the same clock that writes `created_at` (RV-03-4) and
 * `consumed_at`. The structural guard (FpTransport requires a ConsumedConsent for P/M) is primary; this
 * checks the flow. A file shares one FakeFp log and one FakeClock, so the window [created, consumed)
 * means something only when the test moves the clock 1 ms before the create (earlier tests' writes fall
 * before it) and 1 ms after approve (the job's writes fall after it): the approve helpers do both
 * (owner decision 2026-10-06, RV-03-51). A consumed challenge with an empty window and a P/M call on
 * its edge fails here instead of passing for nothing.
 */
export async function expectNoPmWritesBeforeConsumed(
  app: FpTestApp,
  challengeId: string,
): Promise<void> {
  const [challenge] = await app.db.db
    .select({ createdAt: consentChallenges.createdAt, consumedAt: consentChallenges.consumedAt })
    .from(consentChallenges)
    .where(eq(consentChallenges.id, challengeId));
  expect(challenge, `consent challenge ${challengeId} exists`).toBeDefined();
  const since = challenge?.createdAt.getTime() ?? 0;
  const consumedAt = challenge?.consumedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const pm = app.fakeFp.calls().filter((c) => c.class === 'P' || c.class === 'M');
  expect(
    consumedAt > since || !pm.some((c) => c.at === since),
    'move the FakeClock 1 ms before the create and 1 ms after approve, or this check proves nothing',
  ).toBe(true);
  const early = pm.filter((c) => c.at >= since && c.at < consumedAt);
  expect(early, 'FakeFp has zero P/M writes before CONSUMED').toHaveLength(0);
}
