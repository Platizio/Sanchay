import {
  type ConsentSnapshotV2,
  type LegalDocumentKey,
  requiredFactorsFor,
  SNAPSHOT_VERSION,
} from '@sanchay/domain';
import { formatInr, Money } from '@sanchay/money';
import { and, eq } from 'drizzle-orm';
import { resolveCommissionLine } from '../catalogue/catalogue.queries.js';
import { amcs, fundFacts, schemes, sebiCategories } from '../catalogue/catalogue.schema.js';
import { istToday } from '../catalogue/nav/nav.service.js';
import { legalDocuments } from '../legal-consent/legal-consent.schema.js';
import { resolveLegalDocument } from '../legal-consent/legal-docs.service.js';
import type { ConsentTextRenderer, SnapshotBuilder } from '../legal-consent/snapshot-builders.js';
import { bankAccounts } from '../onboarding/bank.schema.js';
import { nominationDecisions } from '../onboarding/nomination.schema.js';
import {
  riskProfiles,
  riskQuestionnaires,
  suitabilityAcknowledgements,
  suitabilityChecks,
} from '../onboarding/risk-profile.schema.js';
import { AppError } from '../platform/errors.js';
import { orders } from './orders.schema.js';
import { purchaseClock } from './purchase-eligibility.js';

/**
 * DSC-23 (D-MONEY-091): the checkbox label CNF-03 shows under the suitability warning, and the clause CNF-01
 * carries on a MISMATCH (D-MONEY-094). E23's CNF-03 uses the same words.
 */
export const SUITABILITY_ACK_CLAUSE =
  "I want to proceed with this investment notwithstanding Sanchay's written warning that this scheme's risk is above my risk profile";

/**
 * The suitability warning text: the SUITABILITY_WARNING document's body, a blank line, then the facts that make
 * this order a MISMATCH. E22 returns it as the quote's `suitability.warning.text`; CNF-03 shows it above the
 * checkbox labelled SUITABILITY_ACK_CLAUSE, which is not part of it, so CNF-03 never shows the clause twice.
 */
export function renderSuitabilityWarning(
  bodyMarkdown: string,
  f: { schemeName: string; schemeRiskometer: string; level: string; maxRiskometer: string },
): string {
  return `${bodyMarkdown}\n\n${f.schemeName}: riskometer ${f.schemeRiskometer}. Your risk profile: ${f.level}, up to ${f.maxRiskometer}.`;
}

/** The documents every PURCHASE consent binds; SUITABILITY_WARNING joins them on a MISMATCH. */
const PURCHASE_DOCUMENTS: readonly LegalDocumentKey[] = [
  'TPL_PURCHASE',
  'EXECUTION_ONLY_DECLARATION',
  'REGULAR_PLAN_COMMISSION',
];

const internal = (message: string) => new AppError('INTERNAL', { message });

/**
 * SNAPSHOT_BUILDERS.PURCHASE (H2, spec §4.1): every fact the investor consents to, read from the DB, so approve's
 * recompute compares the consent with the order as it is now (a changed amount, bank, scheme fact, commission
 * line, suitability evaluation or document version is CONSENT_MISMATCH). `ctx.fields` is spread first and the
 * live values written over it (snapshot-builders.ts). The suitability facts come from the check the draft wrote
 * (`orders.suitability_check_id`), never the latest row: approve's re-check inserts a newer one. The expected NAV
 * date is never bound: spec §4.1 approve step 5 re-renders it. Documents resolve by the one rule (LC-3); a
 * missing one is INTERNAL (fail closed).
 */
