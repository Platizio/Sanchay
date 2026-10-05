import { SipReviewScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { NativeScreen } from '../../../../native/NativeScreen';

export default function SipReviewRoute() {
  // FLAG_SECURE while the consent OTP sheet (CNF-01) can be on screen (G-E6).
  usePreventScreenCapture('sip-review');
  const { schemeId } = useLocalSearchParams<{ schemeId: string }>();
  return (
    <NativeScreen>
      <SipReviewScreen schemeId={schemeId} />
    </NativeScreen>
  );
}
