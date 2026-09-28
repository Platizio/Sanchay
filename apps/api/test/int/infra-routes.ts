import { Controller, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import { InfraRoute } from '../../src/modules/platform/http-decorators.js';

/** R-11 stand-ins: same paths and decorator as the Plan-02 routes (E1 webhook receiver, E21 payment returns). */
@Controller()
export class InfraRoutesTestController {
  @InfraRoute('API_HOST')
  @Post('webhooks/fp')
  @HttpCode(200)
  fpWebhook(): { received: true } {
    return { received: true };
  }

  @InfraRoute('API_HOST')
  @Get('pg/return/:ref')
  pgReturnGet(@Param('ref') ref: string): { ref: string } {
    return { ref };
  }

  @InfraRoute('API_HOST')
  @Post('pg/return/:ref')
  @HttpCode(200)
  pgReturnPost(@Param('ref') ref: string): { ref: string } {
    return { ref };
  }
}

@Module({ controllers: [InfraRoutesTestController] })
export class InfraRoutesTestModule {}
