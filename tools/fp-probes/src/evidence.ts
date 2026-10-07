import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChainResult } from './types.js';

export async function writeEvidence(
  dir: string,
  chain: string,
  result: ChainResult,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `smoke-${date}-${chain}.md`);
  const lines = [
    `# FP sandbox smoke: ${chain}`,
    '',
    `Run at ${new Date().toISOString()}.`,
    '',
    '| Step | Status | Detail |',
    '|---|---|---|',
    ...result.steps.map(
      (step) => `| ${step.name} | ${step.status} | ${step.detail.replace(/\|/g, '\\|')} |`,
    ),
    '',
  ];
  await writeFile(file, lines.join('\n'), 'utf8');
  return file;
}
