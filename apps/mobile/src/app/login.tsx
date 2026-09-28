import { LoginScreen } from '@sanchay/features';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { NativeScreen } from '../native/NativeScreen';

export default function LoginRoute() {
  // FLAG_SECURE while the mobile number and OTP are on screen (G-E6).
  usePreventScreenCapture('login');
  return (
    <NativeScreen>
      <LoginScreen mode="login" />
    </NativeScreen>
  );
}
