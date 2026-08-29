import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { calculateCheckout, settlePayments } from './checkout-calculator';
import { CheckoutDto, MarkReceiptPrintedDto, VoidSaleDto } from './dto/checkout.dto';
import { EInvoiceController } from '../einvoice/einvoice.controller';
import { ThermalPrinterService } from './thermal-printer.service';

@Injectable()
export class CheckoutService {
  constructor(private readonly db: PrismaService, private readonly thermalPrinter: ThermalPrinterService) {}

  async history(companyId: string, locationId?: string) {
    const sales = await this.db.sale.findMany({
      where: { companyId, status: { in: ['COMPLETED', 'VOIDED'] }, ...(locationId ? { locationId } : {}) },
      orderBy: { completedAt: 'desc' },
      take: 100,
      select: { receiptNo: true, status: true, printedAt: true, grandTotal: true, completedAt: true, cashier: { select: { name: true } }, payments: { select: { method: true, amount: true, changeAmount: true } }, returns: { where: { status: 'COMPLETED' }, select: { type: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return sales.map((sale) => ({
      receiptNo: sale.receiptNo,
      status: sale.status,
      printed: Boolean(sale.printedAt),
      returnStatus: sale.returns[0]?.type === 'REFUND' ? 'RETURNED' : sale.returns[0]?.type === 'DISPOSE' ? 'DISPOSED' : sale.returns[0]?.type === 'EXCHANGE' ? 'EXCHANGED' : null,
      total: Number(sale.grandTotal),
      completedAt: sale.completedAt,
      cashier: sale.cashier.name,
      payments: sale.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) - Number(payment.changeAmount) })),
    }));
  }

  async checkout(input: CheckoutDto) {
    if (input.offlineId) {
      const replay = await this.db.sale.findUnique({ where: { companyId_offlineId: { companyId: input.companyId, offlineId: input.offlineId } }, include: this.saleInclude() });
      if (replay) return replay;
    }
    return this.db.$transaction(async (tx) => this.complete(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async voidReceipt(receiptNo: string, input: VoidSaleDto) {
    const reason = input.reason?.trim();
    if (!reason) throw new BadRequestException('A void reason is required');
    return this.db.$transaction(async (tx) => {
      const [sale, actor] = await Promise.all([
        tx.sale.findFirst({ where: { companyId: input.companyId, receiptNo }, include: { items: { include: { product: true } }, returns: { where: { status: 'COMPLETED' } } } }),
        tx.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
      ]);
      const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
      if (!actor || !permissions.includes('sale.void')) throw new NotFoundException('Manager approval is required to void a receipt');
      if (!sale) throw new NotFoundException('Receipt was not found');
      if (sale.status !== 'COMPLETED') throw new BadRequestException('Only completed receipts can be voided');
      if (sale.returns.length) throw new BadRequestException('This receipt already has a return. Use the return workflow instead of voiding it.');
      for (const item of sale.items) {
        if (!item.product.trackStock) continue;
        await tx.stockSnapshot.upsert({
          where: { locationId_productId: { locationId: sale.locationId, productId: item.productId } },
          update: { quantity: { increment: item.baseQuantity }, capturedAt: new Date() },
          create: { locationId: sale.locationId, productId: item.productId, quantity: item.baseQuantity },
        });
      }
      await tx.sale.update({ where: { id: sale.id }, data: { status: 'VOIDED' } });
      await tx.payment.updateMany({ where: { saleId: sale.id }, data: { status: 'REFUNDED' } });
      await tx.syncJob.create({ data: { companyId: input.companyId, provider: 'BUKKU', entityType: 'SALE', entityId: sale.id, action: 'SALE_VOIDED', direction: 'OUTBOUND', idempotencyKey: `bukku:sale-voided:${sale.id}`, payload: { event: 'SALE_VOIDED', saleId: sale.id, receiptNo, reason } } });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'SALE_VOIDED', entityType: 'Sale', entityId: sale.id, reason, before: { status: sale.status }, after: { status: 'VOIDED', stockRestored: true, receiptNo } } });
      return { id: sale.id, receiptNo: sale.receiptNo, status: 'VOIDED' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async markReceiptPrinted(receiptNo: string, input: MarkReceiptPrintedDto) {
    const [sale, actor] = await Promise.all([
      this.db.sale.findFirst({ where: { receiptNo, companyId: input.companyId } }),
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' } }),
    ]);
    if (!sale || !actor) throw new NotFoundException('Receipt or cashier was not found');
    const printedAt = new Date();
    await this.db.$transaction([
      this.db.sale.update({ where: { id: sale.id }, data: { printedAt } }),
      this.db.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'RECEIPT_PRINTED', entityType: 'Sale', entityId: sale.id, after: { receiptNo, printedAt } } }),
    ]);
    return { receiptNo, printedAt };
  }

  async printThermalReceipt(receiptNo: string, input: MarkReceiptPrintedDto) {
    const [sale, actor] = await Promise.all([
      this.db.sale.findFirst({ where: { receiptNo, companyId: input.companyId }, include: { company: true, location: true, register: true, cashier: { select: { name: true } }, items: { include: { uom: true } }, payments: true } }),
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!sale || !actor || !permissions.includes('checkout')) throw new NotFoundException('Receipt or cashier was not found');
    const printJob = await this.thermalPrinter.print(sale.company.printerConnectionMethod, this.receiptLines(sale), sale.company.receiptPaperWidthMm, this.printerSettings(sale.company));
    const printedAt = new Date();
    await this.db.$transaction([
      this.db.sale.update({ where: { id: sale.id }, data: { printedAt } }),
      this.db.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'RECEIPT_PRINTED_THERMAL', entityType: 'Sale', entityId: sale.id, after: { receiptNo, printedAt, transport: printJob.transport, printJobId: printJob.jobId } } }),
    ]);
    return { receiptNo, printedAt, transport: printJob.transport, printJobId: printJob.jobId };
  }

