import { type ApiClient, toApiError } from '@sanchay/api-client';
import { messageForError } from '@sanchay/app-core';
import { formatIsoDate } from '@sanchay/money';
import { AppText, Banner, Button, Card, ListRow, Screen } from '@sanchay/ui';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/ApiContext';
import { useSignOut, useSignOutEverywhere } from '../auth/useSignOut';

export type MeViewWire = Awaited<ReturnType<ApiClient['me']['get']>>;

const LEGAL_TITLES: Record<string, string> = {
  TNC: 'Terms and conditions',
  PRIVACY_NOTICE: 'Privacy notice',
  RISK_DISCLOSURE: 'Risk disclosure',
  REGULAR_PLAN_COMMISSION: 'Regular plan commission disclosure',
  EXECUTION_ONLY_DECLARATION: 'Execution-only declaration',
  FATCA_CRS_DECLARATION: 'FATCA and CRS declaration',
  NOMINATION_OPT_OUT_ANNEX_B: 'Nomination opt-out (Annexure B)',
  KYC_CONSENT: 'KYC consent',
};

const RISK_LABELS: Record<string, string> = {
  CONSERVATIVE: 'Conservative',
  MOD_CONSERVATIVE: 'Moderately conservative',
  MODERATE: 'Moderate',
  MOD_AGGRESSIVE: 'Moderately aggressive',
  AGGRESSIVE: 'Aggressive',
};

const BANK_STATUS: Record<string, string> = {
  PENDING: 'Verification pending',
  VERIFIED: 'Verified',
  FAILED: 'Verification failed',
};

function titleCase(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase().replaceAll('_', ' ');
}

/**
 * PRF-01 read-only (R-18): profile, bank, nominees, risk profile, accepted legal versions and the
 * support and grievance contacts, all from me.get. Only masked values reach the client: PAN and the
 * account number are masked server-side and nominee names are not sent at all. Changes stay
 * ops-assisted (H-9). C9's Log out and Sign out everywhere are kept unchanged.
 */
export function AccountScreenV2() {
  const { utils } = useApi();
  const me = useQuery(utils.me.get.queryOptions());
  const signOut = useSignOut();
  const everywhere = useSignOutEverywhere();

  if (me.isPending) {
    return (
      <Screen testID="account-loading">
        <AppText tone="muted">Loading your account…</AppText>
      </Screen>
    );
  }

  if (me.isError) {
    return (
      <Screen testID="account-error">
        <Banner tone="error" message={messageForError(toApiError(me.error).code)} />
        <Button
          label="Try again"
          onPress={() => {
            void me.refetch();
          }}
        />
        <Button
          variant="secondary"
          label="Log out"
          loading={signOut.pending}
          onPress={() => {
            void signOut.run();
          }}
        />
      </Screen>
    );
  }

  const m = me.data;
  return (
    <Screen testID="account-screen">
      <AppText variant="title">Account</AppText>
      {everywhere.error ? <Banner tone="error" message={everywhere.error} /> : null}

      <Card testID="account-profile">
        <AppText variant="heading">{m.profile?.nameAsPerPan ?? 'Your details'}</AppText>
        {m.profile ? <ListRow label="PAN" value={m.profile.panMasked} /> : null}
        <ListRow label="Mobile" value={m.mobileMasked} />
        <ListRow label="Email" value={m.emailMasked ?? 'Not added yet'} />
      </Card>

      <Card testID="account-bank">
        <AppText variant="heading">Bank account</AppText>
        {m.bank ? (
          <>
            <ListRow
              label={m.bank.bankName ?? 'Bank account'}
              value={`A/c ••${m.bank.accountLast4}`}
            />
            <ListRow label="IFSC" value={m.bank.ifsc} />
            <ListRow label="Status" value={BANK_STATUS[m.bank.status] ?? m.bank.status} />
          </>
        ) : (
          <AppText tone="muted">No bank account added yet.</AppText>
        )}
      </Card>

      <Card testID="account-nominees">
        <AppText variant="heading">Nominees</AppText>
        {m.nomination?.decision === 'OPTED_OUT' ? (
          <AppText tone="muted">You chose not to add a nominee.</AppText>
        ) : m.nomination && m.nomination.nominees.length > 0 ? (
          m.nomination.nominees.map((n) => (
            <ListRow
              key={n.position}
              label={`Nominee ${n.position} · ${titleCase(n.relationship)}${n.isMinor ? ' (minor)' : ''}`}
              value={`${n.allocationPct}%`}
            />
          ))
        ) : (
          <AppText tone="muted">No nominee added yet.</AppText>
        )}
      </Card>

      <Card testID="account-risk">
        <AppText variant="heading">Risk profile</AppText>
        {m.riskProfile ? (
          <>
            <ListRow
              label="Profile"
              value={RISK_LABELS[m.riskProfile.level] ?? m.riskProfile.level}
            />
            <ListRow
              label={m.riskProfile.status === 'ACTIVE' ? 'Valid till' : 'Expired on'}
              value={formatIsoDate(m.riskProfile.validUntil)}
            />
          </>
        ) : (
          <AppText tone="muted">Not assessed yet.</AppText>
        )}
      </Card>

      <Card testID="account-legal">
        <AppText variant="heading">Documents you accepted</AppText>
        {m.legalVersionsAccepted.length === 0 ? (
          <AppText tone="muted">None yet.</AppText>
        ) : (
          m.legalVersionsAccepted.map((doc) => (
            <ListRow
              key={doc.key}
              label={LEGAL_TITLES[doc.key] ?? titleCase(doc.key)}
              value={`Version ${doc.version}`}
            />
          ))
        )}
      </Card>

      <Card testID="account-help">
        <AppText variant="heading">Help and grievances</AppText>
        <ListRow label="Support" value={m.support.email} />
        {m.support.phone ? <ListRow label="Phone" value={m.support.phone} /> : null}
        <ListRow label="Grievance officer" value={m.support.grievanceEmail} />
        <AppText variant="caption" tone="muted">
          To change any of these details, write to support. We will verify the request before
          updating it.
        </AppText>
      </Card>

      <Card>
        <AppText variant="heading">Security</AppText>
        <AppText tone="muted">
          Sign out everywhere logs you out on every device, including this one.
        </AppText>
        <Button
          variant="secondary"
          label="Log out"
          loading={signOut.pending}
          onPress={() => {
            void signOut.run();
          }}
        />
        <Button
          variant="secondary"
          label="Sign out everywhere"
          loading={everywhere.pending}
          onPress={() => {
            void everywhere.run();
          }}
        />
      </Card>
    </Screen>
  );
}
