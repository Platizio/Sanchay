import type { ChainContext, StepResult } from '../types.js';

export async function run(ctx: ChainContext): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  try {
    const pv = await ctx.client.preVerify({
      pan: 'AAAPA3751A',
      name: 'Rani Gupta',
      dateOfBirth: '1955-10-25',
    });
    steps.push({
      name: 'POA pre-verification create',
      status: 'PASSED',
      detail: `id=${pv.id}, status=${pv.status}`,
    });
    const fetched = await ctx.client.getPreVerification(String(pv.id));
    steps.push({
      name: 'POA pre-verification fetch',
      status: 'PASSED',
      detail: `status=${fetched.status}`,
    });
  } catch (error) {
    steps.push({ name: 'POA pre-verification', status: 'FAILED', detail: String(error) });
  }
  steps.push({
    name: 'FP provisioning (investor profile, contacts, bank, MF investment account)',
    status: 'SKIPPED',
    detail: 'wired in E6/E11 (Plan 03); extend this file once FpProvision is no longer a stub',
  });
  return steps;
}
