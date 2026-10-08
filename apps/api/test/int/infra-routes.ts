import { Controller, Get, HttpCode, Module, Param, Post } from '@nestjs/common';
import { InfraRoute } from '../../src/modules/platform/http-decorators.js';

/** R-11 stand-ins for routes not yet implemented: E1 replaces the fpWebhook stand-in with the real controller. */
@Controller()
export class InfraRoutesTestController {
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
