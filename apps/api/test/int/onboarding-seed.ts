import { randomUUID } from 'node:crypto';
import { LEGAL_DOCUMENT_KEYS } from '@sanchay/domain';
import {
  DECLARATION_KEYS,
  declarationStagings,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import { LegalDocs } from '../../src/modules/legal-consent/legal-docs.service.js';
import { bankAccounts } from '../../src/modules/onboarding/bank.schema.js';
import { nominationDecisions, nominees } from '../../src/modules/onboarding/nomination.schema.js';
import {
  investorProfiles,
  onboardingApplications,
} from '../../src/modules/onboarding/onboarding.schema.js';
import {
  riskProfiles,
  riskQuestionnaires,
} from '../../src/modules/onboarding/risk-profile.schema.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { asRowId, newId } from '../../src/modules/platform/ids.js';
import type { TestApp } from './app.js';
import { signInWeb, type WebSignIn } from './flows.js';
import { webHeaders } from './http.js';

export interface ReadyInvestor extends WebSignIn {
  mobile: string;
  email: string;
  pan: string;
  applicationId: string;
  bankId: string;
}

export interface SeedOptions {
  pan?: string;
  nominated?: boolean;
  bankVerified?: boolean;
}

const MONTH = 30 * 24 * 60 * 60 * 1000;

function randomMobile(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
}

function randomPan(): string {
  const letters = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${letters()}${letters()}${letters()}P${letters()}${String(Math.floor(Math.random() * 1e4)).padStart(4, '0')}${letters()}`;
}

/** Every legal document key PUBLISHED at version '1' (idempotent per test database). */
export async function seedLegalDocuments(app: TestApp): Promise<void> {
  const existing = new Set(
    (await app.db.db.select({ key: legalDocuments.key }).from(legalDocuments)).map((r) => r.key),
  );
  for (const key of LEGAL_DOCUMENT_KEYS) {
    if (existing.has(key)) continue;
    await app.db.db.insert(legalDocuments).values({
      id: newId('legal_documents'),
      createdBy: 'test',
      updatedBy: 'test',
      key,
      version: '1',
      bodyMarkdown: `# ${key}`,
      sha256: Buffer.alloc(32, 7),
      status: 'PUBLISHED',
      effectiveFrom: app.clock.now(),
    });
  }
}

/** Adds and verifies an email through Plan 01's real me.requestEmailOtp / me.verifyEmail. */
async function verifyEmail(app: TestApp, signIn: WebSignIn, email: string): Promise<void> {
  const headers = () => ({
    ...webHeaders({ cookies: signIn.cookies }),
    'idempotency-key': randomUUID(),
  });
  const sent = await app.app.inject({
    method: 'POST',
    url: '/api/v1/me/email/otp',
    headers: headers(),
    payload: { email },
  });
  if (sent.statusCode !== 200) throw new Error(`requestEmailOtp: ${sent.statusCode} ${sent.body}`);
  const challengeId = sent.json<{ challengeId: string }>().challengeId;
  const verified = await app.app.inject({
    method: 'POST',
    url: '/api/v1/me/email/verify',
    headers: headers(),
    payload: { challengeId, code: app.email.latestCode(email) },
  });
  if (verified.statusCode !== 200) {
    throw new Error(`verifyEmail: ${verified.statusCode} ${verified.body}`);
  }
}

export async function seedRiskProfile(
  app: TestApp,
  investorId: string,
  status: 'ACTIVE' | 'EXPIRED' = 'ACTIVE',
): Promise<void> {
  const questionnaireId = newId('risk_questionnaires');
  await app.db.db.insert(riskQuestionnaires).values({
    id: questionnaireId,
    version: `seed-${questionnaireId}`,
    status: 'PUBLISHED',
    questionsAndScoring: {},
    sha256: Buffer.alloc(32, 1),
  });
  await app.db.db.insert(riskProfiles).values({
    investorId,
    questionnaireId,
    answers: {},
    rawScore: 20,
    caps: [],
    level: 'MODERATE',
    maxRiskometer: 'MODERATELY_HIGH',
    status,
    completedAt: app.clock.now(),
    expiresAt: new Date(app.clock.now().getTime() + 24 * MONTH),
    source: 'ONBOARDING',
  });
}

/**
 * An investor who has finished E6-E10 (verified KYC, profile, verified bank, nomination decision, risk
 * profile, KYC_CONSENT accepted, staged declarations, verified email) and has not attested yet. Rows are
 * inserted directly; the E6-E10 flows have their own tests.
 */
