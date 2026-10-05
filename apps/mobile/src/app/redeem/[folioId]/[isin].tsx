import { RedeemScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { NativeScreen } from '../../../native/NativeScreen';

export default function RedeemRoute() {
  // FLAG_SECURE: the folio's payout bank and the CNF-01 consent codes (G-E6, stores.md §5.2).
  usePreventScreenCapture('redeem');
  const { folioId, isin } = useLocalSearchParams<{ folioId: string; isin: string }>();
  return (
    <NativeScreen>
      <RedeemScreen folioId={folioId} isin={isin} />
    </NativeScreen>
  );
}
