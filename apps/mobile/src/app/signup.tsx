import { LoginScreen } from '@sanchay/features';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { NativeScreen } from '../native/NativeScreen';

export default function SignupRoute() {
  // FLAG_SECURE while the mobile number and OTP are on screen (G-E6).
  usePreventScreenCapture('signup');
  return (
    <NativeScreen>
      <LoginScreen mode="signup" />
    </NativeScreen>
  );
}
