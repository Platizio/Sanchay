import { SipSetupScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { NativeScreen } from '../../../../native/NativeScreen';

export default function SipSetupRoute() {
  const { schemeId } = useLocalSearchParams<{ schemeId: string }>();
  return (
    <NativeScreen>
      <SipSetupScreen schemeId={schemeId} />
    </NativeScreen>
  );
}
