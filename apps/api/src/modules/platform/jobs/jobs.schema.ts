import { text } from 'drizzle-orm/pg-core';
import { appSchema, tstz } from '../../../db/app-schema.js';

export const workerHeartbeats = appSchema.table('worker_heartbeats', {
  taskId: text('task_id').primaryKey(),
  lastBeatAt: tstz('last_beat_at').notNull(),
});
