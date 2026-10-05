import { CANARY_WINDOW_START, type CanaryRefs, SNAPSHOT_TAG } from './canary/canary-evidence.js';
import { loadCanarySnapshot } from './canary/canary-snapshot.js';
import {
  flagValue,
  OpsCliError,
  type OpsCommand,
  parseFlags,
  requireHandle,
  requireUuid,
} from './ops-common.js';

/** audit_events.action for this command (R-20: every ops command leaves one row). */
export const OPS_CANARY_SNAPSHOT = 'OPS_CANARY_SNAPSHOT';

const LEG_FLAGS: ReadonlyArray<readonly [string, keyof CanaryRefs]> = [
  ['a-upi', 'aUpi'],
  ['a-netbanking', 'aNetbanking'],
  ['b-sip', 'bSip'],
  ['c-redemption', 'cRedemption'],
];

const ARN_RE = /^ARN-\d+$/;

/**
 * `ops:canary-snapshot --by <handle> --arn <platform ARN> [--a-upi <orderId>] [--a-netbanking <orderId>]
 * [--b-sip <planId>] [--c-redemption <orderId>]` (G-E7, F20). Prints the canary legs' DB side as one
 * tagged, PII-free JSON line for `ops:canary-report`. Read-only apart from its audit row; no FP call.
 * `--arn` is typed from the ARN registration, not read from config, so a mis-stamped ARN shows up.
 */
export const opsCanarySnapshot: OpsCommand = async (ctx, argv) => {
  const flags = parseFlags(argv, { values: ['by', 'arn', ...LEG_FLAGS.map(([flag]) => flag)] });
  const by = requireHandle(flags, 'by');
  const arn = flagValue(flags, 'arn');
  if (!ARN_RE.test(arn)) throw new OpsCliError('--arn must be the platform ARN (ARN-<digits>)');
  const refs: CanaryRefs = {};
  for (const [flag, key] of LEG_FLAGS) {
    if (flags.has(flag)) refs[key] = requireUuid(flags, flag);
  }
  if (Object.keys(refs).length === 0) {
    throw new OpsCliError(
      'name at least one leg: --a-upi, --a-netbanking, --b-sip, --c-redemption',
    );
  }
  let line: string;
  try {
    const snapshot = await loadCanarySnapshot(ctx.db, refs, {
      expectedArn: arn,
      now: ctx.clock.now(),
      windowStart: new Date(CANARY_WINDOW_START),
    });
    line = `${SNAPSHOT_TAG}${JSON.stringify(snapshot)}`;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('canary snapshot:')) {
      throw new OpsCliError(err.message);
    }
    throw err;
  }
  await ctx.audit.record(null, {
    action: OPS_CANARY_SNAPSHOT,
    actorType: 'ADMIN',
    actorId: by,
    entityType: 'canary',
    reason: `G-E7 canary snapshot of ${Object.keys(refs).length} leg(s)`,
  });
  return line;
};
