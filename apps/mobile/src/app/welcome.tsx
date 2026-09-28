import { WelcomeScreen } from '@sanchay/features';
import { router } from 'expo-router';
import { NativeScreen } from '../native/NativeScreen';

export default function WelcomeRoute() {
  return (
    <NativeScreen>
      <WelcomeScreen
        onCreateAccount={() => router.push('/signup')}
        onLogIn={() => router.push('/login')}
      />
    </NativeScreen>
  );
}
