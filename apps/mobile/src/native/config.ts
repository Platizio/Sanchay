import Constants from 'expo-constants';
import { parseMobileConfig } from '../lib/config';

// EXPO_PUBLIC_* must be referenced literally so Expo inlines them at bundle time (H-8 names).
export const mobileConfig = parseMobileConfig({
  apiBaseUrl: process.env.EXPO_PUBLIC_SANCHAY_API_BASE_URL,
  appOrigin: process.env.EXPO_PUBLIC_SANCHAY_APP_ORIGIN,
  wwwOrigin: process.env.EXPO_PUBLIC_SANCHAY_WWW_ORIGIN,
  appVersion: Constants.expoConfig?.version,
});
