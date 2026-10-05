import { Stack } from 'expo-router';

/**
 * The Portfolio tab is a stack: PORT-01 at its root, then PORT-02 (holdings/[folioId]/[isin]),
 * ORD-01/02 (orders, E24) and SIPM-01/02 (sips, F12) pushed on top, so the tab bar stays visible
 * and Back returns to the list (H-14). Without this layout, each nested file would become its own tab.
 */
export default function PortfolioStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
