/**
 * Writes `docs/specs/states.md` from `renderStatesDoc()` (D5). It reads the built package: plain Node 24
 * (type stripping) cannot load `packages/domain/src`, whose relative imports end in `.js`
 * (RV-02-51). Run `pnpm gen:states`, which builds `@sanchay/domain` first. CI's "States drift" step
 * runs it, then `git diff --exit-code docs/specs/states.md`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderStatesDoc } from '../packages/domain/dist/index.js';

const outPath = fileURLToPath(new URL('../docs/specs/states.md', import.meta.url));
const next = renderStatesDoc();
let current: string | null = null;
try {
  current = readFileSync(outPath, 'utf8');
} catch {
  // First run: neither the file nor docs/specs/ exists yet.
}
if (current !== next) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, next, 'utf8');
  console.log(`wrote ${outPath}`);
}