export async function seedReadyInvestor(
  app: TestApp,
  options: SeedOptions = {},
): Promise<ReadyInvestor> {
  await seedLegalDocuments(app);
  const mobile = randomMobile();
  const signIn = await signInWeb(app, mobile);
  // The tail of a UUIDv7 is random; its head is a millisecond timestamp, so investors made in one minute share it.
  const email = `investor.${signIn.investorId.slice(-12)}@example.com`;
  await verifyEmail(app, signIn, email);

  const crypto = app.app.get(Crypto);
  const { investorId } = signIn;
  const pan = options.pan ?? randomPan();
  const nominated = options.nominated ?? true;
  const now = app.clock.now();
  const actor = { createdBy: investorId, updatedBy: investorId };

  const profileId = newId('investor_profiles');
  const profileAad = (column: string) => ({
    table: 'investor_profiles' as const,
    column,
    rowId: asRowId('investor_profiles', profileId),
  });
  await app.db.db.insert(investorProfiles).values({
    id: profileId,
    investorId,
    ...actor,
    panEnc: crypto.encrypt(pan, profileAad('pan_enc')),
    panBidx: crypto.blindIndex('pan', pan),
    panLast4: pan.slice(-4),
    nameAsPerPan: 'Asha Rao',
    dobEnc: crypto.encrypt('1990-05-14', profileAad('dob_enc')),
    gender: 'FEMALE',
    occupation: 'SERVICE_PRIVATE_SECTOR',
    incomeSlab: '5L_TO_10L',
    sourceOfWealth: 'SALARY',
    pepStatus: 'NOT_APPLICABLE',
    taxStatus: 'RESIDENT_INDIVIDUAL',
    nationality: 'Indian',
    countryOfBirth: 'India',
    placeOfBirthEnc: crypto.encrypt('Mumbai', profileAad('place_of_birth_enc')),
    taxResidentElsewhere: false,
    usPerson: false,
    addressLine1Enc: crypto.encrypt('12 MG Road', profileAad('address_line1_enc')),
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    addressNature: 'RESIDENTIAL',
    kycStatus: 'VALIDATED',
  });

  const bankId = newId('bank_accounts');
  const accountNumber = `1234567${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  const bankAad = (column: string) => ({
    table: 'bank_accounts' as const,
    column,
    rowId: asRowId('bank_accounts', bankId),
  });
  await app.db.db.insert(bankAccounts).values({
    id: bankId,
    investorId,
    ...actor,
    accountNumberEnc: crypto.encrypt(accountNumber, bankAad('account_number_enc')),
    accountNumberBidx: crypto.blindIndex('account_number', accountNumber),
    accountLast4: accountNumber.slice(-4),
    ifsc: 'HDFC0000123',
    holderNameEnc: crypto.encrypt('Asha Rao', bankAad('holder_name_enc')),
    status: options.bankVerified === false ? 'PENDING' : 'VERIFIED',
    isPrimary: true,
  });

  if (nominated) {
    const nomineeId = newId('nominees');
    await app.db.db.insert(nominees).values({
      id: nomineeId,
      investorId,
      ...actor,
      setVersion: 1,
      position: 1,
      nameEnc: crypto.encrypt('Ravi Rao', {
        table: 'nominees',
        column: 'name_enc',
        rowId: asRowId('nominees', nomineeId),
      }),
      nameLength: 8,
      relationship: 'SPOUSE',
      isMinor: false,
      allocationPct: 100,
    });
  }
  await app.db.db.insert(nominationDecisions).values({
    investorId,
    ...actor,
    decision: nominated ? 'NOMINATED' : 'OPTED_OUT',
    effectiveSetVersion: nominated ? 1 : null,
    displayPreference: nominated ? true : null,
    decidedAt: now,
  });

  await seedRiskProfile(app, investorId);

  // E6 records KYC_CONSENT at ONB-02 with a no-OTP DOCUMENT_ACCEPTANCE row.
  await app.app.get(LegalDocs).recordAcceptance(app.db.db, {
    investorId,
    key: 'KYC_CONSENT',
    channel: 'WEB',
    ip: null,
    userAgent: null,
    sessionId: null,
  });
  // Annexure B is staged only for an OPTED_OUT decision (E10).
  const staged = DECLARATION_KEYS.filter(
    (key) => key !== 'NOMINATION_OPT_OUT_ANNEX_B' || !nominated,
  );
  for (const documentKey of staged) {
    await app.db.db
      .insert(declarationStagings)
      .values({ investorId, documentKey, documentVersion: '1', acceptedAt: now });
  }

  const applicationId = newId('onboarding_applications');
  await app.db.db.insert(onboardingApplications).values({
    id: applicationId,
    investorId,
    ...actor,
    stage: 'ATTEST',
    identityStatus: 'DONE',
    profileStatus: 'DONE',
    bankStatus: options.bankVerified === false ? 'IN_PROGRESS' : 'DONE',
    nominationStatus: 'DONE',
    riskStatus: 'DONE',
    declarationsStatus: 'DONE',
    kycPath: 'EXISTING_VALID',
  });

  return { ...signIn, mobile, email, pan, applicationId, bankId };
}
