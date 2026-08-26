import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EInvoiceController } from './einvoice.controller';
@Module({ imports: [DatabaseModule], controllers: [EInvoiceController] }) export class EInvoiceModule {}
