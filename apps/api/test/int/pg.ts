/**
 * Returns the SQLSTATE of a failed query, or undefined if the query succeeded.
 * Drizzle wraps node-postgres errors, so the code may sit on `.cause`.
 */
export async function pgErrorCode(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code;
  }
}
