import type { Metadata } from 'next';
import { ExploreSearchRoute } from '../../../../client/routes';

export const metadata: Metadata = { title: 'Search' };

export default function ExploreSearchPage() {
  return <ExploreSearchRoute />;
}
