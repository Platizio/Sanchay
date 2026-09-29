import { describe, expect, it } from 'vitest';
import { apiRewriteProblem } from './api-rewrite';

const ORIGIN = 'http://localhost:3000';
const rewrite = (destination: string) => ({
  source: '/api/v1/:path*',
  destination,
  regex: '^/api/v1(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?(?:/)?$',
});
const manifest = (afterFiles: unknown[]) => ({
  rewrites: { beforeFiles: [], afterFiles, fallback: [] },
});

describe('apiRewriteProblem (e2e guard on the built .next routes manifest)', () => {
  it('accepts a build whose /api/v1 rewrite targets the e2e API origin', () => {
    expect(apiRewriteProblem(manifest([rewrite(`${ORIGIN}/api/v1/:path*`)]), ORIGIN)).toBeNull();
  });

  it('accepts the flat-array rewrites shape', () => {
    expect(
      apiRewriteProblem({ rewrites: [rewrite(`${ORIGIN}/api/v1/:path*`)] }, ORIGIN),
    ).toBeNull();
  });

  it('ignores a trailing slash on the expected origin', () => {
    expect(
      apiRewriteProblem(manifest([rewrite(`${ORIGIN}/api/v1/:path*`)]), `${ORIGIN}/`),
    ).toBeNull();
  });

  it('rejects a build made without SANCHAY_API_ORIGIN (no rewrite: every API call 404s in Next)', () => {
    const problem = apiRewriteProblem(manifest([]), ORIGIN);
    expect(problem).toMatch(/no \/api\/v1 rewrite/);
    expect(problem).toContain(`SANCHAY_API_ORIGIN=${ORIGIN}`);
    expect(problem).toContain('pnpm e2e:web');
  });

  it('rejects a build whose rewrite targets a different API origin', () => {
    const problem = apiRewriteProblem(
      manifest([rewrite('http://localhost:4000/api/v1/:path*')]),
      ORIGIN,
    );
    expect(problem).toContain('http://localhost:4000/api/v1/:path*');
    expect(problem).toContain(`${ORIGIN}/api/v1/:path*`);
  });

  it('rejects a missing or malformed manifest', () => {
    expect(apiRewriteProblem(undefined, ORIGIN)).toMatch(/no \/api\/v1 rewrite/);
    expect(apiRewriteProblem({ rewrites: 'nope' }, ORIGIN)).toMatch(/no \/api\/v1 rewrite/);
  });
});
