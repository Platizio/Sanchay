import type { Metadata } from 'next';
import { OnboardingHubRoute } from '../../../client/routes';

export const metadata: Metadata = { title: 'Set up your account' };

export default function OnboardingHubPage() {
  return <OnboardingHubRoute />;
}
