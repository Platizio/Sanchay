import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as lumpsum from './chains/lumpsum.js';
import * as onboarding from './chains/onboarding.js';
import * as redemption from './chains/redemption.js';
import * as sip from './chains/sip.js';
import { writeEvidence } from './evidence.js';
import { buildClient } from './fp-client.js';
import type { ChainContext, ChainName, ChainResult, RunOptions, StepResult } from './types.js';

export const CHAIN_NAMES: readonly ChainName[] = ['onboarding', 'lumpsum', 'sip', 'redemption'];

const CHAINS: Record<ChainName, { run(ctx: ChainContext): Promise<StepResult[]> }> = {
  onboarding,
  lumpsum,
  sip,
  redemption,
};

export async function runChain(chain: ChainName, options: RunOptions): Promise<ChainResult> {
  const ctx = await buildClient(options);
  const steps = await CHAINS[chain].run(ctx);
  return { chain, steps };
}

function parseArgs(argv: readonly string[]): { chain: ChainName; env: 'fake' | 'sandbox' } {
  const chainArg = argv.find((a) => a.startsWith('--chain='))?.slice('--chain='.length);
  const envArg = argv.find((a) => a.startsWith('--env='))?.slice('--env='.length);
  if (chainArg === undefined || !CHAIN_NAMES.includes(chainArg as ChainName)) {
    throw new Error(`--chain must be one of ${CHAIN_NAMES.join(', ')}`);
  }
  if (envArg !== 'fake' && envArg !== 'sandbox') {
    throw new Error('--env must be "fake" or "sandbox"');
  }
  return { chain: chainArg as ChainName, env: envArg };
}

async function main(): Promise<void> {
  const { chain, env } = parseArgs(process.argv.slice(2));
  const result = await runChain(chain, { env });
  const evidenceDir = path.resolve(process.cwd(), '../../docs/probes');
  const file = await writeEvidence(evidenceDir, chain, result);
  for (const step of result.steps) {
    console.log(`[${step.status}] ${step.name} -- ${step.detail}`);
  }
  console.log(`Evidence written to ${file}`);
  if (result.steps.some((step) => step.status === 'FAILED')) {
    process.exitCode = 1;
  }
}

// RV-02-24: compare file URLs; `file://${argv[1]}` never matches import.meta.url on Windows.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
