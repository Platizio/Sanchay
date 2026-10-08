import { beforeEach, describe, expect, it, vi } from 'vitest';

const preventScreenCapture = vi.fn();
vi.mock('expo-screen-capture', () => ({ usePreventScreenCapture: preventScreenCapture }));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({ step: 'identity' }) }));
vi.mock('@sanchay/features', () => ({
  AddressScreen: () => null,
  FatcaScreen: () => null,
  IdentityScreen: () => null,
  PersonalDetailsScreen: () => null,
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
  });

  it('arms FLAG_SECURE (usePreventScreenCapture) while ONB-01 identity fields are on screen', async () => {
    const { default: OnboardingStepRoute } = await import('../app/onboarding/[step]');
    OnboardingStepRoute();
    expect(preventScreenCapture).toHaveBeenCalledWith('onboarding-identity');
  });
});
