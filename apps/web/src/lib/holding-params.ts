/**
 * PORT-02 route params. A malformed folio id or ISIN is a 404 page, not an API call: F11's
 * portfolio.holding would refuse it with a 400, which reads as an error rather than "not found".
 * The literals mirror z.uuid() and @sanchay/domain's ISIN_REGEX (apps/web does not depend on domain).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISIN = /^INF[A-Z0-9]{9}$/;

export function parseHoldingParams(params: {
  folioId: string;
  isin: string;
}): { folioId: string; isin: string } | null {
  const folioId = params.folioId.toLowerCase();
  const isin = params.isin.toUpperCase();
  return UUID.test(folioId) && ISIN.test(isin) ? { folioId, isin } : null;
}
