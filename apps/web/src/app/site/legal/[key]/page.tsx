import { fetchLegalDocument } from '../../../../lib/legal-api';

export default async function LegalDocumentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const doc = await fetchLegalDocument(key);
  if (!doc) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-muted">This document is not available.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-xl font-bold">{doc.key.replaceAll('_', ' ')}</h1>
      <p className="text-sm text-muted">Version {doc.version}</p>
      {doc.bodyMarkdown.split('\n\n').map((paragraph, i) => (
        <p key={i} className="whitespace-pre-wrap text-muted">
          {paragraph}
        </p>
      ))}
    </main>
  );
}
