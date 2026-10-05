import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RedeemRoute } from '../../../../../client/routes';

export const metadata: Metadata = { title: 'Withdraw' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISIN = /^INF[A-Z0-9]{9}$/;

/** RED-01 → RED-02 → CNF-01 → CNF-02 for one holding (F14's "Redeem" links here). */
export default async function RedeemPage({ params }: PageProps<'/redeem/[folioId]/[isin]'>) {
  const { folioId, isin } = await params;
  if (!UUID.test(folioId) || !ISIN.test(isin)) notFound();
  return <RedeemRoute folioId={folioId} isin={isin} />;
}
