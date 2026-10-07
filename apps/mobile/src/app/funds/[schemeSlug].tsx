import { FundScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { NativeScreen } from '../../native/NativeScreen';

export default function FundRoute() {
  const { schemeSlug } = useLocalSearchParams<{ schemeSlug: string }>();
  return (
    <NativeScreen>
      <FundScreen schemeSlug={schemeSlug} />
    </NativeScreen>
  );
}
