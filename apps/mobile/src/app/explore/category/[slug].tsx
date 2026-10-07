import { ExploreScreen } from '@sanchay/features';
import { useLocalSearchParams } from 'expo-router';
import { NativeScreen } from '../../../native/NativeScreen';

export default function ExploreCategoryRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <NativeScreen>
      <ExploreScreen category={slug} />
    </NativeScreen>
  );
}
