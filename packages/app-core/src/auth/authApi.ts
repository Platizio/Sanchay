import type { ApiClient } from '@sanchay/api-client';
import type { AuthApi } from './useOtpLogin';

export function authApiFrom(client: ApiClient): AuthApi {
  return {
    requestOtp: (input) => client.auth.requestOtp(input),
    verifyOtp: (input) => client.auth.verifyOtp(input),
  };
}
