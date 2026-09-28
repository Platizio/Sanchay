import type { Metadata } from 'next';
import { HomeRoute } from '../../client/routes';

export const metadata: Metadata = { title: 'Home' };

export default function HomePage() {
  return <HomeRoute />;
}
