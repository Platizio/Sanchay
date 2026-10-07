import { FakeFp } from '../../src/integrations/fp/fake/fake-fp.js';
import { bootTestApp, type TestApp } from './app.js';

export interface FpTestApp extends TestApp {
  fakeFp: FakeFp;
}

/** Boots a worker-role TestApp with SANCHAY_PROVIDER_MODE_FP=fake, for E6/E7/E11/E20/F2/F4/F5. */
export async function bootFpTestApp(
  options: Parameters<typeof bootTestApp>[0] = {},
): Promise<FpTestApp> {
  const app = await bootTestApp({
    ...options,
    env: { SANCHAY_APP_ROLE: 'worker', SANCHAY_PROVIDER_MODE_FP: 'fake', ...options.env },
  });
  return { ...app, fakeFp: app.app.get(FakeFp) };
}
