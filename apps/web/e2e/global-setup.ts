import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRewriteProblem } from '../src/lib/api-rewrite';

const API_ORIGIN = process.env.SANCHAY_API_ORIGIN ?? 'http://localhost:3000';
const MANIFEST = fileURLToPath(new URL('../.next/routes-manifest.json', import.meta.url));

function readManifest(): unknown {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Fails fast when `next start` serves a build whose /api/v1 rewrite cannot reach the e2e API. */
export default function globalSetup(): void {
  const problem = apiRewriteProblem(readManifest(), API_ORIGIN);
  if (problem) throw new Error(problem);
}
