import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';

/** F11 read models. Every one is session-scoped; nothing here takes an investor id. */
export function usePortfolioSummary(options: { enabled?: boolean } = {}) {
  const { utils } = useApi();
  return useQuery({ ...utils.portfolio.summary.queryOptions(), enabled: options.enabled ?? true });
}

export function usePortfolioHoldings(options: { enabled?: boolean } = {}) {
  const { utils } = useApi();
  return useQuery({ ...utils.portfolio.holdings.queryOptions(), enabled: options.enabled ?? true });
}

export function usePortfolioAllocation(options: { enabled?: boolean } = {}) {
  const { utils } = useApi();
  return useQuery({
    ...utils.portfolio.allocation.queryOptions(),
    enabled: options.enabled ?? true,
  });
}

export function usePortfolioHolding(folioId: string, isin: string) {
  const { utils } = useApi();
  return useQuery(utils.portfolio.holding.queryOptions({ input: { folioId, isin } }));
}
