import { defineEnum, type EnumValue } from '../define-enum.js';
import type { Transition } from './index.js';

/**
 * MANDATE states, spelled exactly as spec §4.3's bullet list. CANCEL_SUBMITTING is reserved (P2): it
 * is a valid member of the union (so a future migration can widen the DB CHECK additively) but has no
 * transitions in or out in the MVP, pinned by this file's own test.
 */
export const MANDATE_STATUSES = defineEnum([
  'CONSENT_PENDING',
  'CONSENTED',
  'SUBMITTING',
  'CREATED',
  'AUTH_PENDING',
  'BANK_PENDING',
  'APPROVED',
  'RECONCILING',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'CONSENT_EXPIRED',
  'CANCEL_SUBMITTING',
]);
export type MandateStatus = EnumValue<typeof MANDATE_STATUSES>;

export const MANDATE_TERMINAL: readonly MandateStatus[] = [
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'CONSENT_EXPIRED',
];

const MANDATE_RECONCILING_EXITS: readonly MandateStatus[] = [
  'CREATED',
  'AUTH_PENDING',
  'BANK_PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

export const MANDATE_TRANSITIONS: readonly Transition<MandateStatus>[] = [
  { from: 'CONSENT_PENDING', to: 'CONSENTED', trigger: 'approve' },
  { from: 'CONSENTED', to: 'SUBMITTING', trigger: 'job_submit' },
  { from: 'CONSENTED', to: 'CONSENT_EXPIRED', trigger: 'execute_before_missed' },
  { from: 'SUBMITTING', to: 'CREATED', trigger: 'fp_mandate_created' },
  { from: 'SUBMITTING', to: 'REJECTED', trigger: 'live_check_failed' },
  { from: 'SUBMITTING', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'CREATED', to: 'AUTH_PENDING', trigger: 'emandate_auth_created' },
  { from: 'CREATED', to: 'RECONCILING', trigger: 'ambiguous' },
  { from: 'AUTH_PENDING', to: 'BANK_PENDING', trigger: 'fp_submitted' },
  { from: 'AUTH_PENDING', to: 'EXPIRED', trigger: 'seven_day_no_approval' },
  { from: 'BANK_PENDING', to: 'APPROVED', trigger: 'fp_approved' },
  { from: 'BANK_PENDING', to: 'REJECTED', trigger: 'fp_rejected' },
  { from: 'BANK_PENDING', to: 'EXPIRED', trigger: 'seven_day_no_approval' },
  { from: 'APPROVED', to: 'CANCELLED', trigger: 'investor_or_fp_cancel' },
  ...MANDATE_RECONCILING_EXITS.map((to) => ({
    from: 'RECONCILING' as const,
    to,
    trigger: 'lookup_adopt_mapped',
  })),
];
