import { readSiteConfig } from './site-config';

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

function apiOrigin(): string {
  const origin = process.env.SANCHAY_API_ORIGIN;
  if (!origin) throw new Error('legal-api: SANCHAY_API_ORIGIN is not set');
  return origin;
}

/** Server-only, unauthenticated fetch: /site/** pages ship no client JS, so this bypasses ApiProvider/React Query. */
export async function fetchLegalDocument(key: string): Promise<LegalDocument | null> {
  const res = await fetch(`${apiOrigin()}/api/v1/legal/documents/${key}`, {
    next: { revalidate: 3600 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`legal-api: GET /legal/documents/${key} -> ${res.status}`);
  return (await res.json()) as LegalDocument;
}

export async function fetchCommissionRates(): Promise<CommissionRate[]> {
  const res = await fetch(`${apiOrigin()}/api/v1/legal/commission-rates`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`legal-api: GET /legal/commission-rates -> ${res.status}`);
  return (await res.json()) as CommissionRate[];
}

export { readSiteConfig };
