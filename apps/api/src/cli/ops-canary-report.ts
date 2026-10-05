/**
 * G-E7: evaluates the saved snapshot against the transcribed statement/bank evidence and rewrites
 * the generated section of docs/probes/canary-2026-11.md. Local only: no database, no provider.
 *   pnpm --filter=@sanchay/api ops:canary-report
 * Paths default to docs/probes/canary-2026-11{-db.json,-evidence.json,.md} at the repo root;
 * override with --snapshot=, --evidence= and --doc= (resolved against the repo root).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canaryEvidenceSchema,
  canarySnapshotSchema,
  decodeSavedJson,
  evaluateCanary,
  renderCanarySection,
  spliceGeneratedSection,
} from './canary/canary-evidence.js';

// dist/cli/ops-canary-report.js -> apps/api/dist/cli -> repo root is four levels up.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const arg = (name: string, fallback: string): string => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return resolve(repoRoot, hit === undefined ? fallback : hit.slice(name.length + 3));
};

const snapshotPath = arg('snapshot', 'docs/probes/canary-2026-11-db.json');
const evidencePath = arg('evidence', 'docs/probes/canary-2026-11-evidence.json');
const docPath = arg('doc', 'docs/probes/canary-2026-11.md');

const snapshot = canarySnapshotSchema.parse(decodeSavedJson(readFileSync(snapshotPath)));
const evidence = canaryEvidenceSchema.parse(decodeSavedJson(readFileSync(evidencePath)));
const report = evaluateCanary(snapshot, evidence);
// Both inputs are committed: rewrite them as plain UTF-8 JSON (the snapshot may arrive tagged, or
// as UTF-16 from a PowerShell 5.1 redirect).
writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(
  docPath,
  spliceGeneratedSection(readFileSync(docPath, 'utf8'), renderCanarySection(report)),
);
process.stdout.write(
  `ops-canary-report: GO-1 ${report.go1 ? 'satisfied' : 'NOT satisfied'}; GO-2 registration ${report.go2Registration ? 'satisfied' : 'NOT satisfied'}; ${docPath} updated\n`,
);
