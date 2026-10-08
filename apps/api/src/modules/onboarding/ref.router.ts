import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { contract } from '@sanchay/contract';
import { eq } from 'drizzle-orm';
import { DB, type DbHandle } from '../../db/client.js';
import { AppError } from '../platform/errors.js';
import { refPincodes } from './ref.schema.js';

@Controller()
export class RefRouter {
  constructor(@Inject(DB) private readonly dbh: DbHandle) {}

  @Implement(contract.ref.pincode)
  pincode() {
    return implement(contract.ref.pincode).handler(async ({ input }) => {
      const [row] = await this.dbh.db
        .select()
        .from(refPincodes)
        .where(eq(refPincodes.pincode, input.pincode))
        .limit(1);
      if (!row) throw new AppError('NOT_FOUND');
      return { pincode: row.pincode, city: row.city, state: row.state };
    });
  }
}
