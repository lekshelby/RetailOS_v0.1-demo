import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { ThermalPrinterService } from './thermal-printer.service';
@Module({ imports: [DatabaseModule], controllers: [CheckoutController], providers: [CheckoutService, ThermalPrinterService], exports: [ThermalPrinterService] })
export class CheckoutModule {}
