import * as domain from '@sanchay/domain';
import { describe, expect, it } from 'vitest';
import {
  ARN_REGEX,
  dsc02,
  LEGAL_COPY_STATUS,
  LEGAL_ENTITY_NAME,
  MARKET_RISK_WARNING,
  REGULAR_PLAN_NOTICE,
} from './index';

describe('regulatory copy', () => {
  it('carries the standard market-risk warning verbatim', () => {
    expect(MARKET_RISK_WARNING).toBe(
      'Mutual fund investments are subject to market risks, read all scheme related documents carefully.',
    );
  });

  it('discloses Regular plans and names the distributor from the domain legal-entity module', () => {
    expect(LEGAL_ENTITY_NAME.trim().length).toBeGreaterThan(0);
    expect(REGULAR_PLAN_NOTICE).toBe(
      `Sanchay offers Regular plans of mutual funds; ${LEGAL_ENTITY_NAME}, the distributor, earns a commission from the fund house.`,
    );
  });

  it('re-exports the single R-19 legal-entity module from @sanchay/domain unchanged', () => {
    expect(LEGAL_ENTITY_NAME).toBe(domain.LEGAL_ENTITY_NAME);
    expect(LEGAL_COPY_STATUS).toBe(domain.LEGAL_COPY_STATUS);
    expect(ARN_REGEX).toBe(domain.ARN_REGEX);
    expect(dsc02).toBe(domain.dsc02);
  });
});
