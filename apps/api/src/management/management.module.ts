import { Module } from '@nestjs/common';
import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';
import { BukkuModule } from '../integrations/bukku/bukku.module';

@Module({ imports: [BukkuModule], controllers: [ManagementController], providers: [ManagementService] })
export class ManagementModule {}
