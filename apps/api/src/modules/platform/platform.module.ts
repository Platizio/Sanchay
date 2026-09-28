import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import type { Env } from '../../config/env.js';
import { createDb, DB, type DbHandle } from '../../db/client.js';
import { CLOCK, SystemClock } from './clock.js';
import { Crypto } from './crypto.js';
import { KEY_SERVICE, type KeyService, keyServiceFromEnv } from './key-service.js';

@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.dbh.close();
  }
}

@Global()
@Module({})
export class PlatformModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: PlatformModule,
      providers: [
        { provide: AppConfig, useValue: new AppConfig(env) },
        { provide: CLOCK, useClass: SystemClock },
        { provide: KEY_SERVICE, useFactory: () => keyServiceFromEnv(env) },
        {
          provide: Crypto,
          inject: [KEY_SERVICE],
          useFactory: (keys: KeyService) => new Crypto(keys),
        },
        {
          provide: DB,
          useFactory: () => createDb(env.DATABASE_URL, env.SANCHAY_DB_POOL_MAX),
        },
        DbLifecycle,
      ],
      exports: [AppConfig, CLOCK, KEY_SERVICE, Crypto, DB],
    };
  }
}
