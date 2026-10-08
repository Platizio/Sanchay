import { Inject, Injectable } from '@nestjs/common';
import { equalSplit, isValidAllocationSet, MAX_NOMINEES } from '@sanchay/domain';
import { and, eq, max } from 'drizzle-orm';
import { DB, type DbExecutor, type DbHandle, type Tx } from '../../db/client.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId, newId } from '../platform/ids.js';
import type { AuthContext } from '../platform/request-context.js';
import { type NomineeRelationship, nominationDecisions, nominees } from './nomination.schema.js';
import { OnboardingQueries } from './onboarding.queries.js';
import { onboardingApplications } from './onboarding.schema.js';

export interface NomineeInput {
  name: string;
  relationship: NomineeRelationship;
  isMinor: boolean;
  dob?: string | undefined;
  guardianName?: string | undefined;
  idType?: 'PAN' | 'DRIVING_LICENCE' | 'PASSPORT' | undefined;
  idValue?: string | undefined;
  allocationPct?: number | undefined;
}

export interface PutNominationInput {
  decision: 'NOMINATED' | 'OPTED_OUT';
  displayPreference?: boolean | undefined;
  nominees?: NomineeInput[] | undefined;
}

export interface NominationView {
  decision: 'NOT_ASKED' | 'NOMINATED' | 'OPTED_OUT';
  displayPreference: boolean | null;
  setVersion: number | null;
  nominees: Array<{
    position: number;
    name: string;
    relationship: NomineeRelationship;
    isMinor: boolean;
    allocationPct: number;
  }>;
}

@Injectable()
export class NominationService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(Crypto) private readonly crypto: Crypto,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OnboardingQueries) private readonly onboarding: OnboardingQueries,
  ) {}

  async getNomination(auth: AuthContext): Promise<NominationView> {
    return this.read(this.dbh.db, auth.investorId);
  }

  async putNomination(auth: AuthContext, input: PutNominationInput): Promise<NominationView> {
    if (input.decision === 'NOMINATED') {
      const list = input.nominees ?? [];
      if (list.length === 0 || list.length > MAX_NOMINEES) throw new AppError('NOMINATION_INVALID');
      const explicit = list.filter((n) => n.allocationPct !== undefined);
      if (explicit.length !== 0 && explicit.length !== list.length) {
        throw new AppError('NOMINATION_INVALID');
      }
      const allocations =
        explicit.length === list.length
          ? list.map((n) => n.allocationPct as number)
          : equalSplit(list.length as 1 | 2 | 3);
      if (!isValidAllocationSet(allocations)) throw new AppError('NOMINATION_INVALID');
      for (const n of list) {
        if (n.isMinor && (!n.dob || !n.guardianName)) throw new AppError('NOMINATION_INVALID');
        if (n.idType === 'PAN' && n.isMinor) throw new AppError('NOMINATION_INVALID');
        if ((n.idType === undefined) !== (n.idValue === undefined)) {
          throw new AppError('NOMINATION_INVALID');
        }
      }
      return this.dbh.db.transaction((tx) =>
        this.write(tx, auth.investorId, input, allocations, list),
      );
    }
    return this.dbh.db.transaction((tx) => this.write(tx, auth.investorId, input, [], []));
  }

  private async read(dbx: DbExecutor, investorId: string): Promise<NominationView> {
    const [decision] = await dbx
      .select()
      .from(nominationDecisions)
      .where(eq(nominationDecisions.investorId, investorId));
    const rows = await dbx
      .select()
      .from(nominees)
      .where(and(eq(nominees.investorId, investorId), eq(nominees.status, 'CURRENT')));
    return {
      decision: decision?.decision ?? 'NOT_ASKED',
      displayPreference: decision?.displayPreference ?? null,
      setVersion: decision?.effectiveSetVersion ?? null,
      nominees: rows
        .sort((a, b) => a.position - b.position)
        .map((r) => ({
          position: r.position,
          name: this.crypto.decrypt(r.nameEnc, {
            table: 'nominees',
            column: 'name_enc',
            rowId: asRowId('nominees', r.id),
          }),
          relationship: r.relationship,
          isMinor: r.isMinor,
          allocationPct: r.allocationPct,
        })),
    };
  }

  private async write(
    tx: Tx,
    investorId: string,
    input: PutNominationInput,
    allocations: number[],
    list: NomineeInput[],
  ): Promise<NominationView> {
    // Creates the application on first touch, then locks it so two concurrent PUTs for one investor
    // serialise on set_version instead of colliding on the (investor, set_version, position) unique key.
    await this.onboarding.ensureApplication(tx, investorId);
    await tx
      .select({ id: onboardingApplications.id })
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investorId))
      .for('update');

    // The next set version comes from the nominee history, not from nomination_decisions: an OPTED_OUT
    // decision carries no effective version, and a later NOMINATED must still not reuse a replaced set.
    const [latest] = await tx
      .select({ v: max(nominees.setVersion) })
      .from(nominees)
      .where(eq(nominees.investorId, investorId));
    const nextVersion = (latest?.v ?? 0) + 1;

    await tx
      .update(nominees)
      .set({ status: 'REPLACED', updatedBy: investorId })
      .where(and(eq(nominees.investorId, investorId), eq(nominees.status, 'CURRENT')));

    if (input.decision === 'NOMINATED') {
      for (const [index, n] of list.entries()) {
        const id = newId('nominees');
        await tx.insert(nominees).values({
          id,
          createdBy: investorId,
          updatedBy: investorId,
          investorId,
          setVersion: nextVersion,
          position: index + 1,
          nameEnc: this.crypto.encrypt(n.name, {
            table: 'nominees',
            column: 'name_enc',
            rowId: id,
          }),
          nameLength: n.name.length,
          relationship: n.relationship,
          isMinor: n.isMinor,
          dobEnc: n.dob
            ? this.crypto.encrypt(n.dob, { table: 'nominees', column: 'dob_enc', rowId: id })
            : null,
          guardianNameEnc: n.guardianName
            ? this.crypto.encrypt(n.guardianName, {
                table: 'nominees',
                column: 'guardian_name_enc',
                rowId: id,
              })
            : null,
          idType: n.idType ?? null,
          idValueEnc: n.idValue
            ? this.crypto.encrypt(n.idValue, {
                table: 'nominees',
                column: 'id_value_enc',
                rowId: id,
              })
            : null,
          allocationPct: allocations[index] as number,
        });
      }
    }

    const nominated = input.decision === 'NOMINATED';
    const decidedAt = this.clock.now();
    await tx
      .insert(nominationDecisions)
      .values({
        investorId,
        createdBy: investorId,
        updatedBy: investorId,
        decision: input.decision,
        effectiveSetVersion: nominated ? nextVersion : null,
        displayPreference: nominated ? (input.displayPreference ?? false) : null,
        decidedAt,
      })
      .onConflictDoUpdate({
        target: nominationDecisions.investorId,
        set: {
          decision: input.decision,
          effectiveSetVersion: nominated ? nextVersion : null,
          displayPreference: nominated ? (input.displayPreference ?? false) : null,
          decidedAt,
          updatedBy: investorId,
        },
      });

    await tx
      .update(onboardingApplications)
      .set({ nominationStatus: 'DONE', updatedBy: investorId })
      .where(eq(onboardingApplications.investorId, investorId));

    await this.audit.record(tx, {
      action: AUDIT_ACTIONS.ONBOARDING_NOMINATION_SET,
      actorType: 'INVESTOR',
      actorId: investorId,
      entityType: 'investor',
      entityId: investorId,
      data: { status: input.decision },
    });

    return this.read(tx, investorId);
  }
}
