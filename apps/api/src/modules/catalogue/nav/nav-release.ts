import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../db/client.js';
import { auditEvents } from '../../platform/platform.schema.js';
import { schemeNavs } from '../catalogue.schema.js';

/** R-35: `ops:nav-release` audits NAV_RELEASE; the sync that then takes the ISIN's feed value audits NAV_RELEASE_APPLIED. */
export const NAV_RELEASE = 'NAV_RELEASE';
export const NAV_RELEASE_APPLIED = 'NAV_RELEASE_APPLIED';

export class NavReleaseError extends Error {
  override readonly name = 'NavReleaseError';
}

export interface NavRelease {
  isin: string;
  approver1: string;
  approver2: string;
}

/**
 * R-35: releases a quarantined ISIN once an operator has checked its NAV on the AMC site with a second
 * approver. The last good NAV grades by age again, and the next `nav.sync.daily` takes the ISIN's feed
 * value once without the NAV-09 move check. An ISIN that is not quarantined is refused, so a stray
 * release cannot wave a later move through.
 */
export async function releaseNav(db: Database, input: NavRelease): Promise<void> {
  if (input.approver1 === input.approver2) {
    throw new NavReleaseError(
      'ops-nav-release: --approver1 and --approver2 must be two distinct approvers',
    );
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schemeNavs)
      .set({ quarantined: false, updatedAt: new Date() })
      .where(and(eq(schemeNavs.isin, input.isin), eq(schemeNavs.quarantined, true)))
      .returning({ nav: schemeNavs.nav, navDate: schemeNavs.navDate });
    if (row === undefined) {
      throw new NavReleaseError(
        `ops-nav-release: ${input.isin} has no quarantined scheme_navs row`,
      );
    }
    await tx.insert(auditEvents).values({
      actorType: 'SYSTEM',
      actorId: input.approver1,
      action: NAV_RELEASE,
      entityType: 'scheme_navs',
      entityId: input.isin,
      data: { ...input, lastGoodNav: row.nav, lastGoodNavDate: row.navDate },
    });
  });
}

/** R-35: the ISINs whose latest release no sync has taken yet (one read on audit_events_entity_idx per sync). */
export async function pendingNavReleases(db: Database): Promise<Set<string>> {
  const latest = await db
    .selectDistinctOn([auditEvents.entityId], {
      isin: auditEvents.entityId,
      action: auditEvents.action,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityType, 'scheme_navs'),
        inArray(auditEvents.action, [NAV_RELEASE, NAV_RELEASE_APPLIED]),
      ),
    )
    .orderBy(auditEvents.entityId, desc(auditEvents.occurredAt), desc(auditEvents.id));
  const pending = new Set<string>();
  for (const r of latest) {
    if (r.action === NAV_RELEASE && r.isin !== null) pending.add(r.isin);
  }
  return pending;
}
