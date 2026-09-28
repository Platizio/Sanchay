/** SQLSTATE of a node-postgres error, read directly or from Drizzle's wrapping `.cause`. */
export function pgErrorCodeOf(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object') return undefined;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.cause?.code === 'string') return e.cause.code;
  return typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : undefined;
}
