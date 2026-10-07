import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle } from '../../db/client.js';
import { requireAuth } from '../identity/request-auth.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { listCategories, listSchemes } from './catalogue.queries.js';

@Controller()
export class CatalogueRouter {
  constructor(
    // DB is PlatformModule's DbHandle (createDb), as D1 injects it; the queries take its Drizzle db.
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  @Implement(contract.catalogue.categories)
  categories() {
    return implement(contract.catalogue.categories).handler(() => {
      requireAuth(this.cls);
      return listCategories(this.dbh.db);
    });
  }

  @Implement(contract.catalogue.listSchemes)
  listSchemes() {
    return implement(contract.catalogue.listSchemes).handler(({ input }) => {
      requireAuth(this.cls);
      return listSchemes(this.dbh.db, input);
    });
  }
}
