import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { calculateCheckout, receiptHistoryPaymentAmount, settlePayments } from './checkout-calculator';
import { aggregateStockRequests } from './stock-control';
import { CheckoutDto, MarkReceiptPrintedDto, VoidSaleDto } from './dto/checkout.dto';
import { EInvoiceController } from '../einvoice/einvoice.controller';
import { ThermalPrinterService } from './thermal-printer.service';
import { canonicalReceipt, receiptLines } from './receipt-renderer';
import { latestInventoryCost, recordInventoryLedger, setSaleItemCost } from '../inventory/inventory-ledger';
import { allocateFifoSale, assertFifoStockInvariant } from '../inventory/fifo';

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
      payments: sale.payments.map((payment) => ({ method: payment.method, amount: receiptHistoryPaymentAmount({ method: payment.method, amount: Number(payment.amount), changeAmount: Number(payment.changeAmount) }) })),
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
      if (!actor || !permissions.includes('sale.void')) throw new ForbiddenException('Manager approval is required to void a receipt');
      if (!sale) throw new NotFoundException('Receipt was not found');
      if (sale.status !== 'COMPLETED') throw new BadRequestException('Only completed receipts can be voided');
      if (sale.returns.length) throw new BadRequestException('This receipt already has a return. Use the return workflow instead of voiding it.');
      const restored = new Map<string, { item: typeof sale.items[number]; quantity: Prisma.Decimal; value: Prisma.Decimal | null }>();
      for (const item of sale.items) {
        if (!item.product.trackStock) continue;
        const current = restored.get(item.productId);
        const costedItem = item as typeof item & { unitCost: Prisma.Decimal | null };
        const itemValue = costedItem.unitCost == null ? null : new Prisma.Decimal(costedItem.unitCost).mul(item.baseQuantity);
        if (current) { current.quantity = current.quantity.add(item.baseQuantity); current.value = current.value == null || itemValue == null ? null : current.value.add(itemValue); }
        else restored.set(item.productId, { item, quantity: item.baseQuantity, value: itemValue });
      }
      for (const [productId, restore] of restored) {
        const before = await tx.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: sale.locationId, productId } } });
        const pre = before?.quantity ?? new Prisma.Decimal(0);
        const post = pre.add(restore.quantity);
        await tx.stockSnapshot.upsert({ where: { locationId_productId: { locationId: sale.locationId, productId } }, update: { quantity: post, capturedAt: new Date() }, create: { locationId: sale.locationId, productId, quantity: post } });
        const latest = await latestInventoryCost(tx, input.companyId, sale.locationId, productId);
        const costedItem = restore.item as typeof restore.item & { unitCost: Prisma.Decimal | null };
        const unitCost = costedItem.unitCost ?? latest?.averageUnitCost ?? restore.item.product.basePurchaseCost;
        const valueDelta = restore.value ?? (unitCost == null ? null : restore.quantity.mul(unitCost));
        const priorValue = latest?.runningValue ?? (unitCost == null ? null : pre.mul(unitCost));
        const status = unitCost == null ? 'UNVALUED' : post.lessThan(0) || !latest ? 'PROVISIONAL' : latest.costStatus;
        await recordInventoryLedger(tx, { companyId: input.companyId, locationId: sale.locationId, productId, saleItemId: restore.item.id, actorId: actor.id, type: 'VOID', quantityDelta: restore.quantity, unitCost, valueDelta, runningQuantity: post, runningValue: priorValue == null || valueDelta == null ? null : priorValue.add(valueDelta), averageUnitCost: unitCost, costStatus: status, referenceType: 'VOID', referenceId: sale.id, reason });
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
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    if (!sale) throw new NotFoundException('Receipt was not found');
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('checkout')) throw new ForbiddenException('Receipt printing permission is required');
    const printedAt = new Date();
    await this.db.$transaction([
      this.db.sale.update({ where: { id: sale.id }, data: { printedAt } }),
      this.db.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'RECEIPT_PRINTED', entityType: 'Sale', entityId: sale.id, after: { receiptNo, printedAt } } }),
    ]);
    return { receiptNo, printedAt };
  }

  async printThermalReceipt(receiptNo: string, input: MarkReceiptPrintedDto) {
    const [sale, actor] = await Promise.all([
      this.db.sale.findFirst({ where: { receiptNo, companyId: input.companyId }, include: { company: true, location: true, register: true, cashier: { select: { name: true } }, items: { include: { uom: true, product: { select: { sku: true } } } }, payments: true } }),
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!sale) throw new NotFoundException('Receipt was not found');
    if (!actor || !permissions.includes('checkout')) throw new ForbiddenException('Receipt printing permission is required');
    if (sale.status !== 'COMPLETED' && sale.status !== 'VOIDED') throw new BadRequestException('Only a committed receipt can be printed.');
    const job = await this.db.printJob.create({ data: { companyId: input.companyId, saleId: sale.id, printerProfile: sale.company.printerProfileName, transport: sale.company.printerConnectionMethod, kind: 'RECEIPT', reprint: Boolean(sale.printedAt), createdById: actor.id } });
    try {
      await this.db.printJob.update({ where: { id: job.id }, data: { status: 'SENDING', sendingAt: new Date(), attempts: { increment: 1 } } });
      let printJob;
      const document = canonicalReceipt(sale, sale.status === 'VOIDED' ? 'VOID' : job.reprint ? 'REPRINT' : 'ORIGINAL');
      try { printJob = await this.thermalPrinter.print(sale.company.printerConnectionMethod, receiptLines(document), document.widthMm, { ...this.printerSettings(sale.company), includeLogo: document.showLogo }); }
      catch (error) {
        if (!sale.company.printerFallbackMethod) throw error;
        printJob = await this.thermalPrinter.print(sale.company.printerFallbackMethod, receiptLines(document), document.widthMm, { ...this.printerSettings(sale.company), includeLogo: document.showLogo, lanHost: sale.company.printerFallbackLanHost, lanPort: sale.company.printerFallbackLanPort ?? undefined });
      }
      const printedAt = new Date();
      await this.db.$transaction([
        this.db.sale.update({ where: { id: sale.id }, data: { printedAt } }),
        this.db.printJob.update({ where: { id: job.id }, data: { status: 'PRINTED', printedAt, lastError: null, transport: printJob.transport } }),
        this.db.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'RECEIPT_PRINTED_THERMAL', entityType: 'Sale', entityId: sale.id, after: { receiptNo, printedAt, transport: printJob.transport, printJobId: job.id, reprint: job.reprint } } }),
      ]);
      return { receiptNo, printedAt, transport: printJob.transport, printJobId: job.id, status: 'PRINTED' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db.printJob.update({ where: { id: job.id }, data: { status: 'FAILED', failedAt: new Date(), lastError: message } });
      await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'RECEIPT_PRINT_FAILED', entityType: 'Sale', entityId: sale.id, after: { receiptNo, printJobId: job.id, error: message } } });
      throw error;
    }
  }

  async testThermalPrinter(input: MarkReceiptPrintedDto) {
    const [company, actor] = await Promise.all([
      this.db.company.findUnique({ where: { id: input.companyId } }),
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!company) throw new NotFoundException('Company was not found');
    if (!actor || !permissions.includes('printer.manage')) throw new ForbiddenException('Printer settings access is required');
    const printJob = await this.thermalPrinter.print(company.printerConnectionMethod, [company.legalName || company.name, 'RetailOS printer test', '打印机中文测试', new Date().toLocaleString('en-MY'), '--------------------------------', `Paper: ${company.receiptPaperWidthMm} mm`, `Transport: ${company.printerConnectionMethod}`, 'BOLD / barcode / QR capability test', 'If this is readable, the PC print hub is ready.', '--------------------------------', 'Thank you / 谢谢'], company.receiptPaperWidthMm, this.printerSettings(company));
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: actor.id, action: 'PRINTER_TEST_PRINTED', entityType: 'Printer', after: { transport: printJob.transport, printJobId: printJob.jobId } } });
    return { message: 'Test receipt sent to the PC printer queue.', transport: printJob.transport, printJobId: printJob.jobId };
  }

  async printerHealth(input: MarkReceiptPrintedDto) {
    const [company, actor] = await Promise.all([
      this.db.company.findUnique({ where: { id: input.companyId } }),
      this.db.user.findFirst({ where: { id: input.actorId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!company) throw new NotFoundException('Company was not found');
    if (!actor || !permissions.includes('printer.manage')) throw new ForbiddenException('Printer settings access is required');
    const health = await this.thermalPrinter.health(company.printerConnectionMethod, this.printerSettings(company));
    const lastPrint = await this.db.auditLog.findFirst({ where: { companyId: input.companyId, action: { in: ['RECEIPT_PRINTED_THERMAL', 'PRINTER_TEST_PRINTED'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    return { profileName: company.printerProfileName, ...health, lastSuccessfulPrint: lastPrint?.createdAt ?? null };
  }

  async receiptPdf(receiptNo: string, companyId: string) {
    const sale = await this.db.sale.findFirst({ where: { receiptNo, companyId }, include: { company: true, location: true, register: true, cashier: { select: { name: true } }, items: { include: { uom: true, product: { select: { sku: true } } } }, payments: true } });
    if (!sale) throw new NotFoundException('Receipt was not found');
    return this.simpleReceiptPdf(receiptLines(canonicalReceipt(sale, sale.status === 'VOIDED' ? 'VOID' : sale.printedAt ? 'REPRINT' : 'ORIGINAL')));
  }

  async receiptDocument(receiptNo: string, companyId: string) {
    const sale = await this.db.sale.findFirst({ where: { receiptNo, companyId }, include: { company: true, location: true, register: true, cashier: { select: { name: true } }, items: { include: { uom: true, product: { select: { sku: true } } } }, payments: true } });
    if (!sale) throw new NotFoundException('Receipt was not found');
    return { ...canonicalReceipt(sale, sale.status === 'VOIDED' ? 'VOID' : sale.printedAt ? 'REPRINT' : 'ORIGINAL'), lines: receiptLines(canonicalReceipt(sale, sale.status === 'VOIDED' ? 'VOID' : sale.printedAt ? 'REPRINT' : 'ORIGINAL')) };
  }

  private printerSettings(company: { printerLanHost: string | null; printerLanPort: number; printerWindowsQueue: string | null; printerSerialPort: string | null; printerSerialBaudRate: number }) {
    return { lanHost: company.printerLanHost, lanPort: company.printerLanPort, windowsQueue: company.printerWindowsQueue, serialPort: company.printerSerialPort, serialBaudRate: company.printerSerialBaudRate };
  }

  private async complete(tx: Prisma.TransactionClient, input: CheckoutDto) {
    const [company, location, register, cashier, priceLevel] = await Promise.all([
      tx.company.findUnique({ where: { id: input.companyId } }),
      tx.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } }),
      tx.register.findFirst({ where: { id: input.registerId, locationId: input.locationId } }),
      tx.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
      tx.priceLevel.findFirst({ where: { id: input.priceLevelId, companyId: input.companyId } }),
    ]);
    if (!company || !location || !register || !cashier || !priceLevel) throw new BadRequestException('Invalid company, location, register, cashier, or price level');
    const cashierPermissions = Array.isArray(cashier.role.permissions) ? cashier.role.permissions : [];
    if (!cashierPermissions.includes('checkout')) throw new ForbiddenException('Checkout permission is required');
    if (input.customerId && !await tx.customer.findFirst({ where: { id: input.customerId, companyId: input.companyId } })) throw new BadRequestException('Customer does not belong to this company');
    // This check deliberately happens inside the same serializable transaction as
    // the sale, payment, receipt and inventory writes.  A client-provided shift ID
    // is never enough: it must be the open shift for this exact company, location,
    // register and cashier.
    const activeShift = await tx.shift.findFirst({
      where: {
        id: input.shiftId,
        locationId: input.locationId,
        registerId: input.registerId,
        cashierId: input.cashierId,
        closedAt: null,
        location: { companyId: input.companyId },
      },
      select: { id: true },
    });
    if (!activeShift) throw new BadRequestException('Open a shift before checkout. The selected shift is not open for this cashier and register.');
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
      return { product, uom, quantity: item.quantity, unitPrice: Number(price.amount), discount: item.discount, fifoOverride: item.fifoOverride };
    });
    for (const item of priced) {
      if (item.discount && this.requiresDiscountApproval({ ...item, discount: item.discount })) await this.assertApproval(item.discount, input.companyId, tx);
      if (item.fifoOverride) await this.assertFifoOverride(item.fifoOverride, input.companyId, tx);
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
    const stockRequests = aggregateStockRequests(priced.map((item) => ({
      productId: item.product.id,
      productName: item.product.name,
      sku: item.product.sku,
      trackStock: item.product.trackStock,
      baseQuantity: new Prisma.Decimal(String(item.quantity)).mul(item.uom.conversionFactor),
    })));
    const costByProduct = new Map<string, { unitCost: Prisma.Decimal | null; cogs: Prisma.Decimal | null; status: 'FINAL' | 'PROVISIONAL' | 'UNVALUED'; pre: Prisma.Decimal; post: Prisma.Decimal; previousValue: Prisma.Decimal | null }>();
    const stockShortages: Array<{ productId: string; sku: string; productName: string; preSaleQuantity: Prisma.Decimal; soldQuantity: Prisma.Decimal; postSaleQuantity: Prisma.Decimal; shortageIntroduced: Prisma.Decimal; shortageBalance: Prisma.Decimal }> = [];
    for (const request of stockRequests) {
      const snapshot = await tx.stockSnapshot.findUnique({ where: { locationId_productId: { locationId: input.locationId, productId: request.productId } } });
      const availableQuantity = snapshot?.quantity ?? new Prisma.Decimal(0);
      const remainingQuantity = availableQuantity.minus(request.baseQuantity);
      const latestCost = await latestInventoryCost(tx, input.companyId, input.locationId, request.productId);
      const product = byId.get(request.productId)!;
      const unitCost = latestCost?.averageUnitCost ?? product.basePurchaseCost;
      const status = unitCost == null ? 'UNVALUED' : remainingQuantity.lessThan(0) || !latestCost ? 'PROVISIONAL' : latestCost.costStatus;
      const previousValue = latestCost?.runningValue ?? (unitCost == null ? null : availableQuantity.mul(unitCost));
      costByProduct.set(request.productId, { unitCost, cogs: unitCost == null ? null : request.baseQuantity.mul(unitCost), status, pre: availableQuantity, post: remainingQuantity, previousValue });
      await tx.stockSnapshot.upsert({ where: { locationId_productId: { locationId: input.locationId, productId: request.productId } }, update: { quantity: remainingQuantity, capturedAt: now }, create: { locationId: input.locationId, productId: request.productId, quantity: remainingQuantity } });
      if (remainingQuantity.lessThan(0)) stockShortages.push({
        productId: request.productId,
        sku: request.sku,
        productName: request.productName,
        preSaleQuantity: availableQuantity,
        soldQuantity: request.baseQuantity,
        postSaleQuantity: remainingQuantity,
        // If stock was already negative, this sale introduces only the units sold;
        // the larger ending negative balance is retained separately for follow-up.
        shortageIntroduced: availableQuantity.greaterThan(0) ? request.baseQuantity.minus(availableQuantity) : request.baseQuantity,
        shortageBalance: remainingQuantity.abs(),
      });
    }
    const eInvoiceRequestToken = company.customerEInvoiceRequestsEnabled ? EInvoiceController.token() : null;
    const sale = await tx.sale.create({ data: {
      companyId: input.companyId, locationId: input.locationId, registerId: input.registerId,
      cashierId: input.cashierId, customerId: input.customerId, priceLevelId: input.priceLevelId,
      shiftId: input.shiftId, receiptNo, status: 'COMPLETED', subtotal: totals.subtotal,
      discountTotal: totals.discountTotal, taxTotal: 0, grandTotal: totals.grandTotal,
      offlineId: input.offlineId, deviceId: input.deviceId, completedAt: now, eInvoiceRequestToken,
    }});
    await tx.sale.update({ where: { id: sale.id }, data: { receiptSnapshot: { version: 1, company: { name: company.name, legalName: company.legalName, registrationNo: company.registrationNo, brnNew: company.brnNew, brnOld: company.brnOld, tin: company.tin, address: company.address, officePhone: company.officePhone, phone: company.phone, email: company.email, receiptFooter: company.receiptFooter }, presentation: { receiptPaperWidthMm: company.receiptPaperWidthMm, receiptTemplate: company.receiptTemplate, receiptDividerStyle: company.receiptDividerStyle, receiptShowLogo: company.receiptShowLogo, receiptShowSku: company.receiptShowSku, receiptChineseMode: company.receiptChineseMode }, eInvoiceRequestToken } } });
    if (exchangeReturn) await tx.return.update({ where: { id: exchangeReturn.id }, data: { replacementSaleId: sale.id } });

    const firstSaleItemByProduct = new Map<string, string>();
    const fifoCostByProduct = new Map<string, { cogs: Prisma.Decimal | null; status: 'FINAL' | 'PROVISIONAL' | 'UNVALUED' }>();
    for (let index = 0; index < priced.length; index++) {
      const item = priced[index];
      const line = totals.lines[index];
      const baseQuantity = new Prisma.Decimal(item.quantity).mul(item.uom.conversionFactor);
      const cost = item.product.trackStock ? costByProduct.get(item.product.id) : undefined;
      const saleItem = await tx.saleItem.create({ data: {
        saleId: sale.id, productId: item.product.id, uomId: item.uom.id, description: item.product.name,
        quantity: item.quantity, baseQuantity, unitPrice: item.unitPrice,
        lineDiscount: line.lineDiscountCents / 100, taxAmount: 0, lineTotal: line.lineTotalCents / 100,
      }});
      const fifo = item.product.trackStock && item.product.fifoEnabledAt ? await allocateFifoSale(tx, { companyId: input.companyId, locationId: input.locationId, productId: item.product.id, uomId: item.uom.id, saleItemId: saleItem.id, quantity: baseQuantity, actorId: input.cashierId, receiptNo, occurredAt: now, fallbackUnitCost: cost?.unitCost ?? null, override: item.fifoOverride }) : null;
      const itemCogs = fifo ? fifo.cogs : cost?.unitCost == null ? null : baseQuantity.mul(cost.unitCost); const itemUnitCost = fifo ? fifo.blendedUnitCost : cost?.unitCost ?? null; const itemStatus = fifo?.status ?? cost?.status ?? 'UNVALUED';
      await setSaleItemCost(tx, saleItem.id, itemUnitCost, itemCogs, itemStatus);
      if (fifo) { const aggregate = fifoCostByProduct.get(item.product.id); fifoCostByProduct.set(item.product.id, { cogs: !aggregate ? fifo.cogs : aggregate.cogs == null || fifo.cogs == null ? null : aggregate.cogs.add(fifo.cogs), status: aggregate?.status === 'UNVALUED' || fifo.status === 'UNVALUED' ? 'UNVALUED' : aggregate?.status === 'PROVISIONAL' || fifo.status === 'PROVISIONAL' ? 'PROVISIONAL' : 'FINAL' }); }
      if (!firstSaleItemByProduct.has(item.product.id)) firstSaleItemByProduct.set(item.product.id, saleItem.id);
      if (item.discount) await tx.discountOverride.create({ data: {
        saleId: sale.id, saleItemId: saleItem.id, scope: 'LINE', type: item.discount.type,
        inputValue: item.discount.value, amount: line.lineDiscountCents / 100,
        reason: item.discount.reason?.trim() || 'Item discount', approvedById: item.discount.approvedById,
      }});
    }
    for (const request of stockRequests) {
      const cost = costByProduct.get(request.productId)!;
      const fifoCost = fifoCostByProduct.get(request.productId); if (fifoCost) { cost.cogs = fifoCost.cogs; cost.unitCost = fifoCost.cogs == null ? null : fifoCost.cogs.div(request.baseQuantity); cost.status = fifoCost.status; }
      const valueDelta = cost.cogs == null ? null : cost.cogs.negated();
      const fifoEnabled = Boolean(byId.get(request.productId)?.fifoEnabledAt); const fifoValue = fifoEnabled ? await tx.$queryRaw<Array<{ value: Prisma.Decimal | null }>>(Prisma.sql`SELECT SUM("remainingQuantity" * "finalUnitCost") AS "value" FROM "InventoryBatch" WHERE "companyId"=${input.companyId} AND "locationId"=${input.locationId} AND "productId"=${request.productId} AND "status" IN ('POSTED','SHORTAGE')`) : []; const runningValue = fifoEnabled ? fifoValue[0]?.value ?? null : cost.previousValue == null || valueDelta == null ? null : cost.previousValue.add(valueDelta);
      await recordInventoryLedger(tx, { companyId: input.companyId, locationId: input.locationId, productId: request.productId, saleItemId: firstSaleItemByProduct.get(request.productId), actorId: input.cashierId, type: 'SALE', quantityDelta: request.baseQuantity.negated(), unitCost: cost.unitCost, valueDelta, runningQuantity: cost.post, runningValue, averageUnitCost: fifoEnabled ? null : cost.unitCost, costStatus: cost.status, referenceType: 'SALE', referenceId: sale.id, reason: `Completed receipt ${receiptNo}`, createdAt: now });
      if (fifoEnabled) await assertFifoStockInvariant(tx, { companyId: input.companyId, locationId: input.locationId, productId: request.productId });
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
    for (const shortage of stockShortages) await tx.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'STOCK_SHORTAGE_SOLD', entityType: 'SaleItem', entityId: sale.id, after: { ...shortage, preSaleQuantity: shortage.preSaleQuantity.toFixed(), soldQuantity: shortage.soldQuantity.toFixed(), postSaleQuantity: shortage.postSaleQuantity.toFixed(), shortageIntroduced: shortage.shortageIntroduced.toFixed(), shortageBalance: shortage.shortageBalance.toFixed(), receiptNo, shiftId: input.shiftId, timestamp: now.toISOString() } } });
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

  private async assertFifoOverride(override: { batchId: string; reason: string; approvedById: string }, companyId: string, tx: Prisma.TransactionClient) {
    if (!override.reason.trim()) throw new BadRequestException('FIFO override requires a reason');
    const approver = await tx.user.findFirst({ where: { id: override.approvedById, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(approver?.role.permissions) ? approver.role.permissions.filter((permission): permission is string => typeof permission === 'string') : [];
    if (!approver || !permissions.some((permission) => ['stock.adjust', 'backoffice.view', 'company.manage'].includes(permission))) throw new ForbiddenException('FIFO override requires an authorized manager');
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

