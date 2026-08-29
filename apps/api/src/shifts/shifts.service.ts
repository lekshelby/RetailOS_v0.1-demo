import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { PrismaService } from '../database/prisma.service';
import { reconcileCash } from './shift-calculator';
import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/shift.dto';
import { BukkuAutoSyncService } from '../integrations/bukku/bukku-auto-sync.service';
import { ThermalPrinterService } from '../checkout/thermal-printer.service';
import { writeXlsx, XlsxSheet } from './xlsx-writer';

@Injectable()
export class ShiftsService {
  constructor(private readonly db: PrismaService, private readonly bukkuSync: BukkuAutoSyncService, private readonly thermalPrinter: ThermalPrinterService) {}

  async open(input: OpenShiftDto) {
    const [location, register, cashier] = await Promise.all([
      this.db.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } }),
      this.db.register.findFirst({ where: { id: input.registerId, locationId: input.locationId } }),
      this.db.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' } }),
    ]);
    if (!location || !register || !cashier) throw new BadRequestException('Invalid store, register, or cashier');
    const existing = await this.db.shift.findFirst({ where: { registerId: input.registerId, closedAt: null } });
    if (existing) throw new ConflictException('This register already has an open shift');
    const shift = await this.db.shift.create({ data: { locationId: location.id, registerId: register.id, cashierId: cashier.id, openingFloat: input.openingFloat } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: cashier.id, action: 'SHIFT_OPENED', entityType: 'Shift', entityId: shift.id, after: { openingFloat: input.openingFloat, register: register.code } } });
    void this.bukkuSync.syncForOpenedShift(input.companyId, cashier.id).catch(() => undefined);
    return this.status(shift.id, input.companyId);
  }

  async current(registerId: string, companyId: string) {
    const shift = await this.db.shift.findFirst({ where: { registerId, closedAt: null, location: { companyId } }, orderBy: { openedAt: 'desc' } });
    if (!shift) throw new NotFoundException('No open shift for this register');
    return this.status(shift.id, companyId);
  }

  async history(companyId: string, actorId: string, registerId?: string) {
    const actor = await this.db.user.findFirst({ where: { id: actorId, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('shift.report.view')) throw new NotFoundException('Manager access is required for shift reports');
    const shifts = await this.db.shift.findMany({ where: { closedAt: { not: null }, location: { companyId }, ...(registerId ? { registerId } : {}) }, include: { location: true, register: true, cashier: { select: { name: true } } }, orderBy: { closedAt: 'desc' }, take: 100 });
    return shifts.map((shift) => ({ id: shift.id, location: shift.location.name, register: shift.register.name, cashier: shift.cashier.name, openedAt: shift.openedAt, closedAt: shift.closedAt, openingFloat: Number(shift.openingFloat), closingFloat: shift.closingFloat == null ? null : Number(shift.closingFloat) }));
  }

  async report(shiftId: string, companyId: string, actorId: string) {
    const actor = await this.db.user.findFirst({ where: { id: actorId, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('shift.report.view')) throw new NotFoundException('Manager access is required for shift reports');
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, location: { companyId } }, include: { register: true, location: true, cashier: { select: { name: true } }, movements: { orderBy: { createdAt: 'asc' } } } });
    if (!shift) throw new NotFoundException('Shift not found');
    const [summary, sales, returns, negativeStock, bukkuJob] = await Promise.all([
      this.summary(shift.id),
      this.db.sale.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { receiptNo: true, grandTotal: true, discountTotal: true, completedAt: true, payments: { select: { method: true, amount: true, changeAmount: true } } }, orderBy: { completedAt: 'desc' } }),
      this.db.return.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { type: true, total: true, createdAt: true, payments: { select: { method: true, amount: true } } }, orderBy: { createdAt: 'desc' } }),
      this.negativeStockForShift(shift.id, shift.locationId),
      this.db.syncJob.findFirst({ where: { companyId, provider: 'BUKKU', entityType: 'SHIFT_DAILY_DIGEST', entityId: shift.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const paymentTotals: Record<string, number> = {};
    for (const sale of sales) for (const payment of sale.payments) paymentTotals[payment.method] = (paymentTotals[payment.method] ?? 0) + Number(payment.amount) - Number(payment.changeAmount);
    return {
      shift: { id: shift.id, location: shift.location.name, register: shift.register.name, cashier: shift.cashier.name, openedAt: shift.openedAt, closedAt: shift.closedAt },
      summary: { ...summary, ...reconcileCash({ ...summary, countedCash: shift.closingFloat == null ? undefined : Number(shift.closingFloat) }), salesCount: sales.length, grossSales: sales.reduce((sum, sale) => sum + Number(sale.grandTotal), 0), discountTotal: sales.reduce((sum, sale) => sum + Number(sale.discountTotal), 0) },
      paymentTotals,
      cashMovements: shift.movements.map((movement) => ({ type: movement.type, amount: Number(movement.amount), reason: movement.reason, createdAt: movement.createdAt })),
      returns: returns.map((record) => ({ type: record.type, total: Number(record.total), createdAt: record.createdAt, payments: record.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) })) })),
      receipts: sales.map((sale) => ({ receiptNo: sale.receiptNo, total: Number(sale.grandTotal), completedAt: sale.completedAt })),
      negativeStock,
      dailyDigest: bukkuJob ? { exportFileName: String((bukkuJob.payload as Record<string, unknown> | null)?.exportFileName ?? ''), bukkuStatus: String((bukkuJob.payload as Record<string, unknown> | null)?.status ?? bukkuJob.status), syncJobId: bukkuJob.id } : null,
    };
  }

  async printReport(shiftId: string, companyId: string, actorId: string) {
    const [report, company] = await Promise.all([
      this.report(shiftId, companyId, actorId),
      this.db.company.findUnique({ where: { id: companyId } }),
    ]);
    if (!company) throw new NotFoundException('Company was not found');
    const lines = [
      company.legalName || company.name,
      'SHIFT REPORT',
      `${report.shift.location} · ${report.shift.register}`,
      `Cashier: ${report.shift.cashier}`,
      `Opened: ${new Date(report.shift.openedAt).toLocaleString('en-MY')}`,
      report.shift.closedAt ? `Closed: ${new Date(report.shift.closedAt).toLocaleString('en-MY')}` : 'OPEN SHIFT',
      '--------------------------------',
      `Sales: ${report.summary.salesCount}  Gross: RM${report.summary.grossSales.toFixed(2)}`,
      `Discounts: RM${report.summary.discountTotal.toFixed(2)}`,
      `Cash sales: RM${report.summary.cashSales.toFixed(2)}`,
      `Cash refunds: RM${report.summary.cashRefunds.toFixed(2)}`,
      `Cash in: RM${report.summary.cashIn.toFixed(2)}`,
      `Cash out: RM${report.summary.cashOut.toFixed(2)}`,
      `Opening float: RM${report.summary.openingFloat.toFixed(2)}`,
      `Expected cash: RM${report.summary.expectedCash.toFixed(2)}`,
      ...(report.summary.variance === undefined ? [] : [`Variance: RM${report.summary.variance.toFixed(2)}`]),
      '--------------------------------',
      ...Object.entries(report.paymentTotals).map(([method, amount]) => `${method}: RM${amount.toFixed(2)}`),
      `Returns: ${report.returns.length}`,
      report.negativeStock.length ? `Stock follow-up: ${report.negativeStock.length} item(s)` : 'Stock follow-up: none',
      'RetailOS shift close record',
    ];
    const printJob = await this.thermalPrinter.print(company.printerConnectionMethod, lines, company.receiptPaperWidthMm, { lanHost: company.printerLanHost, lanPort: company.printerLanPort, windowsQueue: company.printerWindowsQueue, serialPort: company.printerSerialPort, serialBaudRate: company.printerSerialBaudRate });
    await this.db.auditLog.create({ data: { companyId, actorId, action: 'SHIFT_REPORT_PRINTED', entityType: 'Shift', entityId: shiftId, after: { transport: printJob.transport, printJobId: printJob.jobId } } });
    return { message: 'Shift report sent to the PC printer.', ...printJob };
  }

  async downloadDailyDigest(shiftId: string, companyId: string, actorId: string) {
    await this.requireReportAccess(companyId, actorId);
    const digest = await this.createDailyDigest(shiftId, companyId);
    return { fileName: digest.fileName, content: await readFile(digest.filePath) };
  }

  async addMovement(shiftId: string, input: CashMovementDto) {
    const shift = await this.requireActiveShift(shiftId, input.companyId, input.cashierId);
    const movement = await this.db.cashMovement.create({ data: { shiftId: shift.id, type: input.type, amount: input.amount, reason: input.reason.trim() } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: input.type, entityType: 'CashMovement', entityId: movement.id, reason: movement.reason, after: { amount: input.amount, shiftId } } });
    return this.status(shift.id, input.companyId);
  }

  async close(shiftId: string, input: CloseShiftDto) {
    const shift = await this.requireActiveShift(shiftId, input.companyId, input.cashierId);
    const manager = await this.db.user.findFirst({ where: { id: input.managerId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(manager?.role.permissions) ? manager.role.permissions : [];
    if (!manager || !permissions.includes('shift.report.view')) throw new NotFoundException('Manager approval is required to close a shift');
    const summary = await this.summary(shift.id);
    const reconciliation = reconcileCash({ ...summary, countedCash: input.closingFloat });
    const negativeStock = await this.negativeStockForShift(shift.id, shift.locationId);
    const closedAt = new Date();
    await this.db.shift.update({ where: { id: shift.id }, data: { closingFloat: input.closingFloat, closedAt } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: 'SHIFT_CLOSED', entityType: 'Shift', entityId: shift.id, after: { ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock }, metadata: { approvedById: manager.id } } });
    let dailyDigest: { fileName: string; bukkuStatus: string } | undefined;
    try {
      const digest = await this.createDailyDigest(shift.id, input.companyId);
      const job = await this.db.syncJob.upsert({
        where: { idempotencyKey: `bukku:shift-daily-digest:${shift.id}` },
        create: { companyId: input.companyId, provider: 'BUKKU', entityType: 'SHIFT_DAILY_DIGEST', entityId: shift.id, action: 'DAILY_CASH_INVOICE_REQUIRES_MAPPING', direction: 'OUTBOUND', idempotencyKey: `bukku:shift-daily-digest:${shift.id}`, payload: { status: 'AWAITING_FINANCIAL_MAPPING', exportFileName: digest.fileName, businessDate: digest.businessDate, salesCount: digest.salesCount, itemCount: digest.itemCount, salesTotal: digest.salesTotal, paymentTotals: digest.paymentTotals } },
        update: { payload: { status: 'AWAITING_FINANCIAL_MAPPING', exportFileName: digest.fileName, businessDate: digest.businessDate, salesCount: digest.salesCount, itemCount: digest.itemCount, salesTotal: digest.salesTotal, paymentTotals: digest.paymentTotals } },
      });
      dailyDigest = { fileName: digest.fileName, bukkuStatus: String((job.payload as Record<string, unknown>).status) };
      await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: manager.id, action: 'SHIFT_DAILY_DIGEST_EXPORTED', entityType: 'Shift', entityId: shift.id, after: { ...dailyDigest, salesCount: digest.salesCount, itemCount: digest.itemCount, salesTotal: digest.salesTotal } } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Excel export error';
      await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: manager.id, action: 'SHIFT_DAILY_DIGEST_EXPORT_FAILED', entityType: 'Shift', entityId: shift.id, after: { message } } });
    }
    try {
      const print = await this.printReport(shift.id, input.companyId, manager.id);
      return { shiftId: shift.id, closedAt, ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock, dailyDigest, reportPrint: print };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown printer error';
      await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: manager.id, action: 'SHIFT_REPORT_AUTO_PRINT_FAILED', entityType: 'Shift', entityId: shift.id, after: { message } } });
      return { shiftId: shift.id, closedAt, ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock, dailyDigest, reportPrintError: message };
    }
  }

  private async requireActiveShift(shiftId: string, companyId: string, cashierId: string) {
    const [shift, cashier] = await Promise.all([
      this.db.shift.findFirst({ where: { id: shiftId, closedAt: null, location: { companyId } } }),
      this.db.user.findFirst({ where: { id: cashierId, companyId, status: 'ACTIVE' } }),
    ]);
    if (!shift || !cashier) throw new NotFoundException('Open shift not found for this register');
    return shift;
  }

  private async requireReportAccess(companyId: string, actorId: string) {
    const actor = await this.db.user.findFirst({ where: { id: actorId, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('shift.report.view')) throw new NotFoundException('Manager access is required for shift reports');
  }

  private async createDailyDigest(shiftId: string, companyId: string) {
    const shift = await this.db.shift.findFirst({
      where: { id: shiftId, location: { companyId } },
      include: {
        location: true, register: true, cashier: { select: { name: true } }, movements: { orderBy: { createdAt: 'asc' } },
        sales: { where: { status: 'COMPLETED' }, orderBy: { completedAt: 'asc' }, include: { cashier: { select: { name: true } }, customer: { select: { name: true, contactCode: true } }, payments: { where: { status: 'COMPLETED' } }, items: { include: { product: { select: { sku: true, name: true } }, uom: { select: { name: true } } } } } },
        processedReturns: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'asc' }, include: { payments: true } },
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    const summaryBase = await this.summary(shift.id);
    const paymentTotals: Record<string, number> = {};
    for (const sale of shift.sales) for (const payment of sale.payments) paymentTotals[payment.method] = (paymentTotals[payment.method] ?? 0) + Number(payment.amount) - Number(payment.changeAmount);
    const summary = { ...summaryBase, ...reconcileCash({ ...summaryBase, countedCash: shift.closingFloat == null ? undefined : Number(shift.closingFloat) }), salesCount: shift.sales.length, grossSales: shift.sales.reduce((sum, sale) => sum + Number(sale.grandTotal), 0), discountTotal: shift.sales.reduce((sum, sale) => sum + Number(sale.discountTotal), 0) };
    const itemTotals = new Map<string, { sku: string; description: string; uom: string; quantity: number; gross: number; discount: number; tax: number; net: number }>();
    const orderRows = shift.sales.map((sale) => {
      const payments = sale.payments.map((payment) => `${payment.method}: ${(Number(payment.amount) - Number(payment.changeAmount)).toFixed(2)}${payment.reference ? ` (${payment.reference})` : ''}`).join('; ');
      for (const item of sale.items) {
        const key = `${item.product.sku}|${item.description}|${item.uom.name}`;
        const existing = itemTotals.get(key) ?? { sku: item.product.sku, description: item.description || item.product.name, uom: item.uom.name, quantity: 0, gross: 0, discount: 0, tax: 0, net: 0 };
        existing.quantity += Number(item.quantity); existing.gross += Number(item.unitPrice) * Number(item.quantity); existing.discount += Number(item.lineDiscount); existing.tax += Number(item.taxAmount); existing.net += Number(item.lineTotal); itemTotals.set(key, existing);
      }
      return [sale.receiptNo, sale.completedAt ?? sale.createdAt, sale.cashier.name, sale.customer?.contactCode ?? '', sale.customer?.name ?? 'Walk-in customer', Number(sale.subtotal), Number(sale.discountTotal), Number(sale.taxTotal), Number(sale.grandTotal), payments];
    });
    const itemRows = shift.sales.flatMap((sale) => sale.items.map((item) => [sale.receiptNo, sale.completedAt ?? sale.createdAt, item.product.sku, item.description || item.product.name, item.uom.name, Number(item.quantity), Number(item.baseQuantity), Number(item.unitPrice), Number(item.lineDiscount), Number(item.taxAmount), Number(item.lineTotal), sale.payments.map((payment) => payment.method).join('; ')]));
    const businessDate = (shift.closedAt ?? new Date()).toISOString().slice(0, 10);
    const sheets: XlsxSheet[] = [
      { name: 'Daily Digest', widths: [26, 24, 24, 20], rows: [['RetailOS daily shift digest', '', '', ''], ['Business date', businessDate], ['Location', shift.location.name], ['Register', shift.register.name], ['Cashier', shift.cashier.name], ['Opened', shift.openedAt], ['Closed', shift.closedAt], ['Opening float', summary.openingFloat], ['Closing float', shift.closingFloat == null ? '' : Number(shift.closingFloat)], ['Expected cash', summary.expectedCash], ['Cash variance', summary.variance ?? ''], ['Completed orders', summary.salesCount], ['Gross sales', summary.grossSales], ['Discounts', summary.discountTotal], ['Returns', shift.processedReturns.reduce((sum, record) => sum + Number(record.total), 0)], [], ['Payment method', 'Net amount'], ...Object.entries(paymentTotals)], },
      { name: 'Orders', widths: [18, 21, 22, 18, 28, 14, 14, 14, 14, 42], rows: [['Receipt no.', 'Completed at', 'Cashier', 'Customer code', 'Customer', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment method(s)'], ...orderRows] },
      { name: 'Items Sold', widths: [18, 21, 18, 36, 14, 12, 14, 14, 14, 14, 14, 30], rows: [['Receipt no.', 'Completed at', 'SKU', 'Item', 'UOM', 'Quantity', 'Base quantity', 'Unit price', 'Line discount', 'Tax', 'Line total', 'Payment method(s)'], ...itemRows] },
      { name: 'Item Summary', widths: [18, 38, 14, 14, 14, 14, 14, 14], rows: [['SKU', 'Item', 'UOM', 'Quantity', 'Gross', 'Discount', 'Tax', 'Net sales'], ...[...itemTotals.values()].sort((a, b) => a.description.localeCompare(b.description)).map((item) => [item.sku, item.description, item.uom, item.quantity, item.gross, item.discount, item.tax, item.net])] },
      { name: 'Returns', widths: [18, 21, 18, 16, 24], rows: [['Type', 'Completed at', 'Total', 'Payment method(s)', 'Reference'], ...shift.processedReturns.map((record) => [record.type, record.createdAt, Number(record.total), record.payments.map((payment) => payment.method).join('; '), record.payments.map((payment) => payment.reference ?? '').filter(Boolean).join('; ')])] },
      { name: 'Cash Movements', widths: [18, 18, 18, 48], rows: [['Type', 'Amount', 'Created at', 'Reason'], ...shift.movements.map((movement) => [movement.type, Number(movement.amount), movement.createdAt, movement.reason])] },
    ];
    const fileName = `retailos-daily-digest-${businessDate}-${shift.id}.xlsx`;
    const exportRoot = process.env.RETAILOS_EXPORT_DIR?.trim() || join(homedir(), 'Documents', 'RetailOS Exports');
    const filePath = join(exportRoot, fileName);
    await writeXlsx(filePath, sheets);
    return { fileName, filePath, businessDate, salesCount: shift.sales.length, itemCount: itemRows.length, salesTotal: summary.grossSales, paymentTotals };
  }

  private async status(shiftId: string, companyId: string) {
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, location: { companyId } }, include: { register: true, cashier: { select: { id: true, name: true } }, movements: { orderBy: { createdAt: 'desc' } } } });
    if (!shift) throw new NotFoundException('Shift not found');
    const summary = await this.summary(shift.id);
    const { openingFloat: _openingFloat, closingFloat, ...shiftData } = shift;
    return { ...shiftData, ...summary, closingFloat: closingFloat == null ? null : Number(closingFloat), ...reconcileCash(summary) };
  }

  private async summary(shiftId: string) {
    const shift = await this.db.shift.findUniqueOrThrow({ where: { id: shiftId }, include: { movements: true } });
    const [cashSales, cashRefunds] = await Promise.all([
      this.db.payment.aggregate({ where: { method: 'CASH', sale: { shiftId, status: 'COMPLETED' } }, _sum: { amount: true, changeAmount: true } }),
      this.db.returnPayment.aggregate({ where: { method: 'CASH', return: { shiftId, status: 'COMPLETED' } }, _sum: { amount: true } }),
    ]);
    const cashIn = shift.movements.filter((movement) => movement.type === 'CASH_IN').reduce((sum, movement) => sum + Number(movement.amount), 0);
    const cashOut = shift.movements.filter((movement) => movement.type === 'CASH_OUT').reduce((sum, movement) => sum + Number(movement.amount), 0);
    return { openingFloat: Number(shift.openingFloat), cashSales: Number(cashSales._sum.amount ?? new Prisma.Decimal(0)) - Number(cashSales._sum.changeAmount ?? new Prisma.Decimal(0)), cashRefunds: Number(cashRefunds._sum.amount ?? new Prisma.Decimal(0)), cashIn, cashOut };
  }

  private async negativeStockForShift(shiftId: string, locationId: string) {
    const snapshots = await this.db.stockSnapshot.findMany({
      where: { locationId, quantity: { lt: 0 }, product: { saleItems: { some: { sale: { shiftId, status: 'COMPLETED' } } } } },
      include: { product: { select: { sku: true, name: true } } },
      orderBy: { product: { name: 'asc' } },
    });
    return snapshots.map((snapshot) => ({ sku: snapshot.product.sku, name: snapshot.product.name, remainingQuantity: Number(snapshot.quantity), shortageQuantity: Math.abs(Number(snapshot.quantity)) }));
  }
}
