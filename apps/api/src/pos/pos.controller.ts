import { Controller, Get, Query } from '@nestjs/common';
import { PosService } from './pos.service';

@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get('bootstrap')
  bootstrap(@Query('companyCode') companyCode: string) {
    return this.pos.bootstrap(companyCode);
  }
}
