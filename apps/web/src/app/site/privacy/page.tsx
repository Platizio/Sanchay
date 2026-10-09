import LegalDocumentPage from '../legal/[key]/page';

// Rendered per request (data cached for an hour by legal-api): a build-time fetch would need the API up.
export const dynamic = 'force-dynamic';

/** www.sanchay.in/privacy: the privacy-policy URL given to Google Play (PB-58); same page as /legal/privacy. */
export default async function PrivacyPage() {
  return LegalDocumentPage({ params: Promise.resolve({ key: 'privacy' }) });
}
