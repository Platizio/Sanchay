import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { SkipThrottle } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { INFRA_ROUTE, InfraRoute, IS_PUBLIC, SKIP_CLIENT_CHECK } from './http-decorators.js';

const reflector = new Reflector();

describe('InfraRoute (R-11 guard exemptions)', () => {
  it('marks a controller public and exempt from the client check, and records the HostGuard scope', () => {
    class Webhooks {}
    InfraRoute('API_HOST')(Webhooks);
    class Health {}
    InfraRoute('APP_AND_API_HOSTS')(Health);
    expect(reflector.get(IS_PUBLIC, Webhooks)).toBe(true);
    expect(reflector.get(SKIP_CLIENT_CHECK, Webhooks)).toBe(true);
    expect(reflector.get(INFRA_ROUTE, Webhooks)).toBe('API_HOST');
    expect(reflector.get(INFRA_ROUTE, Health)).toBe('APP_AND_API_HOSTS');
  });

  it('carries exactly the metadata @SkipThrottle() sets, so the B21 ThrottlerGuard skips the route', () => {
    class Skipped {}
    SkipThrottle()(Skipped);
    class Infra {}
    InfraRoute('API_HOST')(Infra);
    const keys = Reflect.getMetadataKeys(Skipped);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(Reflect.getMetadata(key, Infra)).toEqual(Reflect.getMetadata(key, Skipped));
    }
  });

  it('works on a single handler as well as on a controller class', () => {
    class Routes {
      handler(): string {
        return 'ok';
      }
    }
    InfraRoute('API_HOST')(
      Routes.prototype,
      'handler',
      Object.getOwnPropertyDescriptor(Routes.prototype, 'handler'),
    );
    expect(reflector.get(INFRA_ROUTE, Routes.prototype.handler)).toBe('API_HOST');
    expect(reflector.get(IS_PUBLIC, Routes.prototype.handler)).toBe(true);
    expect(reflector.get(SKIP_CLIENT_CHECK, Routes.prototype.handler)).toBe(true);
  });
});
