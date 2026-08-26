import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CheckoutService } from './checkout.service';
import { CheckoutDto, MarkReceiptPrintedDto, VoidSaleDto } from './dto/checkout.dto';

@Controller('sales')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService, private readonly db: PrismaService) {}
  @Post('checkout') checkout(@Body() input: CheckoutDto) { return this.checkoutService.checkout(input); }
  @Get('history') history(@Query('companyId') companyId: string, @Query('locationId') locationId?: string) { return this.checkoutService.history(companyId, locationId); }
  @Post('receipt/:receiptNo/void') void(@Param('receiptNo') receiptNo: string, @Body() input: VoidSaleDto) { return this.checkoutService.voidReceipt(receiptNo, input); }
  @Post('receipt/:receiptNo/printed') printed(@Param('receiptNo') receiptNo: string, @Body() input: MarkReceiptPrintedDto) { return this.checkoutService.markReceiptPrinted(receiptNo, input); }
  @Post('receipt/:receiptNo/thermal') thermal(@Param('receiptNo') receiptNo: string, @Body() input: MarkReceiptPrintedDto) { return this.checkoutService.printThermalReceipt(receiptNo, input); }
  @Post('printer/test') testPrinter(@Body() input: MarkReceiptPrintedDto) { return this.checkoutService.testThermalPrinter(input); }
  @Get('receipt/:receiptNo/pdf') async pdf(@Param('receiptNo') receiptNo: string, @Query('companyId') companyId: string, @Res() response: { setHeader: (name: string, value: string) => void; end: (data: Buffer) => void }) {
    const pdf = await this.checkoutService.receiptPdf(receiptNo, companyId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${receiptNo}.pdf"`);
    response.end(pdf);
  }
  @Get('receipt/:receiptNo') receiptByNumber(@Param('receiptNo') receiptNo: string, @Query('companyId') companyId: string) { return this.db.sale.findFirstOrThrow({ where: { companyId, receiptNo }, include: { company: true, location: true, register: true, cashier: { select: { name: true } }, customer: true, items: { include: { uom: true } }, payments: true, discounts: true, returns: { where: { status: 'COMPLETED' }, include: { payments: true }, orderBy: { createdAt: 'desc' } } } }); }
  @Get(':id/receipt') receipt(@Param('id') id: string) { return this.db.sale.findUniqueOrThrow({ where: { id }, include: { company: true, location: true, register: true, cashier: { select: { name: true } }, customer: true, items: { include: { uom: true } }, payments: true, discounts: true, returns: { where: { status: 'COMPLETED' }, include: { payments: true }, orderBy: { createdAt: 'desc' } } } }); }
}
