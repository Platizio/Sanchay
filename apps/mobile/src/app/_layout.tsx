import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLockGate } from '../native/AppLockGate';
import { AppProviders } from '../native/AppProviders';
import { SessionProvider, useSession } from '../native/SessionProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SessionProvider>
        <AppLockGate>
          <AppProviders>
            <RootNavigator />
          </AppProviders>
        </AppLockGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const signedIn = useSession().status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="redeem/[folioId]/[isin]" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
    </Stack>
  );
}
