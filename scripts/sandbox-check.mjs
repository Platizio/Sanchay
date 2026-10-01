// Checks the credentials in .env.sandbox without printing any secret value.
// Run from the repo root: node scripts/sandbox-check.mjs
// - FP tenant token, POA token and pg token (client_credentials), then one read-only FP call.
// - MSG91 and SES: format checks only (no SMS or email is sent).
// Exit code 0 when every filled-in credential works; 1 otherwise.
import { existsSync } from 'node:fs';

const FILE = '.env.sandbox';
if (!existsSync(FILE)) {
  console.error(`${FILE} not found. Run this from the repo root.`);
  process.exit(1);
}
process.loadEnvFile(FILE);

let failures = 0;
const ok = (msg) => console.log(`  OK    ${msg}`);
const bad = (msg) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
};
const skip = (msg) => console.log(`  SKIP  ${msg}`);

function parseJson(name) {
  const raw = process.env[name] ?? '';
  try {
    return JSON.parse(raw);
  } catch {
    bad(`${name} is not valid one-line JSON`);
    return null;
  }
}

const filled = (v) => typeof v === 'string' && v.trim() !== '';

/** POST a client_credentials token request; returns the access token or null. Never logs secrets. */
async function token(label, url, client) {
  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: 'client_credentials',
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && typeof json.access_token === 'string') {
      ok(`${label}: token issued (HTTP ${res.status}, expires_in ${json.expires_in ?? '?'} s)`);
      return json.access_token;
    }
    const reason = json?.error?.message ?? json?.error_description ?? json?.error ?? '';
    bad(`${label}: HTTP ${res.status} ${typeof reason === 'string' ? reason : ''}`.trim());
  } catch (error) {
    bad(`${label}: ${error.name === 'TimeoutError' ? 'timed out after 15 s' : error.message}`);
  }
  return null;
}

console.log('Cybrilla FintechPrimitives sandbox');
const fpBase = process.env.SANCHAY_FP_BASE_URL ?? '';
const poaBase = process.env.SANCHAY_POA_BASE_URL ?? '';
const creds = parseJson('SANCHAY_FP_CREDENTIALS_JSON');
if (creds !== null) {
  const tenant = creds.tenantId;
  const complete = (c) => c && filled(c.clientId) && filled(c.clientSecret);
  if (!filled(tenant)) {
    skip('tenantId is empty; fill SANCHAY_FP_CREDENTIALS_JSON to test FP');
  } else {
    let fpToken = null;
    if (complete(creds.fp)) {
      fpToken = await token(
        'fp tenant token',
        `${fpBase}/v2/auth/${encodeURIComponent(tenant)}/token`,
        creds.fp,
      );
    } else {
      skip('fp.clientId/clientSecret empty');
    }
    if (complete(creds.poa)) {
      // docs/research/fp-api.md §0 gives only the path; try the FP host, then the POA host, and report which works.
      const viaFp = await token(
        'poa token via FP host',
        `${fpBase}/v2/auth/cybrillarta/token`,
        creds.poa,
      );
      if (viaFp === null && filled(poaBase)) {
        failures -= 1; // the FP-host attempt is informational when the POA host is configured
        await token('poa token via POA host', `${poaBase}/v2/auth/cybrillarta/token`, creds.poa);
      }
    } else {
      skip('poa.clientId/clientSecret empty');
    }
    if (complete(creds.pg)) {
      const samePg = creds.pg.clientId === creds.fp?.clientId;
      if (samePg) skip('pg client equals fp client (no separate pg audience)');
      else
        await token('pg token', `${fpBase}/v2/auth/${encodeURIComponent(tenant)}/token`, creds.pg);
    } else {
      skip('pg.clientId/clientSecret empty');
    }
    if (fpToken !== null) {
      try {
        const res = await fetch(`${fpBase}/v2/mf_scheme_plans/cybrillapoa?page=0&size=1`, {
          headers: { authorization: `Bearer ${fpToken}`, 'x-tenant-id': tenant },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) ok(`read-only call GET /v2/mf_scheme_plans/cybrillapoa: HTTP ${res.status}`);
        else bad(`read-only call GET /v2/mf_scheme_plans/cybrillapoa: HTTP ${res.status}`);
      } catch (error) {
        bad(`read-only call: ${error.message}`);
      }
    }
  }
}
const arn = process.env.SANCHAY_PLATFORM_ARN ?? '';
if (!filled(arn)) skip('SANCHAY_PLATFORM_ARN empty');
else if (/^ARN-\d{1,9}$/.test(arn)) ok('SANCHAY_PLATFORM_ARN format');
else bad('SANCHAY_PLATFORM_ARN must look like ARN-123456');
if (filled(process.env.SANCHAY_FP_WEBHOOK_SECRET)) ok('SANCHAY_FP_WEBHOOK_SECRET present');
else skip('SANCHAY_FP_WEBHOOK_SECRET empty');

console.log('MSG91 (format only; nothing is sent)');
const msg91 = parseJson('SANCHAY_MSG91_CREDENTIALS_JSON');
if (msg91 !== null) {
  const fields = ['authKey', 'senderId', 'peId'];
  const templates = ['LOGIN', 'CONSENT', 'CONSENT_UNITS', 'ATTEST'];
  const missing = [
    ...fields.filter((f) => !filled(msg91[f])),
    ...templates.filter((t) => !filled(msg91.templateIds?.[t])).map((t) => `templateIds.${t}`),
  ];
  if (missing.length === fields.length + templates.length) skip('all MSG91 fields empty');
  else if (missing.length === 0) ok('all MSG91 fields present');
  else bad(`MSG91 missing: ${missing.join(', ')}`);
}

console.log('Amazon SES (format only; nothing is sent)');
const from = process.env.SANCHAY_SES_FROM ?? '';
if (!filled(from)) skip('SANCHAY_SES_FROM empty');
else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) ok('SANCHAY_SES_FROM format');
else bad('SANCHAY_SES_FROM is not an email address');

console.log(
  failures === 0 ? '\nAll filled-in credentials check out.' : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
