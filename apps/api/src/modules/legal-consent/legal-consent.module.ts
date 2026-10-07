import { Module } from '@nestjs/common';
import { LegalDocs } from './legal-docs.service.js';

@Module({
  providers: [LegalDocs],
  exports: [LegalDocs],
})
export class LegalConsentModule {}
