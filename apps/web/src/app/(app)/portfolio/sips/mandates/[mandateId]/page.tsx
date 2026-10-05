import type { Metadata } from 'next';
import { MandateRoute } from '../../../../../../client/routes';

export const metadata: Metadata = { title: 'Mandate' };

export default async function MandatePage({
  params,
}: PageProps<'/portfolio/sips/mandates/[mandateId]'>) {
  const { mandateId } = await params;
  return <MandateRoute mandateId={mandateId} />;
}
