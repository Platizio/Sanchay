import { MARKET_RISK_WARNING } from '@sanchay/app-core/copy';
import { AppText, Button, Screen } from '@sanchay/ui';

export interface WelcomeScreenProps {
  onCreateAccount: () => void;
  onLogIn: () => void;
}

export function WelcomeScreen({ onCreateAccount, onLogIn }: WelcomeScreenProps) {
  return (
    <Screen testID="welcome-screen">
      <AppText variant="title">Sanchay</AppText>
      <AppText tone="muted">Invest in mutual funds with clear numbers and no jargon.</AppText>
      <Button label="Create account" onPress={onCreateAccount} />
      <Button variant="secondary" label="I already have an account" onPress={onLogIn} />
      <AppText variant="caption" tone="muted">
        {MARKET_RISK_WARNING}
      </AppText>
    </Screen>
  );
}
