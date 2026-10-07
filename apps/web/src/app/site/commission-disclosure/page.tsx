import { fetchCommissionRates } from '../../../lib/legal-api';

// Rendered per request (data cached for an hour by legal-api): a build-time fetch would need the API up.
export const dynamic = 'force-dynamic';

export default async function CommissionDisclosurePage() {
  const rates = await fetchCommissionRates();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-xl font-bold">Commission disclosure</h1>
      <p className="text-muted">
        Sanchay is a mutual fund distributor and earns a commission (trail) from the AMC for every
        Regular-plan scheme it distributes. The table below lists the trail range or exact rate per
        scheme or AMC, as disclosed to us.
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            <th className="py-2">Scope</th>
            <th className="py-2">Rate</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((rate, i) => (
            <tr key={i} className="border-border border-b">
              <td className="py-2">{rate.schemeId ?? rate.amcId ?? '—'}</td>
              <td className="py-2">
                {rate.kind === 'EXACT'
                  ? `${rate.minBps / 100}% p.a.`
                  : `${rate.minBps / 100}–${rate.maxBps / 100}% p.a.`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rates.length === 0 ? (
        <p className="text-muted">No commission disclosures are published yet.</p>
      ) : null}
    </main>
  );
}
