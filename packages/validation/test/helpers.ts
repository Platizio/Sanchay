import type { z } from 'zod';

/** Returns the issues for an input the schema must reject; throws if it was accepted. */
export function issuesOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error(`Expected ${JSON.stringify(input)} to be rejected`);
  }
  return result.error.issues;
}
