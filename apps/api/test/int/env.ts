import { type Env, parseEnv } from '../../src/config/env.js';
import { type KeyService, LocalKeyService } from '../../src/modules/platform/key-service.js';

export const TEST_APP_ORIGIN = 'https://app.sanchay.test';
export const TEST_API_ORIGIN = 'https://api.sanchay.test';

const key = (fill: number): string => Buffer.alloc(32, fill).toString('base64');

export function testEnv(databaseUrl: string, overrides: Record<string, string> = {}): Env {
  return parseEnv({
    SANCHAY_APP_ENV: 'test',
    DATABASE_URL: databaseUrl,
    SANCHAY_APP_ORIGIN: TEST_APP_ORIGIN,
    SANCHAY_API_ORIGIN: TEST_API_ORIGIN,
    SANCHAY_PLATFORM_ARN: 'ARN-000000',
    SANCHAY_CLIENT_IP_SOURCE: 'socket',
    SANCHAY_KEY_SERVICE: 'local',
    SANCHAY_LOCAL_PII_KEY: key(1),
    SANCHAY_LOCAL_BIDX_KEY: key(2),
    SANCHAY_OTP_PEPPER: key(3),
    SANCHAY_AUTH_TOKEN_KEY: key(4),
    SANCHAY_PROVIDER_MODE_SMS: 'capture',
    SANCHAY_PROVIDER_MODE_EMAIL: 'capture',
    SANCHAY_PILOT_INVITE_ONLY: 'false',
    SANCHAY_LOG_LEVEL: 'silent',
    ...overrides,
  });
}

export function testKeyService(env: Env): KeyService {
  return LocalKeyService.fromEnv(env);
}
