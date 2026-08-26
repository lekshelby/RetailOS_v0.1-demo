import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { BukkuModule } from '../integrations/bukku/bukku.module';

@Module({ imports: [BukkuModule], controllers: [ShiftsController], providers: [ShiftsService] })
export class ShiftsModule {}
