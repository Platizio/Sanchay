import type { Metadata } from 'next';
import { ExploreRoute } from '../../../client/routes';

export const metadata: Metadata = { title: 'Explore' };

export default function ExplorePage() {
  return <ExploreRoute />;
}
