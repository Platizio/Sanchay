// Checks sandbox/provider credentials without printing any secret value.
// Run from the repo root:  node scripts/sandbox-check.mjs [env-file]
// The env file defaults to apps/api/.env (git-ignored).
// Reads the Plan 02 names (SANCHAY_FP_CREDENTIALS_JSON, ...) or the v1 names (FINPRIM_*, CYBRILLA_PRE_VERIFICATION_*, MAIL_*).
// - Cybrilla: FP tenant token, POA (pre-verification) token, pg token, then read-only FP catalogue calls.
// - SMTP (e.g. Mailtrap): connect, STARTTLS, AUTH, QUIT. No email is sent.
// - MSG91, SES: format checks only. No SMS or email is sent.
// Exit code 0 when every filled-in credential works; 1 otherwise.
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { parseEnv } from 'node:util';

const file = process.argv[2] ?? 'apps/api/.env';
if (file === undefined || !existsSync(file)) {
  console.error(
    'No env file found. Pass a path, or create apps/api/.env (run from the repo root).',
  );
  process.exit(1);
}
const env = { ...parseEnv(readFileSync(file, 'utf8')), ...process.env };
console.log(`Reading ${file}\n`);

let failures = 0;
const ok = (msg) => console.log(`  OK    ${msg}`);
const bad = (msg) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
};
const skip = (msg) => console.log(`  SKIP  ${msg}`);
const filled = (v) => typeof v === 'string' && v.trim() !== '';

function parseJson(name) {
  if (!filled(env[name])) return null;
  try {
    return JSON.parse(env[name]);
  } catch {
    bad(`${name} is not valid one-line JSON`);
    return null;
  }
}

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

async function readOnlyGet(label, url, headers) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.ok) ok(`${label}: HTTP ${res.status}`);
    else bad(`${label}: HTTP ${res.status}`);
  } catch (error) {
    bad(`${label}: ${error.message}`);
  }
}

// ---- Cybrilla ---------------------------------------------------------------------------------
console.log('Cybrilla (FintechPrimitives sandbox)');
const fpBase = env.SANCHAY_FP_BASE_URL || env.FINPRIM_BASE_URL || 'https://s.finprim.com';
const json = parseJson('SANCHAY_FP_CREDENTIALS_JSON');
const creds = {
  tenant: json?.tenantId || env.FINPRIM_TENANT_NAME || '',
  fp: json?.fp ?? {
    clientId: env.FINPRIM_TENANT_CLIENT_ID,
    clientSecret: env.FINPRIM_TENANT_CLIENT_SECRET,
  },
  poa: json?.poa ?? {
    clientId: env.CYBRILLA_PRE_VERIFICATION_CLIENT_ID,
    clientSecret: env.CYBRILLA_PRE_VERIFICATION_CLIENT_SECRET,
  },
  pg: json?.pg ?? null,
};
const complete = (c) => c && filled(c.clientId) && filled(c.clientSecret);
console.log(
  `  (names: ${json ? 'SANCHAY_FP_CREDENTIALS_JSON' : 'v1 FINPRIM_* / CYBRILLA_PRE_VERIFICATION_*'}; host ${new URL(fpBase).host})`,
);
if (!filled(creds.tenant)) {
  skip('no tenant name (tenantId in SANCHAY_FP_CREDENTIALS_JSON, or FINPRIM_TENANT_NAME)');
} else {
  const tenant = creds.tenant;
  let fpToken = null;
  if (complete(creds.fp)) {
    fpToken = await token(
      'FP tenant token',
      `${fpBase}/v2/auth/${encodeURIComponent(tenant)}/token`,
      creds.fp,
    );
  } else {
    skip('FP tenant client id/secret empty');
  }
  if (fpToken !== null) {
    const headers = { authorization: `Bearer ${fpToken}`, 'x-tenant-id': tenant };
    await readOnlyGet(
      'read-only GET /v2/mf_scheme_plans/cybrillapoa',
      `${fpBase}/v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund&page=0&size=1`,
      headers,
    );
    await readOnlyGet(
      'read-only GET /api/oms/fund_schemes',
      `${fpBase}/api/oms/fund_schemes?page=0&size=1`,
      headers,
    );
  }
  if (complete(creds.poa)) {
    const poaTokenUrl =
      env.CYBRILLA_PRE_VERIFICATION_TOKEN_URL || `${fpBase}/v2/auth/cybrillarta/token`;
    await token('POA (pre-verification) token', poaTokenUrl, creds.poa);
  } else {
    skip('POA (pre-verification) client id/secret empty');
  }
  if (creds.pg === null) skip('no separate pg client (payments use the FP tenant token)');
  else if (!complete(creds.pg)) skip('pg client id/secret empty');
  else if (creds.pg.clientId === creds.fp?.clientId) skip('pg client equals the FP client');
  else await token('pg token', `${fpBase}/v2/auth/${encodeURIComponent(tenant)}/token`, creds.pg);
}
const arn = env.SANCHAY_PLATFORM_ARN ?? '';
if (!filled(arn)) skip('SANCHAY_PLATFORM_ARN empty');
else if (/^ARN-\d{1,9}$/.test(arn)) ok('SANCHAY_PLATFORM_ARN format');
else bad('SANCHAY_PLATFORM_ARN must look like ARN-123456');
const webhookSecret = env.SANCHAY_FP_WEBHOOK_SECRET || env.CYBRILLA_WEBHOOK_SECRET;
if (filled(webhookSecret)) ok('webhook secret present');
else skip('webhook secret empty (SANCHAY_FP_WEBHOOK_SECRET)');

