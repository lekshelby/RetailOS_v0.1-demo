import { Body, Controller, Get, Headers, Param, Post, Query, Res } from '@nestjs/common';
import { BackOfficeService } from './backoffice.service';
import { BatchUpdateService } from './batch-update.service';
import { BatchActorDto, BatchResultQueryDto, BatchTemplateQueryDto, CommitBatchDto, PreviewBatchDto } from './dto/batch-update.dto';
import { BackOfficeQueryDto, InventoryLedgerQueryDto } from './dto/backoffice-query.dto';
import { PostPurchaseReceiptDto, PurchaseReceiptQueryDto, SettleShortageDto } from './dto/purchase-receipt.dto';
import { PurchaseReceiptService } from './purchase-receipt.service';

@Controller('backoffice')
export class BackOfficeController {
  constructor(private readonly backOffice: BackOfficeService, private readonly batches: BatchUpdateService, private readonly purchaseReceipts: PurchaseReceiptService) {}
  @Get('dashboard') dashboard(@Query() input: BackOfficeQueryDto) { return this.backOffice.dashboard(input); }
  @Get('reports/sales') sales(@Query() input: BackOfficeQueryDto) { return this.backOffice.sales(input); }
  @Get('reports/products') products(@Query() input: BackOfficeQueryDto) { return this.backOffice.products(input); }
  @Get('reports/inventory') inventory(@Query() input: BackOfficeQueryDto) { return this.backOffice.inventory(input); }
  @Get('reports/adjustments') adjustments(@Query() input: BackOfficeQueryDto) { return this.backOffice.adjustments(input); }
  @Get('reports/bukku') bukku(@Query() input: BackOfficeQueryDto) { return this.backOffice.bukku(input); }
  @Get('inventory/products/:productId/ledger') inventoryLedger(@Param('productId') productId: string, @Query() input: InventoryLedgerQueryDto) { return this.backOffice.inventoryLedger(productId, input); }
  @Get('batches/template') async template(@Query() input: BatchTemplateQueryDto, @Res() response: { setHeader(name: string, value: string): void; send(value: Buffer): void }) { const file = await this.batches.template(input); response.setHeader('Content-Type', file.mimeType); response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`); response.send(file.content); }
  @Post('batches/preview') preview(@Body() input: PreviewBatchDto) { return this.batches.preview(input); }
  @Get('batches/:id') batch(@Param('id') id: string, @Query() input: BatchActorDto) { return this.batches.get(id, input); }
  @Post('batches/:id/commit') commit(@Param('id') id: string, @Body() input: CommitBatchDto, @Headers('x-retailos-approval') approvalToken?: string) { return this.batches.commit(id, input, approvalToken); }
  @Get('batches/:id/result') async result(@Param('id') id: string, @Query() input: BatchResultQueryDto, @Res() response: { setHeader(name: string, value: string): void; send(value: Buffer): void }) { const file = await this.batches.result(id, input); response.setHeader('Content-Type', file.mimeType); response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`); response.send(file.content); }
  @Get('purchase-receipts') purchaseReceiptList(@Query() input: PurchaseReceiptQueryDto) { return this.purchaseReceipts.list(input); }
  @Get('purchase-receipts/:id') purchaseReceipt(@Param('id') id: string, @Query() input: PurchaseReceiptQueryDto) { return this.purchaseReceipts.get(id, input); }
  @Post('purchase-receipts/:id/post') postPurchaseReceipt(@Param('id') id: string, @Body() input: PostPurchaseReceiptDto) { return this.purchaseReceipts.post(id, input); }
  @Post('inventory/products/:productId/enable-fifo') enableLegacyFifo(@Param('productId') productId: string, @Body() input: PostPurchaseReceiptDto) { return this.purchaseReceipts.enableLegacyFifo(productId, input); }
  @Get('inventory/products/:productId/batches') productBatches(@Param('productId') productId: string, @Query() input: PurchaseReceiptQueryDto) { return this.purchaseReceipts.productBatches(productId, input); }
  @Get('inventory/shortages') shortages(@Query() input: PurchaseReceiptQueryDto) { return this.purchaseReceipts.shortages(input); }
  @Post('inventory/shortages/:shortageBatchId/settle') settleShortage(@Param('shortageBatchId') shortageBatchId: string, @Body() input: SettleShortageDto) { return this.purchaseReceipts.settleShortage(shortageBatchId, input); }
}
