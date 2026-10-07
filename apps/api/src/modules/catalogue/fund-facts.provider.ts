import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { type Database, DB } from '../../db/client.js';
import {
  type FundFactsSource,
  fundFacts,
  fundFactsRevisions,
  type RiskometerLevel,
} from './catalogue.schema.js';

export const FUND_FACTS_SOURCE_RANK: Record<FundFactsSource, number> = {
  ADMIN: 3,
  CYBRILLA: 2,
  AMFI: 1,
};

/** The 7 tracked fields; with sidUrl/kimUrl together as one more slot, `completeness` is out of 8. */
export const FUND_FACTS_TRACKED_FIELDS = [
  'expenseRatioPct',
  'expenseRatioAsOf',
  'riskometer',
  'riskometerAsOf',
  'benchmarkName',
  'benchmarkRiskometer',
  'exitLoadText',
] as const;

/** Every payload key the provider folds into fund_facts: the 7 tracked fields and the SID/KIM links. */
const FOLDED_KEYS: ReadonlySet<string> = new Set([
  ...FUND_FACTS_TRACKED_FIELDS,
  'sidUrl',
  'kimUrl',
]);

/**
 * ops:catalogue:seed writes its ADMIN revision as the raw CSV row (snake_case keys), while ops:facts:import and the
 * fold use camelCase. The provider accepts both so a seeded scheme is not blanked on resolve.
 */
const PAYLOAD_KEY_ALIASES: Readonly<Record<string, string>> = {
  expense_ratio_pct: 'expenseRatioPct',
  expense_ratio_as_of: 'expenseRatioAsOf',
  riskometer_as_of: 'riskometerAsOf',
  benchmark_name: 'benchmarkName',
  benchmark_riskometer: 'benchmarkRiskometer',
  exit_load_text: 'exitLoadText',
  sid_url: 'sidUrl',
  kim_url: 'kimUrl',
};

export interface FundFactsFieldValue<T = unknown> {
  value: T;
  source: FundFactsSource;
}

export interface FundFactsResolution {
  fields: Record<string, FundFactsFieldValue>;
  completeness: number;
}

@Injectable()
export class FundFactsProvider {
  constructor(@Inject(DB) private readonly db: Database) {}

  async resolve(schemeId: string): Promise<FundFactsResolution> {
    // createdAt is the transaction start time, so rows written by one statement tie on it; the uuidv7 id
    // (minted in insert order) breaks the tie.
    const revisions = await this.db
      .select({ source: fundFactsRevisions.source, payload: fundFactsRevisions.payload })
      .from(fundFactsRevisions)
      .where(eq(fundFactsRevisions.schemeId, schemeId))
      .orderBy(asc(fundFactsRevisions.createdAt), asc(fundFactsRevisions.id));

    const fields: Record<string, FundFactsFieldValue> = {};
    for (const revision of revisions) {
      for (const [rawKey, value] of Object.entries(revision.payload)) {
        const key = PAYLOAD_KEY_ALIASES[rawKey] ?? rawKey;
        // The CYBRILLA sync revision also carries purchase flags and thresholds, which are not fund facts.
        // An empty string is an empty CSV cell (a seed row's payload keeps those), not a value.
        if (!FOLDED_KEYS.has(key) || value === undefined || value === null || value === '')
          continue;
        const current = fields[key];
        const currentRank = current ? FUND_FACTS_SOURCE_RANK[current.source] : -1;
        const incomingRank = FUND_FACTS_SOURCE_RANK[revision.source];
        // A higher-precedence source always wins; a same-source revision always overwrites the
        // earlier one from that source, since `revisions` is ordered oldest -> newest.
        if (incomingRank >= currentRank) fields[key] = { value, source: revision.source };
      }
    }

    const populated = FUND_FACTS_TRACKED_FIELDS.filter((key) => fields[key] !== undefined).length;
    const sidKimPopulated = fields.sidUrl !== undefined && fields.kimUrl !== undefined;
    const slots = FUND_FACTS_TRACKED_FIELDS.length + 1; // the seven fields plus SID+KIM as one slot (RV-03-41)
    const completeness = Math.round((100 * (populated + (sidKimPopulated ? 1 : 0))) / slots);

    const fieldSources: Record<string, FundFactsSource> = {};
    for (const [key, field] of Object.entries(fields)) fieldSources[key] = field.source;

    const columns = {
      expenseRatioPct: (fields.expenseRatioPct?.value as string | undefined) ?? null,
      expenseRatioAsOf: (fields.expenseRatioAsOf?.value as string | undefined) ?? null,
      riskometer: (fields.riskometer?.value as RiskometerLevel | undefined) ?? null,
      riskometerAsOf: (fields.riskometerAsOf?.value as string | undefined) ?? null,
      benchmarkName: (fields.benchmarkName?.value as string | undefined) ?? null,
      benchmarkRiskometer:
        (fields.benchmarkRiskometer?.value as RiskometerLevel | undefined) ?? null,
      exitLoadText: (fields.exitLoadText?.value as string | undefined) ?? null,
      sidUrl: (fields.sidUrl?.value as string | undefined) ?? null,
      kimUrl: (fields.kimUrl?.value as string | undefined) ?? null,
      fieldSources,
      completeness,
    };

    await this.db
      .insert(fundFacts)
      .values({ schemeId, ...columns })
      .onConflictDoUpdate({
        target: fundFacts.schemeId,
        // $onUpdate does not fire on the conflict branch, so stamp updated_at here.
        set: { ...columns, updatedAt: new Date() },
      });

    return { fields, completeness };
  }
}