// ---- SMTP (Mailtrap or any SMTP relay) ---------------------------------------------------------
/** Minimal SMTP client: reads multi-line replies, upgrades with STARTTLS, authenticates, quits. */
class Smtp {
  constructor(socket) {
    this.buf = '';
    this.pending = null;
    this.attach(socket);
  }
  attach(socket) {
    if (this.socket) this.socket.removeAllListeners('data');
    this.socket = socket;
    socket.setTimeout(15_000, () => socket.destroy(new Error('SMTP timed out after 15 s')));
    socket.on('data', (d) => {
      this.buf += d.toString('latin1');
      this.flush();
    });
    socket.on('error', (e) => this.fail(e));
  }
  fail(error) {
    const p = this.pending;
    this.pending = null;
    p?.reject(error);
  }
  flush() {
    if (this.pending === null) return;
    const lines = this.buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (/^\d{3}( |$)/.test(lines[i])) {
        const reply = lines.slice(0, i + 1);
        this.buf = lines.slice(i + 1).join('\r\n');
        const p = this.pending;
        this.pending = null;
        p.resolve({ code: Number(lines[i].slice(0, 3)), lines: reply });
        return;
      }
    }
  }
  read() {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.flush();
    });
  }
  send(line) {
    this.socket.write(`${line}\r\n`);
    return this.read();
  }
}

async function smtpAuthCheck({ host, port, user, pass }) {
  const implicitTls = port === 465;
  const socket = implicitTls
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  await once(socket, implicitTls ? 'secureConnect' : 'connect');
  const smtp = new Smtp(socket);
  try {
    const greeting = await smtp.read();
    if (greeting.code !== 220) return `unexpected greeting ${greeting.code}`;
    let ehlo = await smtp.send('EHLO sandbox-check.local');
    if (ehlo.code !== 250) return `EHLO refused (${ehlo.code})`;
    if (!implicitTls) {
      if (!ehlo.lines.some((l) => /STARTTLS/i.test(l))) return 'server does not offer STARTTLS';
      const start = await smtp.send('STARTTLS');
      if (start.code !== 220) return `STARTTLS refused (${start.code})`;
      socket.removeAllListeners('data');
      const secure = tls.connect({ socket, servername: host });
      await once(secure, 'secureConnect');
      smtp.attach(secure);
      ehlo = await smtp.send('EHLO sandbox-check.local');
      if (ehlo.code !== 250) return `EHLO after STARTTLS refused (${ehlo.code})`;
    }
    const auth = await smtp.send(
      `AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString('base64')}`,
    );
    await smtp.send('QUIT').catch(() => undefined);
    return auth.code === 235
      ? null
      : `AUTH refused (${auth.code}: ${auth.lines.at(-1)?.slice(4) ?? ''})`;
  } finally {
    smtp.socket.destroy();
  }
}

console.log('\nSMTP (login only; no email is sent)');
const smtpHost = env.SANCHAY_SMTP_HOST || env.MAIL_HOST;
if (!filled(smtpHost)) {
  skip('no SMTP host (MAIL_HOST)');
} else {
  const port = Number(env.SANCHAY_SMTP_PORT || env.MAIL_PORT || 587);
  const user = env.SANCHAY_SMTP_USERNAME || env.MAIL_USERNAME || '';
  const pass = env.SANCHAY_SMTP_PASSWORD || env.MAIL_PASSWORD || '';
  if (!filled(user) || !filled(pass)) {
    skip('SMTP username/password empty');
  } else {
    try {
      const problem = await smtpAuthCheck({ host: smtpHost, port, user, pass });
      if (problem === null) ok(`SMTP login accepted by ${smtpHost}:${port}`);
      else bad(`SMTP ${smtpHost}:${port}: ${problem}`);
    } catch (error) {
      bad(`SMTP ${smtpHost}:${port}: ${error.message}`);
    }
  }
}

// ---- MSG91, SES (format only) ------------------------------------------------------------------
console.log('\nMSG91 (format only; nothing is sent)');
const msg91 = parseJson('SANCHAY_MSG91_CREDENTIALS_JSON');
if (msg91 === null) {
  skip('SANCHAY_MSG91_CREDENTIALS_JSON not set');
} else {
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

console.log('\nAmazon SES (format only; nothing is sent)');
const from = env.SANCHAY_SES_FROM ?? '';
if (!filled(from)) skip('SANCHAY_SES_FROM not set');
else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) ok('SANCHAY_SES_FROM format');
else bad('SANCHAY_SES_FROM is not an email address');

console.log(
  failures === 0 ? '\nAll filled-in credentials check out.' : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
