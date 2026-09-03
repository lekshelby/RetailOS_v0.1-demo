import { Module } from '@nestjs/common';
import { BukkuAdapter } from './bukku.adapter';
import { BukkuHttpClient } from './bukku-http.client';
import { BukkuSyncService } from './bukku-sync.service';
import { BukkuAutoSyncService } from './bukku-auto-sync.service';
import { BukkuSyncController } from './bukku-sync.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [BukkuSyncController],
  providers: [BukkuAdapter, BukkuHttpClient, BukkuSyncService, BukkuAutoSyncService],
  exports: [BukkuAdapter, BukkuHttpClient, BukkuSyncService, BukkuAutoSyncService],
})
export class BukkuModule {}
