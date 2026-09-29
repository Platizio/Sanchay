/**
 * Local and e2e only. `next.config.ts` bakes the `/api/v1/:path*` rewrite into the build from
 * `SANCHAY_API_ORIGIN`, so `next start` cannot pick it up later. A build made without it answers
 * every API call with Next's own 404, which the web app shows as "We could not find what you were
 * looking for." Playwright's global setup calls this on `.next/routes-manifest.json` to fail fast.
 */
const API_REWRITE_SOURCE = '/api/v1/:path*';

interface RewriteEntry {
  source?: unknown;
  destination?: unknown;
}

function rewriteEntries(manifest: unknown): RewriteEntry[] {
  if (typeof manifest !== 'object' || manifest === null) return [];
  const rewrites = (manifest as { rewrites?: unknown }).rewrites;
  if (Array.isArray(rewrites)) return rewrites as RewriteEntry[];
  if (typeof rewrites !== 'object' || rewrites === null) return [];
  return Object.values(rewrites as Record<string, unknown>).flatMap((phase) =>
    Array.isArray(phase) ? (phase as RewriteEntry[]) : [],
  );
}

/** Returns why the build cannot reach the e2e API at `apiOrigin`, or null when it can. */
export function apiRewriteProblem(manifest: unknown, apiOrigin: string): string | null {
  const expected = `${apiOrigin.replace(/\/+$/, '')}/api/v1/:path*`;
  const rebuild =
    `Rebuild apps/web with SANCHAY_API_ORIGIN=${apiOrigin.replace(/\/+$/, '')} ` +
    '(plus SANCHAY_PLATFORM_ARN and SANCHAY_PLATFORM_ARN_VALID_TILL), or run the root ' +
    '`pnpm e2e:web`, which rebuilds it through turbo with that env.';
  const rewrite = rewriteEntries(manifest).find((entry) => entry.source === API_REWRITE_SOURCE);
  if (!rewrite) {
    return `The apps/web .next build has no /api/v1 rewrite, so every API call returns Next's 404. ${rebuild}`;
  }
  if (rewrite.destination !== expected) {
    return `The apps/web .next build rewrites /api/v1 to ${String(rewrite.destination)}, not ${expected}. ${rebuild}`;
  }
  return null;
}
