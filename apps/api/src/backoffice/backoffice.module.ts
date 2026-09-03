import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { BackOfficeController } from './backoffice.controller';
import { BackOfficeService } from './backoffice.service';
import { BatchUpdateService } from './batch-update.service';
import { PurchaseReceiptService } from './purchase-receipt.service';

@Module({ imports: [DatabaseModule, AuthModule], controllers: [BackOfficeController], providers: [BackOfficeService, BatchUpdateService, PurchaseReceiptService] })
export class BackOfficeModule {}
