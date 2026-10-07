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
  try {
    const mandate = await ctx.client.createMandate({
      mandate_type: 'UPI',
      bank_account_id: 1,
      mandate_limit: 100_000,
      provider_name: 'CYBRILLAPOA',
    });
    steps.push({
      name: 'mandate create',
      status: 'PASSED',
      detail: `id=${mandate.id}, status=${mandate.mandate_status}`,
    });
  } catch (error) {
    steps.push({ name: 'mandate create', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'mandate authorise, SIP plan create, first instalment',
    status: 'SKIPPED',
    detail: 'wired in F2 (Plan 04)',
  });
  return steps;
}
