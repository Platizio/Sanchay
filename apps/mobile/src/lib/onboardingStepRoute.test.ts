import { beforeEach, describe, expect, it, vi } from 'vitest';

const preventScreenCapture = vi.fn();
const localSearchParams = vi.fn(() => ({ step: 'identity' }));
vi.mock('expo-screen-capture', () => ({ usePreventScreenCapture: preventScreenCapture }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => localSearchParams() }));
vi.mock('@sanchay/features', () => ({
  AddressScreen: () => null,
  BankScreen: () => null,
  DeclarationsScreen: () => null,
  FatcaScreen: () => null,
  IdentityScreen: () => null,
  NomineesScreen: () => null,
  PersonalDetailsScreen: () => null,
  ProvisioningStatusScreen: () => null,
  ReviewAttestScreen: () => null,
  RiskQuestionnaireScreen: () => null,
}));
vi.mock('../native/NativeScreen', () => ({
  NativeScreen: ({ children }: { children: unknown }) => children,
}));

// Plan 03 put this test next to the route in src/app/onboarding. Expo Router turns every file under
// src/app into a route, and this app's Vitest only collects src/lib, so it lives here. The route
// component only calls hooks that are mocked above, so it is called directly: the app has no React
// renderer (no react-dom or react-test-renderer) and adding one is not this task's call.
describe('mobile onboarding/[step] route', () => {
  beforeEach(() => {
    preventScreenCapture.mockClear();
    localSearchParams.mockReturnValue({ step: 'identity' });
  });

  it('arms FLAG_SECURE (usePreventScreenCapture) while ONB-01 identity fields are on screen', async () => {
    const { default: OnboardingStepRoute } = await import('../app/onboarding/[step]');
    OnboardingStepRoute();
    expect(preventScreenCapture).toHaveBeenCalledWith('onboarding-identity');
  });

  it('keeps FLAG_SECURE on while the bank account form is on screen', async () => {
    localSearchParams.mockReturnValue({ step: 'bank' });
    const { default: OnboardingStepRoute } = await import('../app/onboarding/[step]');
    OnboardingStepRoute();
    expect(preventScreenCapture).toHaveBeenCalledWith('onboarding-bank');
  });

  it('keeps FLAG_SECURE on while the attest CNF-01 sheet is on screen', async () => {
    localSearchParams.mockReturnValue({ step: 'review' });
    const { default: OnboardingStepRoute } = await import('../app/onboarding/[step]');
    OnboardingStepRoute();
    expect(preventScreenCapture).toHaveBeenCalledWith('onboarding-review');
  });

  it('renders the screen for every batch-2 slug instead of falling back to identity', async () => {
    const features = await import('@sanchay/features');
    const { default: OnboardingStepRoute } = await import('../app/onboarding/[step]');
    const expected = {
      bank: features.BankScreen,
      nominees: features.NomineesScreen,
      risk: features.RiskQuestionnaireScreen,
      declarations: features.DeclarationsScreen,
      review: features.ReviewAttestScreen,
      provisioning: features.ProvisioningStatusScreen,
    };
    for (const [step, screen] of Object.entries(expected)) {
      localSearchParams.mockReturnValue({ step });
      const element = OnboardingStepRoute() as { props: { children: { type: unknown } } };
      expect(element.props.children.type).toBe(screen);
    }
  });
});
