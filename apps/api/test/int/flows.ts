import { randomUUID } from 'node:crypto';
import type { TestApp } from './app.js';
import { cookiesFrom, nativeHeaders, webHeaders } from './http.js';

/** Default client IP (RFC 5737 TEST-NET-3). With SANCHAY_CLIENT_IP_SOURCE=socket the API reads the injected remoteAddress. */
export const FLOW_IP = '203.0.113.10';

export interface WebSignIn {
  cookies: Record<string, string>;
  investorId: string;
}

export interface NativeSignIn {
  token: string;
  installationId: string;
  investorId: string;
}

interface OtpSentBody {
  challengeId?: string;
}

interface VerifyBody {
  status?: string;
  investorId?: string;
  session?: { token?: string };
}

/** Full web sign-in: mints __Host-sanchay_dev on the OTP call, then verifies the SMS code by challengeId. */
export async function signInWeb(
  t: TestApp,
  mobile: string,
  remoteAddress: string = FLOW_IP,
): Promise<WebSignIn> {
  const otp = await t.app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp',
    headers: webHeaders(),
    payload: { mobile },
    remoteAddress,
  });
  const challengeId = otp.json<OtpSentBody>().challengeId;
  if (otp.statusCode !== 200 || challengeId === undefined) {
    throw new Error(`signInWeb requestOtp: ${otp.statusCode} ${otp.body}`);
  }
  const device = cookiesFrom(otp);
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/verify',
    headers: webHeaders({ cookies: device }),
    payload: { challengeId, code: t.sms.latestCode(mobile) },
    remoteAddress,
  });
  const body = res.json<VerifyBody>();
  if (res.statusCode !== 200 || body.status !== 'SIGNED_IN' || body.investorId === undefined) {
    throw new Error(`signInWeb verifyOtp: ${res.statusCode} ${res.body}`);
  }
  return { cookies: { ...device, ...cookiesFrom(res) }, investorId: body.investorId };
}

/** Full native sign-in; the installation id is the device ref (D-2). */
export async function signInNative(
  t: TestApp,
  mobile: string,
  installationId: string = randomUUID(),
  remoteAddress: string = FLOW_IP,
): Promise<NativeSignIn> {
  const otp = await t.app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp',
    headers: nativeHeaders({ installationId }),
    payload: { mobile },
    remoteAddress,
  });
  const challengeId = otp.json<OtpSentBody>().challengeId;
  if (otp.statusCode !== 200 || challengeId === undefined) {
    throw new Error(`signInNative requestOtp: ${otp.statusCode} ${otp.body}`);
  }
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/verify',
    headers: nativeHeaders({ installationId }),
    payload: { challengeId, code: t.sms.latestCode(mobile) },
    remoteAddress,
  });
  const body = res.json<VerifyBody>();
  const token = body.session?.token;
  if (
    res.statusCode !== 200 ||
    body.status !== 'SIGNED_IN' ||
    body.investorId === undefined ||
    token === undefined
  ) {
    throw new Error(`signInNative verifyOtp: ${res.statusCode} ${res.body}`);
  }
  return { token, installationId, investorId: body.investorId };
}
