import type { ExpoConfig } from 'expo/config';

const isProduction = process.env.APP_VARIANT === 'production';

const config: ExpoConfig = {
  name: 'Sanchay',
  slug: 'sanchay',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // Android only in the MVP (iOS is P2-10).
  platforms: ['android'],
  // The custom URL scheme is dev-only (H-1); production builds ship without it.
  ...(isProduction ? {} : { scheme: 'sanchay' }),
  android: { package: 'in.sanchay.app' },
  plugins: ['expo-router', 'expo-secure-store', 'expo-local-authentication'],
  experiments: { typedRoutes: true },
};

export default config;
