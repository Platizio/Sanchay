import type { Metadata } from 'next';
import { OnboardingStepRoute } from '../../../../client/routes';

export const metadata: Metadata = { title: 'Set up your account' };

export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  return <OnboardingStepRoute step={step} />;
}