export const buildPurchaseSnapshot: SnapshotBuilder = async (exec, ctx) => {
  const subject = ctx.subjects[0];
  if (subject === undefined || subject.table !== 'orders' || ctx.subjects.length !== 1) {
    throw internal('a PURCHASE consent names exactly one orders row');
  }
  const [order] = await exec.select().from(orders).where(eq(orders.id, subject.id));
  if (order === undefined || order.investorId !== ctx.investorId || order.amount === null) {
    throw internal(`PURCHASE snapshot: no order ${subject.id} for this investor`);
  }
  const [scheme] = await exec
    .select({
      id: schemes.id,
      amcId: schemes.amcId,
      isin: schemes.isin,
      name: schemes.name,
      planType: schemes.planType,
      option: schemes.option,
      categoryCode: schemes.categoryCode,
      amcName: amcs.name,
      cutoffClass: sebiCategories.cutoffClass,
    })
    .from(schemes)
    .innerJoin(amcs, eq(amcs.id, schemes.amcId))
    .innerJoin(sebiCategories, eq(sebiCategories.code, schemes.categoryCode))
    .where(eq(schemes.id, order.schemeId));
  if (scheme === undefined) throw internal(`PURCHASE snapshot: no scheme ${order.schemeId}`);
  const [facts] = await exec
    .select({ riskometer: fundFacts.riskometer })
    .from(fundFacts)
    .where(eq(fundFacts.schemeId, scheme.id));
  const [bank] = await exec
    .select({ ifsc: bankAccounts.ifsc, last4: bankAccounts.accountLast4 })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, order.bankAccountId));
  const now = purchaseClock.now();
  const commission = await resolveCommissionLine(exec, scheme.id, scheme.amcId, istToday(now));

  const [check] =
    order.suitabilityCheckId === null
      ? []
      : await exec
          .select({
            riskProfileId: suitabilityChecks.riskProfileId,
            level: suitabilityChecks.level,
            schemeRiskometer: suitabilityChecks.schemeRiskometer,
            outcome: suitabilityChecks.outcome,
            maxRiskometer: riskProfiles.maxRiskometer,
            questionnaireSha256: riskQuestionnaires.sha256,
          })
          .from(suitabilityChecks)
          .innerJoin(riskProfiles, eq(riskProfiles.id, suitabilityChecks.riskProfileId))
          .innerJoin(riskQuestionnaires, eq(riskQuestionnaires.id, riskProfiles.questionnaireId))
          .where(eq(suitabilityChecks.id, order.suitabilityCheckId));
  const [ack] =
    order.suitabilityAckId === null
      ? []
      : await exec
          .select({ renderedTextSha256: suitabilityAcknowledgements.renderedTextSha256 })
          .from(suitabilityAcknowledgements)
          .where(eq(suitabilityAcknowledgements.id, order.suitabilityAckId));
  const [decision] = await exec
    .select()
    .from(nominationDecisions)
    .where(eq(nominationDecisions.investorId, ctx.investorId));

  const keys: LegalDocumentKey[] = [
    ...PURCHASE_DOCUMENTS,
    ...(check?.outcome === 'MISMATCH' ? (['SUITABILITY_WARNING'] as const) : []),
  ];
  const legalDocumentsInSnapshot: ConsentSnapshotV2['legalDocuments'] = [];
  for (const key of keys) {
    const doc = await resolveLegalDocument(exec, key, now);
    if (doc === undefined) throw internal(`no PUBLISHED legal_documents row for ${key}`);
    legalDocumentsInSnapshot.push({
      key,
      version: doc.version,
      sha256: doc.sha256.toString('hex'),
    });
  }

  return {
    version: SNAPSHOT_VERSION,
    subjectType: 'PURCHASE',
    investorId: ctx.investorId,
    subjects: ctx.subjects.map((s) => ({ table: s.table, subjectId: s.id })),
    legalDocuments: legalDocumentsInSnapshot,
    moneyParamsVersion: ctx.moneyParamsVersion,
    destinationsMasked: ctx.destinationsMasked,
    fields: {
      ...ctx.fields,
      amount: order.amount,
      paymentMethod: order.paymentMethod ?? '',
      folio: order.folioId === null ? 'NEW' : order.folioId,
      schemeIsin: scheme.isin,
      schemeName: scheme.name,
      amcName: scheme.amcName,
      categoryCode: scheme.categoryCode,
      planType: scheme.planType,
      option: scheme.option,
      riskometer: facts?.riskometer ?? '',
      bankIfsc: bank?.ifsc ?? '',
      bankLast4: bank?.last4 ?? '',
      cutoffClass: scheme.cutoffClass,
      arn: order.arn,
      euin: '',
      executionOnly: String(order.executionOnly),
      commissionKind: commission?.kind ?? '',
      commissionMinBps: commission === null ? '' : String(commission.trailMinBps),
      commissionMaxBps: commission === null ? '' : String(commission.trailMaxBps),
      suitabilityRiskProfileId: check?.riskProfileId ?? '',
      suitabilityLevel: check?.level ?? '',
      suitabilityMaxRiskometer: check?.maxRiskometer ?? '',
      suitabilityQuestionnaireSha256: check?.questionnaireSha256.toString('hex') ?? '',
      suitabilitySchemeRiskometer: check?.schemeRiskometer ?? '',
      suitabilityOutcome: check?.outcome ?? '',
      suitabilityAckSha256: ack?.renderedTextSha256.toString('hex') ?? '',
      nominationDecision: decision?.decision ?? 'NONE',
      nominationSetVersion: String(decision?.effectiveSetVersion ?? ''),
      requiredFactors: requiredFactorsFor('PURCHASE', order.amount).join(','),
    },
  };
};

