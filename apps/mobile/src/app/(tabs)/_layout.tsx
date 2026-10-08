import { LegalPendingBanner } from '@sanchay/features';
import { color } from '@sanchay/tokens';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// H-14: four tabs in the MVP. The fifth (SIPs) arrives with SIP management in P2-5.
// R-18: AppShell is web-only, so the legal re-accept banner sits above the tabs here. The top safe-area inset
// moves up with it: each tab's NativeScreen then measures zero top inset, so the total padding is unchanged.
export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: color.bg }}>
        <LegalPendingBanner />
      </SafeAreaView>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.primary,
          tabBarInactiveTintColor: color.muted,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
        <Tabs.Screen name="portfolio" options={{ title: 'Portfolio' }} />
        <Tabs.Screen name="account" options={{ title: 'Account' }} />
      </Tabs>
    </View>
  );
}
