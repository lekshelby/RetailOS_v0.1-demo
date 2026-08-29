import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/shift.dto';
import { ShiftsService } from './shifts.service';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}
  @Post('open') open(@Body() input: OpenShiftDto) { return this.shifts.open(input); }
  @Get('current') current(@Query('registerId') registerId: string, @Query('companyId') companyId: string) { return this.shifts.current(registerId, companyId); }
  @Get('history') history(@Query('companyId') companyId: string, @Query('actorId') actorId: string, @Query('registerId') registerId?: string) { return this.shifts.history(companyId, actorId, registerId); }
  @Get(':id/report') report(@Param('id') id: string, @Query('companyId') companyId: string, @Query('actorId') actorId: string) { return this.shifts.report(id, companyId, actorId); }
  @Post(':id/report/print') printReport(@Param('id') id: string, @Body() input: { companyId: string; actorId: string }) { return this.shifts.printReport(id, input.companyId, input.actorId); }
  @Post(':id/movements') movement(@Param('id') id: string, @Body() input: CashMovementDto) { return this.shifts.addMovement(id, input); }
  @Post(':id/close') close(@Param('id') id: string, @Body() input: CloseShiftDto) { return this.shifts.close(id, input); }
}

