import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HoldingDetailRoute } from '../../../../../../client/routes';
import { parseHoldingParams } from '../../../../../../lib/holding-params';

export const metadata: Metadata = { title: 'Holding' };

export default async function HoldingPage({
  params,
}: PageProps<'/portfolio/holdings/[folioId]/[isin]'>) {
  const holding = parseHoldingParams(await params);
  if (!holding) notFound();
  return <HoldingDetailRoute folioId={holding.folioId} isin={holding.isin} />;
}
