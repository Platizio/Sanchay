import type { Metadata } from 'next';
import { FundRoute } from '../../../../client/routes';

export const metadata: Metadata = { title: 'Fund details' };

export default async function FundPage({ params }: { params: Promise<{ schemeSlug: string }> }) {
  const { schemeSlug } = await params;
  return <FundRoute schemeSlug={schemeSlug} />;
}
