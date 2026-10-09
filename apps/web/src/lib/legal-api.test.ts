import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCommissionRates, fetchLegalDocument, legalDocumentKey } from './legal-api';

const DOC = { key: 'PRIVACY_NOTICE', version: '1', bodyMarkdown: 'Body', sha256: 'abc' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('legal-api (H15: www legal pages must reach the API in prod)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SANCHAY_APP_ORIGIN', 'https://app.sanchay.in');
    vi.stubEnv('SANCHAY_API_ORIGIN', 'https://api.sanchay.in');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('maps the public slugs and the canonical keys to a LegalDocumentKey, and nothing else', () => {
    expect(legalDocumentKey('privacy')).toBe('PRIVACY_NOTICE');
    expect(legalDocumentKey('terms')).toBe('TNC');
    expect(legalDocumentKey('investor-charter')).toBe('INVESTOR_CHARTER');
    expect(legalDocumentKey('grievance-policy')).toBe('GRIEVANCE_POLICY');
    expect(legalDocumentKey('risk-disclosure')).toBe('RISK_DISCLOSURE');
    expect(legalDocumentKey('PRIVACY_NOTICE')).toBe('PRIVACY_NOTICE');
    expect(legalDocumentKey('TNC')).toBe('TNC');
    expect(legalDocumentKey('privacy-notice-v2')).toBeNull();
    expect(legalDocumentKey('../admin')).toBeNull();
  });

  it('fetches through the app origin (HostGuard: app host only) as a web client (ClientGuard)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, DOC));
    await expect(fetchLegalDocument('privacy')).resolves.toEqual(DOC);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://app.sanchay.in/api/v1/legal/documents/PRIVACY_NOTICE');
    expect(new Headers(init?.headers).get('x-sanchay-client')).toBe('web');
  });

  it('falls back to the API origin when no app origin is set (single-host local dev)', async () => {
    vi.stubEnv('SANCHAY_APP_ORIGIN', '');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, DOC));
    await fetchLegalDocument('PRIVACY_NOTICE');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.sanchay.in/api/v1/legal/documents/PRIVACY_NOTICE',
    );
  });

  it('returns null for an unknown slug without calling the API, and for a 404', async () => {
    await expect(fetchLegalDocument('no-such-document')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { code: 'NOT_FOUND' }));
    await expect(fetchLegalDocument('terms')).resolves.toBeNull();
  });

  it('throws on any other failure, naming the status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: 'ORIGIN_REJECTED' }));
    await expect(fetchLegalDocument('privacy')).rejects.toThrow(/403/);
  });

  it('fetches the commission rates the same way', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, []));
    await expect(fetchCommissionRates()).resolves.toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://app.sanchay.in/api/v1/legal/commission-rates');
    expect(new Headers(init?.headers).get('x-sanchay-client')).toBe('web');
  });
});
