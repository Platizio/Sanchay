// Pure constants and functions, so React Server Components can import them via '@sanchay/app-core/copy'.
// The legal-entity symbols come from the single R-19 module packages/domain/src/legal-entity.ts.
export {
  ARN_REGEX,
  dsc02,
  LEGAL_COPY_STATUS,
  LEGAL_ENTITY_NAME,
  type LegalCopyStatus,
} from '@sanchay/domain';
export { MARKET_RISK_WARNING, REGULAR_PLAN_NOTICE } from './regulatory';
