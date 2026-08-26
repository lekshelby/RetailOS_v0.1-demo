import { Body, Controller, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { BukkuAutoSyncService } from './bukku-auto-sync.service';

class SyncNowDto { @IsString() companyId!: string; @IsString() actorId!: string; }

@Controller('sync')
export class BukkuSyncController {
  constructor(private readonly sync: BukkuAutoSyncService) {}
  @Post('now') now(@Body() input: SyncNowDto) { return this.sync.syncNow(input.companyId, input.actorId); }
}
