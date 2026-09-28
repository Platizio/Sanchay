import { Inject, Injectable } from '@nestjs/common';
import type { Platform } from '@sanchay/contract';
import { getTableColumns, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { investorDevices } from './identity.schema.js';

export type DeviceRow = typeof investorDevices.$inferSelect;

export interface DeviceRegistration {
  platform: Platform;
  /** SHA-256 of the __Host-sanchay_dev value (web) or of the lower-cased x-installation-id (Android). */
  refHash: Buffer;
  appVersion: string | null;
}

export interface UpsertedDevice {
  device: DeviceRow;
  /** First sign-in from this device ref, or a previously revoked device signing in again. */
  isNew: boolean;
}

@Injectable()
export class DeviceRegistry {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /**
   * Called by the login flow (B19) after the SMS OTP is verified, inside the sign-in transaction.
   * One row per (investor_id, device_ref_hash). A repeat sign-in refreshes platform, app version and
   * last_seen_at and clears revoked_at: a revoked device comes back only through a fresh OTP login.
   * `old` in RETURNING is PostgreSQL 18; its columns are NULL when the row was inserted.
   */
  async upsert(
    exec: DbExecutor,
    investorId: string,
    device: DeviceRegistration,
  ): Promise<UpsertedDevice> {
    const now = this.clock.now();
    const [row] = await exec
      .insert(investorDevices)
      .values({
        id: newId('investor_devices'),
        createdAt: now,
        updatedAt: now,
        investorId,
        platform: device.platform,
        deviceRefHash: device.refHash,
        appVersion: device.appVersion,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [investorDevices.investorId, investorDevices.deviceRefHash],
        set: {
          platform: device.platform,
          appVersion: device.appVersion,
          lastSeenAt: now,
          revokedAt: null,
          updatedAt: now,
        },
      })
      .returning({
        ...getTableColumns(investorDevices),
        isNew: sql<boolean>`(old.id IS NULL OR old.revoked_at IS NOT NULL)`,
      });
    if (!row) throw new AppError('INTERNAL');
    const { isNew, ...deviceRow } = row;
    return { device: deviceRow, isNew };
  }
}
