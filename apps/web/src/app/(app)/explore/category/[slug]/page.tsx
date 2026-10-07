import type { Metadata } from 'next';
import { ExploreCategoryRoute } from '../../../../../client/routes';

export const metadata: Metadata = { title: 'Explore' };

export default async function ExploreCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ExploreCategoryRoute slug={slug} />;
}
