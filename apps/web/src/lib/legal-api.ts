import { readSiteConfig } from './site-config';

/** Mirrors LegalDocumentKeySchema in packages/contract/src/legal.ts (web does not depend on the contract). */
const LEGAL_DOCUMENT_KEYS = [
  'TNC',
  'PRIVACY_NOTICE',
  'RISK_DISCLOSURE',
  'REGULAR_PLAN_COMMISSION',
  'EXECUTION_ONLY_DECLARATION',
  'FATCA_CRS_DECLARATION',
  'NOMINATION_OPT_OUT_ANNEX_B',
  'CAS_IMPORT_NOTICE',
  'KYC_CONSENT',
  'INVESTOR_CHARTER',
  'GRIEVANCE_POLICY',
] as const;

export type LegalDocumentKey = (typeof LEGAL_DOCUMENT_KEYS)[number];

/** Public www slugs (`/legal/privacy`, the Play privacy-policy URL) for the documents people link to. */
const LEGAL_SLUGS: Readonly<Record<string, LegalDocumentKey>> = {
  privacy: 'PRIVACY_NOTICE',
  terms: 'TNC',
  'risk-disclosure': 'RISK_DISCLOSURE',
  'regular-plan-commission': 'REGULAR_PLAN_COMMISSION',
  'investor-charter': 'INVESTOR_CHARTER',
  'grievance-policy': 'GRIEVANCE_POLICY',
};

export interface LegalDocument {
  key: string;
  version: number;
  bodyMarkdown: string;
  sha256: string;
}

export interface CommissionRate {
  amcId: string | null;
  schemeId: string | null;
  minBps: number;
  maxBps: number;
  kind: 'EXACT' | 'RANGE';
}

/** A public slug or a canonical key; null for anything else, so the page never sends the API a bad key. */
export function legalDocumentKey(slugOrKey: string): LegalDocumentKey | null {
  const bySlug = LEGAL_SLUGS[slugOrKey];
  if (bySlug !== undefined) return bySlug;
  return (LEGAL_DOCUMENT_KEYS as readonly string[]).includes(slugOrKey)
    ? (slugOrKey as LegalDocumentKey)
    : null;
}

/**
 * The legal procedures are app-host routes (HostGuard, R-11) that need a client header (ClientGuard),
 * so the www server calls them through the app origin, whose /api/v1/* the ALB sends to the api, as a
 * web client. A single-host local setup has no app origin and uses the API origin directly.
 */
function legalApiBase(): string {
  const origin = process.env.SANCHAY_APP_ORIGIN || process.env.SANCHAY_API_ORIGIN;
  if (!origin)
    throw new Error('legal-api: neither SANCHAY_APP_ORIGIN nor SANCHAY_API_ORIGIN is set');
  return `${origin}/api/v1/legal`;
}

const WEB_CLIENT_HEADERS = { 'x-sanchay-client': 'web' } as const;

/** Server-only, unauthenticated fetch: /site/** pages ship no client JS, so this bypasses ApiProvider/React Query. */
export async function fetchLegalDocument(slugOrKey: string): Promise<LegalDocument | null> {
  const key = legalDocumentKey(slugOrKey);
  if (key === null) return null;
  const res = await fetch(`${legalApiBase()}/documents/${key}`, {
    headers: WEB_CLIENT_HEADERS,
    next: { revalidate: 3600 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`legal-api: GET /legal/documents/${key} -> ${res.status}`);
  return (await res.json()) as LegalDocument;
}

export async function fetchCommissionRates(): Promise<CommissionRate[]> {
  const res = await fetch(`${legalApiBase()}/commission-rates`, {
    headers: WEB_CLIENT_HEADERS,
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`legal-api: GET /legal/commission-rates -> ${res.status}`);
  return (await res.json()) as CommissionRate[];
}

export { readSiteConfig };
