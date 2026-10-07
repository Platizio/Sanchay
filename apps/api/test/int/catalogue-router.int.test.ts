import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amcs, schemes, sebiCategories } from '../../src/db/schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';

let app: TestApp;
/** One web session for the file, from Plan 01's real sign-in flow. */
let cookies: Record<string, string>;

beforeAll(async () => {
  app = await bootTestApp();
  ({ cookies } = await signInWeb(app, '9844400101'));
});

afterAll(async () => {
  await app.close();
});

/** A web GET (Plan 01's `webHeaders`); without cookies it carries no session. */
const get = (url: string, jar: Record<string, string> = {}) =>
  app.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies: jar }) });

/** Each test file has its own database, so a per-file counter keeps codes, slugs and ISINs unique (RV-02-56). */
let seq = 0;

async function seedOneScheme(status: 'DRAFT' | 'PUBLISHED', curated: boolean) {
  seq += 1;
  const n = String(seq).padStart(5, '0');
  const [amc] = await app.db.db
    .insert(amcs)
    .values({ name: 'Test AMC', slug: `amc-${n}` })
    .returning();
  const [cat] = await app.db.db
    .insert(sebiCategories)
    .values({
      code: `CAT_${n}`,
      assetClass: 'EQUITY',
      name: 'Cat',
      slug: `cat-${n}`,
      cutoffClass: 'STANDARD',
      volatilityClass: 'V_EQUITY',
    })
    .returning();
  if (amc === undefined || cat === undefined)
    throw new Error('seedOneScheme: an insert returned no row');
  await app.db.db.insert(schemes).values({
    isin: `INFTEST${n}`,
    amcId: amc.id,
    name: 'Parag Parikh Flexi Cap Fund - Regular - Growth',
    slug: `scheme-${n}`,
    categoryCode: cat.code,
    status,
    curated,
  });
}

describe('catalogue.categories / catalogue.listSchemes', () => {
  it('requires a session', async () => {
    const res = await get('/catalogue/categories');
    expect([res.statusCode, res.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it('listSchemes returns only PUBLISHED curated REGULAR GROWTH', async () => {
    await seedOneScheme('DRAFT', true);
    await seedOneScheme('PUBLISHED', false);
    await seedOneScheme('PUBLISHED', true);
    const res = await get('/catalogue/schemes', cookies);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { items: Array<{ status: string; curated: boolean }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ status: 'PUBLISHED', curated: true });
  });

  it('trigram search matches "parag flexi"', async () => {
    await seedOneScheme('PUBLISHED', true);
    const res = await get('/catalogue/schemes?q=parag%20flexi', cookies);
    const body = JSON.parse(res.body) as { items: unknown[] };
    expect(body.items.length).toBeGreaterThan(0);
  });

  it('cursor pagination stable', async () => {
    for (let i = 0; i < 3; i++) await seedOneScheme('PUBLISHED', true);
    const page1 = JSON.parse((await get('/catalogue/schemes?cursor=', cookies)).body) as {
      items: { isin: string }[];
      nextCursor: string | null;
    };
    expect(page1.items.length).toBeGreaterThan(0);
    if (page1.nextCursor) {
      const page2 = JSON.parse(
        (await get(`/catalogue/schemes?cursor=${page1.nextCursor}`, cookies)).body,
      ) as { items: { isin: string }[] };
      const isins1 = new Set(page1.items.map((i) => i.isin));
      for (const item of page2.items) expect(isins1.has(item.isin)).toBe(false);
    }
  });
});
