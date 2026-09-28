import { readFileSync } from 'node:fs';
import { generateOpenApiDocument } from '@sanchay/contract/openapi';
import { describe, expect, it } from 'vitest';

const COMMITTED = new URL('../openapi.json', import.meta.url);
const HOW_TO_FIX =
  'run `pnpm --filter=@sanchay/contract build` then `pnpm --filter=@sanchay/api openapi` and commit apps/api/openapi.json';

describe('apps/api/openapi.json', () => {
  it(`matches the contract (${HOW_TO_FIX})`, async () => {
    const committed: unknown = JSON.parse(readFileSync(COMMITTED, 'utf8'));
    const generated: unknown = JSON.parse(JSON.stringify(await generateOpenApiDocument()));
    expect(committed).toEqual(generated);
  });

  it('is byte-for-byte the output of scripts/openapi.ts (no hand edits)', async () => {
    const doc = await generateOpenApiDocument();
    expect(readFileSync(COMMITTED, 'utf8').replace(/\r\n/g, '\n')).toBe(
      `${JSON.stringify(doc, null, 2)}\n`,
    );
  });
});