  async testThermalPrinter(input: MarkReceiptPrintedDto) {
    const [company, actor] = await Promise.all([
      this.db.company.findUnique({ where: { id: input.companyId } }),
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!company || !actor || !permissions.includes('printer.manage')) throw new NotFoundException('Printer settings access is required');
    const printJob = await this.thermalPrinter.print(company.printerConnectionMethod, [company.legalName || company.name, 'RetailOS printer test', new Date().toLocaleString('en-MY'), '--------------------------------', `Paper: ${company.receiptPaperWidthMm} mm`, `Transport: ${company.printerConnectionMethod}`, 'If this is readable, the PC print hub is ready.', '--------------------------------', 'Thank you'], company.receiptPaperWidthMm, this.printerSettings(company));
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'PRINTER_TEST_PRINTED', entityType: 'Printer', after: { transport: printJob.transport, printJobId: printJob.jobId } } });
    return { message: 'Test receipt sent to the PC printer queue.', transport: printJob.transport, printJobId: printJob.jobId };
  }

  async receiptPdf(receiptNo: string, companyId: string) {
    const sale = await this.db.sale.findFirst({ where: { receiptNo, companyId }, include: { company: true, location: true, register: true, cashier: { select: { name: true } }, items: { include: { uom: true } }, payments: true } });
    if (!sale) throw new NotFoundException('Receipt was not found');
    return this.simpleReceiptPdf(this.receiptLines(sale));
  }

  private printerSettings(company: { printerLanHost: string | null; printerLanPort: number; printerWindowsQueue: string | null; printerSerialPort: string | null; printerSerialBaudRate: number }) {
    return { lanHost: company.printerLanHost, lanPort: company.printerLanPort, windowsQueue: company.printerWindowsQueue, serialPort: company.printerSerialPort, serialBaudRate: company.printerSerialBaudRate };
  }

  private receiptLines(sale: { company: { name: string; legalName: string | null; brnNew: string | null; registrationNo: string | null; brnOld: string | null; tin: string | null; officePhone: string | null; phone: string | null; email: string | null; receiptFooter: string | null; receiptPaperWidthMm: number; printerConnectionMethod: string }; location: { name: string }; register: { name: string }; receiptNo: string; completedAt: Date | null; cashier: { name: string }; items: Array<{ description: string; quantity: Prisma.Decimal; uom: { name: string }; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }>; payments: Array<{ method: string; amount: Prisma.Decimal; tenderedAmount: Prisma.Decimal; changeAmount: Prisma.Decimal }>; subtotal: Prisma.Decimal; discountTotal: Prisma.Decimal; grandTotal: Prisma.Decimal }) {
    const moneyText = (value: Prisma.Decimal | number) => `RM${Number(value).toFixed(2)}`;
    return [
      sale.company.legalName || sale.company.name,
      sale.company.brnNew || sale.company.registrationNo ? `BRN: ${sale.company.brnNew || sale.company.registrationNo}${sale.company.brnOld ? ` (${sale.company.brnOld})` : ''}` : '',
      sale.company.tin ? `TIN: ${sale.company.tin}` : '',
      `Receipt No: ${sale.receiptNo}`,
      sale.completedAt?.toLocaleString('en-MY') || '',
      '--------------------------------',
      ...sale.items.flatMap((item) => [`${item.description}`, `${Number(item.quantity)} ${item.uom.name} x ${moneyText(item.unitPrice)}   ${moneyText(item.lineTotal)}`]),
      '--------------------------------',
      this.receiptTotalLine('Subtotal', moneyText(sale.subtotal)),
      this.receiptTotalLine('Discount', `-${moneyText(sale.discountTotal)}`),
      this.receiptTotalLine('Total', moneyText(sale.grandTotal)),
      ...sale.payments.flatMap((payment) => payment.method === 'CASH' ? [`Cash Received: ${moneyText(payment.tenderedAmount)}`, ...(Number(payment.changeAmount) ? [`Balance: ${moneyText(payment.changeAmount)}`] : [])] : [`${payment.method.replaceAll('_', ' ')}: ${moneyText(payment.amount)}`]),
      sale.company.officePhone ? `Office No.: ${sale.company.officePhone}` : '',
      sale.company.phone ? `Phone No.: ${sale.company.phone}` : '',
      sale.company.email ? `Email: ${sale.company.email}` : '',
      'Returns, refunds and exchanges: until end of next working day only.',
      'Operating hours: Mon-Sat, 8:30 AM-5:00 PM',
      sale.company.receiptFooter || 'Thank you for shopping with us!',
    ].filter(Boolean);
  }

  private receiptTotalLine(label: string, amount: string) { return `${label}${' '.repeat(Math.max(1, 42 - label.length - amount.length))}${amount}`; }

  private async complete(tx: Prisma.TransactionClient, input: CheckoutDto) {
    const [company, location, register, cashier, priceLevel] = await Promise.all([
      tx.company.findUnique({ where: { id: input.companyId } }),
      tx.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } }),
      tx.register.findFirst({ where: { id: input.registerId, locationId: input.locationId } }),
      tx.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' } }),
      tx.priceLevel.findFirst({ where: { id: input.priceLevelId, companyId: input.companyId } }),
    ]);
    if (!company || !location || !register || !cashier || !priceLevel) throw new BadRequestException('Invalid company, location, register, cashier, or price level');
    if (input.customerId && !await tx.customer.findFirst({ where: { id: input.customerId, companyId: input.companyId } })) throw new BadRequestException('Customer does not belong to this company');
    if (input.shiftId && !await tx.shift.findFirst({ where: { id: input.shiftId, registerId: input.registerId, cashierId: input.cashierId, closedAt: null } })) throw new BadRequestException('Shift is not open for this cashier and register');
    const exchangeReturn = input.exchangeReturnId ? await tx.return.findFirst({ where: { id: input.exchangeReturnId, companyId: input.companyId, type: 'EXCHANGE', status: 'COMPLETED', replacementSaleId: null }, include: { storeCredit: true } }) : null;
    if (input.exchangeReturnId && !exchangeReturn?.storeCredit) throw new BadRequestException('Exchange credit is unavailable for this replacement sale');
    if (exchangeReturn && !input.payments.some((payment) => payment.storeCreditId === exchangeReturn.storeCredit?.id)) throw new BadRequestException('Replacement sale must apply the exchange store credit');

    if (input.saleDiscount) await this.assertApproval(input.saleDiscount, input.companyId, tx);
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await tx.product.findMany({ where: { id: { in: productIds }, companyId: input.companyId, active: true }, include: { uoms: true, prices: { where: { priceLevelId: input.priceLevelId } } } });
    const byId = new Map(products.map((product) => [product.id, product]));
    const priced = input.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new NotFoundException(`Product ${item.productId} is unavailable`);
      const uom = product.uoms.find((value) => value.id === item.uomId);
      const price = product.prices.find((value) => value.uomId === item.uomId);
      if (!uom || !price) throw new BadRequestException(`UOM or price is missing for ${product.name}`);
      return { product, uom, quantity: item.quantity, unitPrice: Number(price.amount), discount: item.discount };
    });
    for (const item of priced) {
      if (!item.discount) continue;
      if (this.requiresDiscountApproval({ ...item, discount: item.discount })) await this.assertApproval(item.discount, input.companyId, tx);
    }
    const totals = calculateCheckout(priced, input.saleDiscount);
    const payments = settlePayments(input.payments, totals.grandTotalCents);
    const exchangeCreditPayment = exchangeReturn?.storeCredit ? payments.find((payment) => payment.method === 'STORE_CREDIT' && payment.storeCreditId === exchangeReturn.storeCredit?.id) : undefined;
    if (exchangeReturn?.storeCredit) {
      const expectedCredit = Math.min(Number(exchangeReturn.storeCredit.balance), totals.grandTotal);
      if (Math.abs(Number(exchangeCreditPayment?.amount ?? 0) - expectedCredit) > 0.00001) throw new BadRequestException('Replacement sale must apply the available exchange credit first');
      const remainingCredit = Math.round((Number(exchangeReturn.storeCredit.balance) - expectedCredit) * 100) / 100;
      if (input.exchangeRefund) {
        if (Math.abs(input.exchangeRefund.amount - remainingCredit) > 0.00001) throw new BadRequestException('Exchange refund must equal the unused exchange credit');
        if (input.exchangeRefund.method === 'CASH') {
          if (!input.shiftId || exchangeReturn.shiftId !== input.shiftId) throw new BadRequestException('Cash exchange refunds must be processed in the same open shift');
          const shift = await tx.shift.findFirst({ where: { id: input.shiftId, registerId: input.registerId, cashierId: input.cashierId, closedAt: null } });
          if (!shift) throw new BadRequestException('Open shift not found for cash exchange refund');
        }
      } else if (remainingCredit > 0) {
        // Leaving the difference on the exchange credit is explicit and needs no extra payment record.
      }
    } else if (input.exchangeRefund) throw new BadRequestException('Exchange refund requires an exchange return');
    const receiptNo = await this.nextReceiptNo(tx, location.id, location.code, company.timezone);
    const now = new Date();
    const sale = await tx.sale.create({ data: {
      companyId: input.companyId, locationId: input.locationId, registerId: input.registerId,
      cashierId: input.cashierId, customerId: input.customerId, priceLevelId: input.priceLevelId,
      shiftId: input.shiftId, receiptNo, status: 'COMPLETED', subtotal: totals.subtotal,
      discountTotal: totals.discountTotal, taxTotal: 0, grandTotal: totals.grandTotal,
      offlineId: input.offlineId, deviceId: input.deviceId, completedAt: now, eInvoiceRequestToken: EInvoiceController.token(),
    }});
    if (exchangeReturn) await tx.return.update({ where: { id: exchangeReturn.id }, data: { replacementSaleId: sale.id } });

    for (let index = 0; index < priced.length; index++) {
      const item = priced[index];
      const line = totals.lines[index];
      const baseQuantity = new Prisma.Decimal(item.quantity).mul(item.uom.conversionFactor);
      if (item.product.trackStock) {
        // Keep trading when a physical count is not yet updated. The negative
        // balance is an intentional, auditable stock-shortage signal for shift close.
        const previous = await tx.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: input.locationId, productId: item.product.id } } });
        const remaining = Number(previous?.quantity ?? 0) - Number(baseQuantity);
        await tx.stockSnapshot.upsert({
          where: { locationId_productId: { locationId: input.locationId, productId: item.product.id } },
          update: { quantity: { decrement: baseQuantity }, capturedAt: now },
          create: { locationId: input.locationId, productId: item.product.id, quantity: baseQuantity.negated(), capturedAt: now },
        });
        if (remaining < 0) await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'STOCK_SHORTAGE_SOLD', entityType: 'Product', entityId: item.product.id, after: { saleId: sale.id, productName: item.product.name, previousQuantity: Number(previous?.quantity ?? 0), quantitySold: Number(baseQuantity), remainingQuantity: remaining, locationId: input.locationId } } });
      }
      const saleItem = await tx.saleItem.create({ data: {
        saleId: sale.id, productId: item.product.id, uomId: item.uom.id, description: item.product.name,
        quantity: item.quantity, baseQuantity, unitPrice: item.unitPrice,
        lineDiscount: line.lineDiscountCents / 100, taxAmount: 0, lineTotal: line.lineTotalCents / 100,
      }});
      if (item.discount) await tx.discountOverride.create({ data: {
        saleId: sale.id, saleItemId: saleItem.id, scope: 'LINE', type: item.discount.type,
        inputValue: item.discount.value, amount: line.lineDiscountCents / 100,
        reason: item.discount.reason?.trim() || 'Item discount', approvedById: item.discount.approvedById,
      }});
    }
    if (input.saleDiscount) await tx.discountOverride.create({ data: {
      saleId: sale.id, scope: 'SALE', type: input.saleDiscount.type, inputValue: input.saleDiscount.value,
      amount: totals.saleDiscount, reason: input.saleDiscount.reason?.trim() || 'Sale discount', approvedById: input.saleDiscount.approvedById,
    }});
    for (const payment of payments) {
      if (payment.method !== 'STORE_CREDIT') continue;
      if (!payment.storeCreditId) throw new BadRequestException('Store credit payment requires a storeCreditId');
      const applied = await tx.storeCredit.updateMany({ where: { id: payment.storeCreditId, companyId: input.companyId, balance: { gte: payment.amount } }, data: { balance: { decrement: payment.amount } } });
      if (applied.count !== 1) throw new ConflictException('Store credit is unavailable or has insufficient balance');
    }
    if (exchangeReturn && input.exchangeRefund) {
      const refunded = await tx.storeCredit.updateMany({ where: { id: exchangeReturn.storeCredit!.id, companyId: input.companyId, balance: { gte: input.exchangeRefund.amount } }, data: { balance: { decrement: input.exchangeRefund.amount } } });
      if (refunded.count !== 1) throw new ConflictException('The exchange credit is no longer available for refund');
      await tx.returnPayment.create({ data: { returnId: exchangeReturn.id, method: input.exchangeRefund.method, amount: input.exchangeRefund.amount, reference: `exchange-difference:${sale.id}` } });
      await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'EXCHANGE_DIFFERENCE_REFUNDED', entityType: 'Return', entityId: exchangeReturn.id, after: { replacementSaleId: sale.id, amount: input.exchangeRefund.amount, method: input.exchangeRefund.method } } });
    }
    await tx.payment.createMany({ data: payments.map((payment) => ({ saleId: sale.id, method: payment.method as never, amount: payment.amount, tenderedAmount: payment.tenderedAmount, changeAmount: payment.changeAmount, reference: payment.reference ?? (payment.storeCreditId ? `store-credit:${payment.storeCreditId}` : undefined) })) });
    await tx.syncJob.create({ data: { companyId: input.companyId, provider: 'BUKKU', entityType: 'SALE', entityId: sale.id, action: 'SALE_COMPLETED', direction: 'OUTBOUND', idempotencyKey: `bukku:sale-completed:${sale.id}`, payload: { event: 'SALE_COMPLETED', saleId: sale.id } } });
    await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'CHECKOUT_COMPLETED', entityType: 'Sale', entityId: sale.id, after: { receiptNo, totals }, metadata: { offlineId: input.offlineId, deviceId: input.deviceId, exchangeReturnId: input.exchangeReturnId, exchangeRefund: input.exchangeRefund ? { amount: input.exchangeRefund.amount, method: input.exchangeRefund.method } : undefined } } });
    return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: this.saleInclude() });
  }

  private requiresDiscountApproval(item: { product: { basePurchaseCost: Prisma.Decimal | null }; uom: { conversionFactor: Prisma.Decimal }; quantity: number; unitPrice: number; discount: { type: 'PERCENTAGE' | 'FIXED'; value: number } }) {
    if (item.product.basePurchaseCost == null) return false;
    const gross = item.quantity * item.unitPrice;
    const discount = item.discount.type === 'PERCENTAGE' ? gross * Math.min(item.discount.value, 100) / 100 : item.discount.value;
    const finalUnitPrice = (gross - Math.min(gross, discount)) / item.quantity;
    const unitCost = Number(item.product.basePurchaseCost) * Number(item.uom.conversionFactor);
    return finalUnitPrice < unitCost - 0.00001;
  }

  private async assertApproval(discount: { approvedById?: string; reason?: string } | undefined, companyId: string, tx: Prisma.TransactionClient) {
    if (!discount) return;
    if (!discount.approvedById) throw new BadRequestException('A manager PIN is required because this discount is below cost');
    const approver = await tx.user.findFirst({ where: { id: discount.approvedById, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(approver?.role.permissions) ? approver.role.permissions : [];
    if (!approver || !permissions.includes('discount.approve')) throw new BadRequestException('Discount requires an authorized approver');
  }

  private async nextReceiptNo(tx: Prisma.TransactionClient, locationId: string, code: string, timezone: string) {
    const dateText = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      const receiptNo = `${code}-${dateText.replaceAll('-', '')}-${suffix}`;
      const exists = await tx.sale.findFirst({ where: { receiptNo }, select: { id: true } });
      if (!exists) return receiptNo;
    }
    throw new ConflictException('Could not allocate a unique receipt number. Please try checkout again.');
  }

  private simpleReceiptPdf(lines: string[]) {
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '?');
    const separatorIndex = lines.indexOf('--------------------------------');
    const wrap = (line: string) => line.length > 38 ? line.match(/.{1,38}(?:\s|$)|.{1,38}/g) ?? [line] : [line];
    let y = 822;
    const commands = ['0.45 w'];
    lines.slice(0, 55).forEach((line, index) => {
      if (line === '--------------------------------') { commands.push(`18 ${y} m 208 ${y} l S`); y -= 11; return; }
      const centred = index === 0 || (separatorIndex > 0 && index < separatorIndex);
      const bold = index === 0 || line.startsWith('Total:') || line.startsWith('Receipt:');
      wrap(line).forEach((part) => {
        const x = centred ? Math.max(18, 113 - part.length * 2.3) : 18;
        commands.push(`BT /F${bold ? '2' : '1'} 9 Tf ${x.toFixed(1)} ${y} Td (${escape(part)}) Tj ET`);
        y -= 12;
      });
      y -= 1;
    });
    const content = `${commands.join('\n')}\n`;
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 226 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}endstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];
    const header = '%PDF-1.4\n%âãÏÓ\n';
    let output = header;
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, 'utf8')); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(output, 'utf8');
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(output, 'utf8');
  }

  private saleInclude() { return { items: { include: { uom: true, discounts: true } }, payments: true, discounts: true, customer: true, cashier: { select: { id: true, name: true } } } as const; }
}