const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  NETBANKING: 'Net banking',
  UPI_INTENT: 'UPI app',
  UPI_QR: 'UPI QR code',
};

function commissionText(f: Record<string, string>): string {
  if (f.commissionKind === 'EXACT') {
    return `${f.commissionMinBps} basis points a year (trail commission paid by the fund house)`;
  }
  if (f.commissionKind === 'RANGE') {
    return `${f.commissionMinBps} to ${f.commissionMaxBps} basis points a year (trail commission paid by the fund house)`;
  }
  return 'see the regular plan commission disclosure';
}

/**
 * CONSENT_TEXT_RENDERERS.PURCHASE (CNF-01, H2): the text the investor approves, from the stored snapshot and the
 * documents at the key and version bound in it (never a newer version), in order: the TPL_PURCHASE body; the
 * order facts; the EXECUTION_ONLY_DECLARATION and REGULAR_PLAN_COMMISSION bodies; on a MISMATCH, the suitability
 * warning and the DSC-23 clause (D-MONEY-094).
 */
export const renderPurchaseConsentText: ConsentTextRenderer = async (exec, snapshot) => {
  const f = snapshot.fields;
  const bodyOf = async (key: LegalDocumentKey): Promise<string> => {
    const bound = snapshot.legalDocuments.find((d) => d.key === key);
    if (bound === undefined) throw internal(`the PURCHASE snapshot binds no ${key}`);
    const [doc] = await exec
      .select({ bodyMarkdown: legalDocuments.bodyMarkdown, sha256: legalDocuments.sha256 })
      .from(legalDocuments)
      .where(and(eq(legalDocuments.key, key), eq(legalDocuments.version, bound.version)));
    if (doc === undefined || doc.sha256.toString('hex') !== bound.sha256) {
      throw internal(
        `legal_documents ${key} v${bound.version} is not the version the consent bound`,
      );
    }
    return doc.bodyMarkdown;
  };
  const amount = f.amount === undefined ? null : Money.parse(f.amount);
  const factsBlock = [
    `- Scheme: ${f.schemeName ?? ''} (${f.schemeIsin ?? ''})`,
    `- Amount: ${formatInr(amount)}`,
    `- Payment method: ${PAYMENT_METHOD_LABELS[f.paymentMethod ?? ''] ?? f.paymentMethod ?? ''}`,
    `- Bank account: ${f.bankIfsc ?? ''} ••${f.bankLast4 ?? ''}`,
    `- Folio: ${f.folio === 'NEW' ? 'a new folio' : (f.folio ?? '')}`,
    `- Distributor: ${f.arn ?? ''}, execution-only, no EUIN`,
    `- Commission: ${commissionText(f)}`,
  ].join('\n');
  const parts = [
    await bodyOf('TPL_PURCHASE'),
    factsBlock,
    await bodyOf('EXECUTION_ONLY_DECLARATION'),
    await bodyOf('REGULAR_PLAN_COMMISSION'),
  ];
  if (f.suitabilityOutcome === 'MISMATCH') {
    parts.push(
      renderSuitabilityWarning(await bodyOf('SUITABILITY_WARNING'), {
        schemeName: f.schemeName ?? '',
        schemeRiskometer: f.suitabilitySchemeRiskometer ?? '',
        level: f.suitabilityLevel ?? '',
        maxRiskometer: f.suitabilityMaxRiskometer ?? '',
      }),
      SUITABILITY_ACK_CLAUSE,
    );
  }
  return parts.join('\n\n');
};
