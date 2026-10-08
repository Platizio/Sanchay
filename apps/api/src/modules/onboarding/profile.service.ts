import { Inject, Injectable } from '@nestjs/common';
import type {
  AddressNature,
  Gender,
  IncomeSlab,
  Occupation,
  PepStatus,
  SourceOfWealth,
  TaxStatus,
} from '@sanchay/domain';
import { deriveOnboardingStage } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { Crypto } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import { asRowId } from '../platform/ids.js';
import { isFpCountrySupported } from './fp-profile-mapping.js';
import { assertOnboardingWritable } from './identity.service.js';
import { investorProfiles, onboardingApplications } from './onboarding.schema.js';

export interface PutProfileInput {
  gender: Gender;
  occupation: Occupation;
  incomeSlab: IncomeSlab;
  sourceOfWealth: SourceOfWealth;
  pepStatus: PepStatus;
  taxStatus: TaxStatus;
  nationality: string;
  countryOfBirth: string;
  placeOfBirth: string;
  taxResidentElsewhere: boolean;
  usPerson: boolean;
  addressLine1: string;
  addressLine2?: string | undefined;
  city: string;
  state: string;
  pincode: string;
  addressNature: AddressNature;
}

@Injectable()
export class ProfileService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(Crypto) private readonly crypto: Crypto,
  ) {}

  async putProfile(investorId: string, input: PutProfileInput) {
    // Any FATCA "yes" is refused before any write (pilot: resident individuals only, assumption A1).
    if (input.taxResidentElsewhere || input.usPerson) {
      throw new AppError('ELIGIBILITY_BLOCKED', {
        message: 'A foreign tax residency or US person status cannot be onboarded in the pilot',
      });
    }
    // The pilot is for Indian-born residents: FP's country mapping (fpCountry) throws for anything else, which
    // would otherwise only surface as PROFILE_NOT_SUPPORTED after the investor has attested.
    if (!isFpCountrySupported(input.countryOfBirth)) {
      throw new AppError('VALIDATION_FAILED', {
        fields: [
          {
            path: 'countryOfBirth',
            code: 'COUNTRY_NOT_SUPPORTED',
            message: 'Only Indian-born residents can be onboarded for now',
          },
        ],
      });
    }
    return this.dbh.db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(investorProfiles)
        .where(eq(investorProfiles.investorId, investorId))
        .limit(1);
      if (!profile)
        throw new AppError('ONBOARDING_INCOMPLETE', { message: 'Submit identity first' });
      const [app] = await tx
        .select()
        .from(onboardingApplications)
        .where(eq(onboardingApplications.investorId, investorId))
        .limit(1)
        .for('update');
      if (!app) throw new AppError('ONBOARDING_INCOMPLETE', { message: 'Submit identity first' });
      await assertOnboardingWritable(tx, this.clock.now(), app, 'profile');
      // A PEP / related-PEP block is cleared by compliance only; the investor path cannot overwrite the
      // declaration or its recorded reason.
      if (app.profileStatus === 'BLOCKED') {
        throw new AppError('ELIGIBILITY_BLOCKED', {
          message: 'This declaration is with our compliance team',
        });
      }

      const rowId = asRowId('investor_profiles', profile.id);
      const aad = (column: string) => ({ table: 'investor_profiles' as const, column, rowId });
      const pepBlocked = input.pepStatus === 'PEP' || input.pepStatus === 'RELATED_PEP';
      await tx
        .update(investorProfiles)
        .set({
          updatedBy: investorId,
          gender: input.gender,
          occupation: input.occupation,
          incomeSlab: input.incomeSlab,
          sourceOfWealth: input.sourceOfWealth,
          pepStatus: input.pepStatus,
          // never nulled from the investor path: a block is only reachable through the BLOCKED guard above
          ...(pepBlocked ? { pepBlockedReason: `Declared ${input.pepStatus} at onboarding` } : {}),
          taxStatus: input.taxStatus,
          nationality: input.nationality,
          countryOfBirth: input.countryOfBirth,
          placeOfBirthEnc: this.crypto.encrypt(input.placeOfBirth, aad('place_of_birth_enc')),
          taxResidentElsewhere: false,
          usPerson: false,
          addressLine1Enc: this.crypto.encrypt(input.addressLine1, aad('address_line1_enc')),
          addressLine2Enc: input.addressLine2
            ? this.crypto.encrypt(input.addressLine2, aad('address_line2_enc'))
            : null,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
          addressNature: input.addressNature,
        })
        .where(eq(investorProfiles.id, profile.id));

      const profileStatus = pepBlocked ? 'BLOCKED' : 'DONE';
      const stage = deriveOnboardingStage({ ...app, profileStatus });
      await tx
        .update(onboardingApplications)
        .set({ profileStatus, stage })
        .where(eq(onboardingApplications.id, app.id));
      return { stage };
    });
  }
}
