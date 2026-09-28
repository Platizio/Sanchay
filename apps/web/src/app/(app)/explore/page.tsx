import type { Metadata } from 'next';
import { ComingSoonRoute } from '../../../client/routes';

export const metadata: Metadata = { title: 'Explore' };

export default function ExplorePage() {
  return <ComingSoonRoute title="Explore" />;
}
