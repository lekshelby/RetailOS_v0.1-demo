import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { BukkuModule } from '../integrations/bukku/bukku.module';
import { CheckoutModule } from '../checkout/checkout.module';

@Module({ imports: [BukkuModule, CheckoutModule], controllers: [ShiftsController], providers: [ShiftsService] })
export class ShiftsModule {}

