import type { Env } from './env.js';

/** Typed, already-validated configuration. PlatformModule provides it with useValue (B9). */
export class AppConfig {
  constructor(readonly env: Env) {}
}
