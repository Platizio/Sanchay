export default function AccountDeletePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-xl font-bold">Delete your account</h1>
      <p className="text-muted">
        To request deletion of your Sanchay account and personal data, write to us from your
        registered email or mobile number at{' '}
        <a className="text-primary underline" href="mailto:grievance@sanchay.in">
          grievance@sanchay.in
        </a>
        . Your mutual fund folios and transaction records are retained for the period required by
        SEBI/AMFI record-keeping rules even after account deletion; we will confirm what is deleted
        immediately and what is retained, and for how long, in our reply.
      </p>
    </main>
  );
}
