import { Module } from '@nestjs/common';
import { NotificationsSendJob } from './notifications.job.js';
import { Notify } from './notify.service.js';

@Module({
  providers: [Notify, NotificationsSendJob],
  exports: [Notify],
})
export class NotificationsModule {}
