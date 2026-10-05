import { HoldingDetailScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { NativeScreen } from '../../../../../native/NativeScreen';

/** PORT-02. A malformed id reaches F11 as-is and comes back as a 400/404, which the screen renders. */
export default function HoldingRoute() {
  const { folioId, isin } = useLocalSearchParams<{ folioId: string; isin: string }>();
  return (
    <NativeScreen>
      <HoldingDetailScreen folioId={String(folioId)} isin={String(isin).toUpperCase()} />
    </NativeScreen>
  );
}
