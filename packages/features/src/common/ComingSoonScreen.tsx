import { AppText, Screen } from '@sanchay/ui';

export interface ComingSoonScreenProps {
  title: string;
  testID?: string;
}

/** Placeholder for Explore (plan-03 catalogue) and Portfolio (plan-07) until those screens land. */
export function ComingSoonScreen({ title, testID = 'coming-soon-screen' }: ComingSoonScreenProps) {
  return (
    <Screen testID={testID}>
      <AppText variant="title">{title}</AppText>
      <AppText tone="muted">This section is coming soon.</AppText>
    </Screen>
  );
}
