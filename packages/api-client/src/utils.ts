import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { ApiClient } from './client.js';

export type ApiUtils = ReturnType<typeof createTanstackQueryUtils<ApiClient>>;

export function createApiUtils(client: ApiClient): ApiUtils {
  return createTanstackQueryUtils(client);
}
