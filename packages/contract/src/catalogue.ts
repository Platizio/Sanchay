import { oc } from '@orpc/contract';
import { z } from 'zod';
import { COMMON_ERRORS, errorMap, SESSION_ERRORS } from './errors.js';

export const SebiCategorySchema = z.object({
  code: z.string(),
  assetClass: z.string(),
  name: z.string(),
  slug: z.string(),
  cutoffClass: z.string(),
  volatilityClass: z.string(),
});
export type SebiCategory = z.infer<typeof SebiCategorySchema>;

export const SchemeSummarySchema = z.object({
  isin: z.string(),
  name: z.string(),
  slug: z.string(),
  categoryCode: z.string(),
  status: z.string(),
  curated: z.boolean(),
});
export type SchemeSummary = z.infer<typeof SchemeSummarySchema>;

export const ListSchemesInputSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().optional(),
  cursor: z.string().optional(),
});
export type ListSchemesInput = z.infer<typeof ListSchemesInputSchema>;

export const ListSchemesOutputSchema = z.object({
  items: z.array(SchemeSummarySchema),
  nextCursor: z.string().nullable(),
});

export const catalogueContract = {
  categories: oc
    .route({
      method: 'GET',
      path: '/catalogue/categories',
      tags: ['catalogue'],
      summary: 'List the SEBI category taxonomy',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(z.strictObject({}))
    .output(z.array(SebiCategorySchema)),
  listSchemes: oc
    .route({
      method: 'GET',
      path: '/catalogue/schemes',
      tags: ['catalogue'],
      summary: 'Browse the curated, published Regular-Growth catalogue',
    })
    .errors(errorMap(...COMMON_ERRORS, ...SESSION_ERRORS))
    .input(ListSchemesInputSchema)
    .output(ListSchemesOutputSchema),
};
