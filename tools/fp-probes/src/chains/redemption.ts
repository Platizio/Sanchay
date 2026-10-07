import type { ChainContext, StepResult } from '../types.js';

export async function run(ctx: ChainContext): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  try {
    const plans = await ctx.client.schemePlans();
    steps.push({
      name: 'scheme catalogue list',
      status: 'PASSED',
      detail: `${plans.length} scheme(s) visible`,
    });
  } catch (error) {
    steps.push({ name: 'scheme catalogue list', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'redemption create, consent, confirm',
    status: 'SKIPPED',
    detail:
      'wired in F5 (Plan 04); needs the FP holdings snapshot (folios.fp_holdings_snapshot, R-09), which does not exist yet',
  });
  return steps;
}
