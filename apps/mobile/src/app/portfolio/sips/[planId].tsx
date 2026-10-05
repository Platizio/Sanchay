import { SipDetailScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { NativeScreen } from '../../../native/NativeScreen';

export default function SipDetailRoute() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return (
    <NativeScreen>
      <SipDetailScreen planId={planId} />
    </NativeScreen>
  );
}
