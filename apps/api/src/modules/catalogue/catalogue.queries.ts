import type { ListSchemesInput } from '@sanchay/contract';
import { LAUNCH_SCHEME_OPTIONS } from '@sanchay/domain';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { schemes, sebiCategories } from './catalogue.schema.js';

const PAGE_SIZE = 20;

export async function listCategories(db: Database) {
  return db
    .select({
      code: sebiCategories.code,
      assetClass: sebiCategories.assetClass,
      name: sebiCategories.name,
      slug: sebiCategories.slug,
      cutoffClass: sebiCategories.cutoffClass,
      volatilityClass: sebiCategories.volatilityClass,
    })
    .from(sebiCategories)
    .orderBy(asc(sebiCategories.name));
}

export async function listSchemes(db: Database, input: ListSchemesInput) {
  const conditions = [
    eq(schemes.status, 'PUBLISHED'),
    eq(schemes.curated, true),
    eq(schemes.planType, 'REGULAR'),
    inArray(schemes.option, LAUNCH_SCHEME_OPTIONS),
  ];
  if (input.category) conditions.push(eq(schemes.categoryCode, input.category));
  if (input.cursor) conditions.push(gt(schemes.id, input.cursor));
  if (input.q) conditions.push(sql`${schemes.name} % ${input.q}`);

  const rows = await db
    .select({
      isin: schemes.isin,
      id: schemes.id,
      name: schemes.name,
      slug: schemes.slug,
      categoryCode: schemes.categoryCode,
      status: schemes.status,
      curated: schemes.curated,
    })
    .from(schemes)
    .where(and(...conditions))
    .orderBy(asc(schemes.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page.at(-1);
  return {
    items: page.map(({ id, ...rest }) => rest),
    nextCursor: hasMore && last !== undefined ? last.id : null,
  };
}
