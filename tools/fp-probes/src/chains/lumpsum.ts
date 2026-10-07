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
    return steps;
  }
  try {
    const purchase = await ctx.client.createPurchase({
      source_ref_id: `probe-${Date.now()}`,
      mf_investment_account: 'mfia_probe',
      scheme: 'INF209K01157',
      amount: '1500.00',
      user_ip: '127.0.0.1',
      gateway: 'ondc',
    });
    steps.push({
      name: 'purchase create (H-2 custom checkout, step 1)',
      status: 'PASSED',
      detail: `id=${purchase.id}, state=${purchase.state}`,
    });
  } catch (error) {
    steps.push({ name: 'purchase create', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'consent, confirm, payment, allotment',
    status: 'SKIPPED',
    detail:
      'wired in E20 (Plan 03); extend this file once ConsentEngine and the lumpsum saga exist',
  });
  return steps;
}
