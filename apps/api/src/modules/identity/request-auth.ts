import { randomBytes } from 'node:crypto';
import type { Platform } from '@sanchay/contract';
import type { ClsService } from 'nestjs-cls';
import { writeDeviceCookie } from '../platform/cookies.js';
import { sha256 } from '../platform/crypto.js';
import { AppError } from '../platform/errors.js';
import type { AuthContext, ClientInfo, SanchayClsStore } from '../platform/request-context.js';

export interface DeviceContext {
  platform: Platform;
  deviceRefHash: Buffer;
  appVersion: string | null;
  ip: string | null;
  userAgent: string | null;
}

export function requireClient(cls: ClsService<SanchayClsStore>): ClientInfo {
  const client = cls.get('client');
  if (!client) throw new AppError('ORIGIN_REJECTED');
  return client;
}

export function requireAuth(cls: ClsService<SanchayClsStore>): AuthContext {
  const auth = cls.get('auth');
  if (!auth) throw new AppError('AUTH_REQUIRED');
  return auth;
}

/** D-2: the device ref travels in the transport (cookie or x-installation-id), never in the body. */
export function requireDeviceContext(cls: ClsService<SanchayClsStore>): DeviceContext {
  const client = requireClient(cls);
  if (!client.deviceRef) throw new AppError('ORIGIN_REJECTED');
  return {
    platform: client.platform,
    deviceRefHash: sha256(client.deviceRef),
    appVersion: client.appVersion,
    ip: cls.get('ip') ?? null,
    userAgent: cls.get('userAgent') ?? null,
  };
}

/** Web: mint the 400-day __Host-sanchay_dev device cookie on first contact (public login routes only). */
export function ensureWebDeviceCookie(
  cls: ClsService<SanchayClsStore>,
  resHeaders: Headers | undefined,
): void {
  const client = requireClient(cls);
  if (client.platform !== 'WEB' || client.deviceRef) return;
  const value = randomBytes(32).toString('base64url');
  writeDeviceCookie(resHeaders, value);
  cls.set('client', { ...client, deviceRef: value });
}
