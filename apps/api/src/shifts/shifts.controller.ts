import { Body, Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/shift.dto';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}
  @Post('open') open(@Body() input: OpenShiftDto) { return this.shifts.open(input); }
  @Get('current') current(@Query('registerId') registerId: string, @Query('companyId') companyId: string) { return this.shifts.current(registerId, companyId); }
  @Get('history') history(@Query('companyId') companyId: string, @Query('actorId') actorId: string, @Query('registerId') registerId?: string) { return this.shifts.history(companyId, actorId, registerId); }
  @Get(':id/report') report(@Param('id') id: string, @Query('companyId') companyId: string, @Query('actorId') actorId: string) { return this.shifts.report(id, companyId, actorId); }
  @Get(':id/daily-digest.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async dailyDigest(@Param('id') id: string, @Query('companyId') companyId: string, @Query('actorId') actorId: string, @Res() response: { setHeader(name: string, value: string): void; send(value: Buffer): void }) {
    const digest = await this.shifts.downloadDailyDigest(id, companyId, actorId);
    response.setHeader('Content-Disposition', `attachment; filename="${digest.fileName}"`);
    response.send(digest.content);
  }
  @Post(':id/report/print') printReport(@Param('id') id: string, @Body() input: { companyId: string; actorId: string }) { return this.shifts.printReport(id, input.companyId, input.actorId); }
  @Post(':id/movements') movement(@Param('id') id: string, @Body() input: CashMovementDto) { return this.shifts.addMovement(id, input); }
  @Post(':id/close') close(@Param('id') id: string, @Body() input: CloseShiftDto) { return this.shifts.close(id, input); }
}
