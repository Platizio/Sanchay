import { v7 as uuidv7 } from 'uuid';

/**
 * Tables that exist after Plan 01 (B7). plan-02-mvp-kernel and the later MVP plans extend this
 * union as they add tables.
 */
export type TableName =
  | 'amcs'
  | 'app_config'
  | 'audit_events'
  | 'auth_sessions'
  | 'category_aliases'
  | 'commission_disclosures'
  | 'fund_facts'
  | 'fund_facts_revisions'
  | 'idempotency_keys'
  | 'investor_contacts'
  | 'investor_devices'
  | 'investors'
  | 'market_holidays'
  | 'nav_history'
  | 'nav_sync_runs'
  | 'otp_codes'
  | 'provider_calls'
  | 'recon_breaks'
  | 'scheme_navs'
  | 'scheme_returns'
  | 'schemes'
  | 'sebi_categories'
  | 'worker_heartbeats';

declare const rowIdBrand: unique symbol;

/**
 * An id minted by the app before insert, so it can be used as encryption AAD
 * (design §C.1, MED-3). The brand records which table the id belongs to.
 */
export type RowId<T extends TableName = TableName> = string & { readonly [rowIdBrand]: T };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newId<T extends TableName>(_table: T): RowId<T> {
  return uuidv7() as RowId<T>;
}

export function asRowId<T extends TableName>(_table: T, id: string): RowId<T> {
  if (!UUID_RE.test(id)) {
    throw new TypeError('asRowId: not a UUID');
  }
  return id.toLowerCase() as RowId<T>;
}
