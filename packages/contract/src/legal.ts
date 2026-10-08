import { oc } from '@orpc/contract';
import { z } from 'zod';
import { OkSchema } from './common.js';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const LegalDocumentKeySchema = z.enum([
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
]);

export const LegalDocumentSchema = z.object({
  key: LegalDocumentKeySchema,
  version: z.string().min(1),
  bodyMarkdown: z.string(),
  sha256: z.string(),
});

export const PendingLegalDocsSchema = z.array(
  z.object({ key: LegalDocumentKeySchema, version: z.string().min(1), title: z.string().min(1) }),
);

export const CommissionRateSchema = z.object({
  amcId: z.string().nullable(),
  schemeId: z.string().nullable(),
  minBps: z.number(),
  maxBps: z.number(),
  kind: z.enum(['EXACT', 'RANGE']),
});

export const AcceptPendingInputSchema = z.strictObject({
  keys: z.array(LegalDocumentKeySchema).min(1),
});
export type AcceptPendingInput = z.infer<typeof AcceptPendingInputSchema>;

const route = (method: 'GET' | 'POST', path: `/${string}`, summary: string) =>
  oc.route({ method, path, tags: ['legal'], summary });

export const legalContract = {
  getDocument: route('GET', '/legal/documents/{key}', 'The current PUBLISHED legal document')
    .errors(errorMap(...COMMON_ERRORS, 'NOT_FOUND'))
    .input(z.object({ key: LegalDocumentKeySchema }))
    .output(LegalDocumentSchema),
  pending: route(
    'GET',
    '/legal/pending',
    'Required documents whose current version the investor has not accepted',
  )
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .output(PendingLegalDocsSchema),
  commissionRates: route('GET', '/legal/commission-rates', 'Regular plan commission disclosure')
    .errors(errorMap(...COMMON_ERRORS))
    .output(z.array(CommissionRateSchema)),
  acceptPending: route(
    'POST',
    '/legal/pending/accept',
    'Record acceptance of the updated legal document versions that are pending (R-18)',
  )
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(AcceptPendingInputSchema)
    .output(OkSchema),
};
