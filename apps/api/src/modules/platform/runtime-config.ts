import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbExecutor } from '../../db/client.js';
import { AppError } from './errors.js';
import {
  appConfig,
  RECON_BREAK_SEVERITIES,
  type ReconBreakSeverity,
  reconBreaks,
} from './kernel.schema.js';

export const RUNTIME_CONFIG_SCHEMAS = {
  'orders.enabled': z.boolean(),
  'plans.sip.enabled': z.boolean(),
  'fp.lumpsumFlow': z.enum(['CUSTOM_CHECKOUT', 'PAYMENT_AFTER_SUBMIT']),
  'fp.sendPartner': z.boolean(),
  'features.redeemByUnits': z.boolean(),
  'pilot.caps.perOrder': z.string(),
  'pilot.caps.perInvestorPerDay': z.string(),
  money_params_version: z.string(),
  'minAppVersion.android': z.string(),
} as const;

export type RuntimeConfigKey = keyof typeof RUNTIME_CONFIG_SCHEMAS;
export type RuntimeConfigValue<K extends RuntimeConfigKey> = z.infer<
  (typeof RUNTIME_CONFIG_SCHEMAS)[K]
>;

/** MVP defaults (R-06 keeps plans.sip.enabled false until GO-2; H-2 fixes the lumpsum flow). */
export const RUNTIME_CONFIG_DEFAULTS: { [K in RuntimeConfigKey]: RuntimeConfigValue<K> } = {
  'orders.enabled': false,
  'plans.sip.enabled': false,
  'fp.lumpsumFlow': 'CUSTOM_CHECKOUT',
  'fp.sendPartner': false,
  'features.redeemByUnits': false,
  'pilot.caps.perOrder': '100000.00',
  'pilot.caps.perInvestorPerDay': '200000.00',
  money_params_version: 'v1',
  'minAppVersion.android': '1.0.0',
};

export class RuntimeConfig {
  static async get<K extends RuntimeConfigKey>(
    exec: DbExecutor,
    key: K,
  ): Promise<RuntimeConfigValue<K>> {
    // The jsonb is read as text and parsed once (RV-02-31): Drizzle's jsonb mapper JSON-parses
    // the string node-postgres has already parsed, so a stored "4000.00" would read back as 4000.
    const [row] = await exec
      .select({ value: sql<string>`${appConfig.value}::text` })
      .from(appConfig)
      .where(eq(appConfig.key, key));
    if (row === undefined) return RUNTIME_CONFIG_DEFAULTS[key];
    const schema = RUNTIME_CONFIG_SCHEMAS[key];
    const parsed = schema.safeParse(JSON.parse(row.value));
    if (!parsed.success) {
      throw new AppError('INTERNAL', {
        message: `app_config row '${key}' does not match its RuntimeConfig schema`,
        cause: parsed.error,
      });
    }
    return parsed.data as RuntimeConfigValue<K>;
  }
}

export interface ReconBreakOpenInput {
  kind: string;
  entityType: string;
  entityId: string;
  severity: ReconBreakSeverity;
  detail?: Record<string, unknown>;
}

export class ReconBreaks {
  /**
   * Idempotent while an open break for the same (kind, entity_id) exists. ON CONFLICT on the partial
   * unique index, not a caught 23505: a failed INSERT aborts the caller's transaction, and PostgreSQL
   * then turns its COMMIT into a silent ROLLBACK (RV-02-67).
   */
  static async open(exec: DbExecutor, input: ReconBreakOpenInput): Promise<void> {
    if (!RECON_BREAK_SEVERITIES.includes(input.severity)) {
      throw new TypeError(`ReconBreaks.open: unknown severity '${input.severity}'`);
    }
    await exec
      .insert(reconBreaks)
      .values({
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId,
        severity: input.severity,
        detail: input.detail ?? {},
      })
      .onConflictDoNothing({
        target: [reconBreaks.kind, reconBreaks.entityId],
        where: sql`status <> 'RESOLVED'`,
      });
  }
}
