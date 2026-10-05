import { MandateScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { NativeScreen } from '../../../../native/NativeScreen';

export default function MandateRoute() {
  const { mandateId } = useLocalSearchParams<{ mandateId: string }>();
  return (
    <NativeScreen>
      <MandateScreen mandateId={mandateId} />
    </NativeScreen>
  );
}
