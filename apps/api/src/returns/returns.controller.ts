import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateReturnDto, RefundStoreCreditDto } from './dto/create-return.dto';
import { ReturnsService } from './returns.service';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}
  @Post() create(@Body() input: CreateReturnDto) { return this.returns.create(input); }
  @Get('store-credits/:id') credit(@Param('id') id: string, @Query('companyId') companyId: string) { return this.returns.getStoreCredit(companyId, id); }
  @Post('store-credits/:id/refund') refundCredit(@Param('id') id: string, @Body() input: RefundStoreCreditDto) { return this.returns.refundStoreCredit(id, input); }
}
