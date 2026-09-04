import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { PrismaService } from '../database/prisma.service';
import { reconcileCash } from './shift-calculator';
import { CashMovementDto, CloseShiftDto, CorrectOpeningFloatDto, OpenShiftDto } from './dto/shift.dto';
import { BukkuAutoSyncService } from '../integrations/bukku/bukku-auto-sync.service';
import { BukkuAdapter } from '../integrations/bukku/bukku.adapter';
import { ThermalPrinterService } from '../checkout/thermal-printer.service';
import { receiptHistoryPaymentAmount } from '../checkout/checkout-calculator';
import { writeXlsx, XlsxSheet } from './xlsx-writer';

@Injectable()
export class ShiftsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShiftsService.name);
  private autoCloseTimer?: NodeJS.Timeout;
  constructor(private readonly db: PrismaService, private readonly bukkuSync: BukkuAutoSyncService, private readonly bukku: BukkuAdapter, private readonly thermalPrinter: ThermalPrinterService) {}

  onModuleInit() {
    if (process.env.SHIFT_AUTO_CLOSE_ENABLED === 'false') return;
    void this.autoCloseExpiredShifts();
    this.autoCloseTimer = setInterval(() => { void this.autoCloseExpiredShifts(); }, 60_000);
    this.autoCloseTimer.unref();
  }

  onModuleDestroy() { if (this.autoCloseTimer) clearInterval(this.autoCloseTimer); }

  async open(input: OpenShiftDto) {
    const [location, register, cashier] = await Promise.all([
      this.db.location.findFirst({ where: { id: input.locationId, companyId: input.companyId } }),
      this.db.register.findFirst({ where: { id: input.registerId, locationId: input.locationId } }),
      this.db.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    if (!location || !register || !cashier) throw new BadRequestException('Invalid store, register, or cashier');
    const cashierPermissions = Array.isArray(cashier.role.permissions) ? cashier.role.permissions : [];
    if (!cashierPermissions.includes('shift.open')) throw new ForbiddenException('Shift opening permission is required');
    const anomalyThreshold = 1000;
    if (input.openingFloat > anomalyThreshold) {
      if (!input.anomalyConfirmed) throw new BadRequestException(`Opening floats above RM${anomalyThreshold.toFixed(2)} require an explicit confirmation`);
      if (!input.managerId) throw new BadRequestException(`Opening floats above RM${anomalyThreshold.toFixed(2)} require manager approval`);
      const manager = await this.db.user.findFirst({ where: { id: input.managerId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } });
      const permissions = Array.isArray(manager?.role.permissions) ? manager.role.permissions : [];
      if (!manager || !permissions.includes('shift.report.view')) throw new ForbiddenException('Manager approval is required for this opening float');
    }
    const existing = await this.db.shift.findFirst({ where: { registerId: input.registerId, closedAt: null } });
    if (existing) throw new ConflictException('This register already has an open shift');
    const shift = await this.db.shift.create({ data: { locationId: location.id, registerId: register.id, cashierId: cashier.id, openingFloat: input.openingFloat } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: cashier.id, action: 'SHIFT_OPENED', entityType: 'Shift', entityId: shift.id, after: { openingFloat: input.openingFloat, register: register.code }, metadata: { anomalyConfirmed: Boolean(input.anomalyConfirmed), approvedById: input.managerId ?? null } } });
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
    if (!actor || !permissions.includes('shift.report.view')) throw new ForbiddenException('Manager access is required for shift reports');
    const shifts = await this.db.shift.findMany({ where: { closedAt: { not: null }, location: { companyId }, ...(registerId ? { registerId } : {}) }, include: { location: true, register: true, cashier: { select: { name: true } } }, orderBy: { closedAt: 'desc' }, take: 100 });
    return shifts.map((shift) => ({ id: shift.id, location: shift.location.name, register: shift.register.name, cashier: shift.cashier.name, openedAt: shift.openedAt, closedAt: shift.closedAt, openingFloat: Number(shift.openingFloat), closingFloat: shift.closingFloat == null ? null : Number(shift.closingFloat) }));
  }

  async report(shiftId: string, companyId: string, actorId: string) {
    const actor = await this.db.user.findFirst({ where: { id: actorId, companyId, status: 'ACTIVE' }, include: { role: true } });
    const permissions = Array.isArray(actor?.role.permissions) ? actor.role.permissions : [];
    if (!actor || !permissions.includes('shift.report.view')) throw new ForbiddenException('Manager access is required for shift reports');
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, location: { companyId } }, include: { register: true, location: true, cashier: { select: { name: true } }, movements: { orderBy: { createdAt: 'asc' } } } });
    if (!shift) throw new NotFoundException('Shift not found');
    const [summary, sales, returns, negativeStock, stockShortages, acknowledgement, bukkuJob] = await Promise.all([
      this.summary(shift.id),
      this.db.sale.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { receiptNo: true, grandTotal: true, discountTotal: true, completedAt: true, payments: { select: { method: true, amount: true, changeAmount: true } } }, orderBy: { completedAt: 'desc' } }),
      this.db.return.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { type: true, total: true, createdAt: true, payments: { select: { method: true, amount: true } } }, orderBy: { createdAt: 'desc' } }),
      this.negativeStockForShift(shift.id, shift.locationId),
      this.stockShortagesForShift(shift.id, companyId),
      this.stockShortageAcknowledgement(shift.id, companyId),
      this.db.syncJob.findFirst({ where: { companyId, provider: 'BUKKU', entityType: 'SHIFT_DAILY_DIGEST', entityId: shift.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const paymentTotals: Record<string, number> = {};
    for (const sale of sales) for (const payment of sale.payments) paymentTotals[payment.method] = (paymentTotals[payment.method] ?? 0) + receiptHistoryPaymentAmount({ method: payment.method, amount: Number(payment.amount), changeAmount: Number(payment.changeAmount) });
    return {
      shift: { id: shift.id, location: shift.location.name, register: shift.register.name, cashier: shift.cashier.name, openedAt: shift.openedAt, closedAt: shift.closedAt },
      summary: { ...summary, ...reconcileCash({ ...summary, countedCash: shift.closingFloat == null ? undefined : Number(shift.closingFloat) }), salesCount: sales.length, grossSales: sales.reduce((sum, sale) => sum + Number(sale.grandTotal), 0), discountTotal: sales.reduce((sum, sale) => sum + Number(sale.discountTotal), 0) },
      paymentTotals: this.shiftClosePaymentTotals(paymentTotals),
      cashMovements: shift.movements.map((movement) => ({ type: movement.type, amount: Number(movement.amount), reason: movement.reason, createdAt: movement.createdAt })),
      returns: returns.map((record) => ({ type: record.type, total: Number(record.total), createdAt: record.createdAt, payments: record.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) })) })),
      receipts: sales.map((sale) => ({ receiptNo: sale.receiptNo, total: Number(sale.grandTotal), completedAt: sale.completedAt })),
      negativeStock,
      stockShortages,
      stockShortageAcknowledgement: acknowledgement,
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
      `CASH: RM${report.paymentTotals.CASH.toFixed(2)}`,
      `BANK TRANSFER: RM${report.paymentTotals.BANK_TRANSFER.toFixed(2)}`,
      `RETURNS: RM${report.returns.reduce((sum, record) => sum + record.total, 0).toFixed(2)}`,
      report.stockShortages.length ? `Negative stock / follow-up: ${report.stockShortages.length} sale line(s)` : 'Negative stock / follow-up: none',
      ...report.stockShortages.flatMap((item) => [`${item.sku} ${item.productName}`, `Receipt ${item.receiptNo}: before ${item.preSaleQuantity}, sold ${item.soldQuantity}, after ${item.postSaleQuantity}, introduced ${item.shortageIntroduced}`]),
      report.stockShortageAcknowledgement ? `Stock shortages acknowledged by ${report.stockShortageAcknowledgement.managerId} at ${report.stockShortageAcknowledgement.acknowledgedAt}` : report.stockShortages.length ? 'Stock shortage acknowledgement: REQUIRED' : 'Stock shortage acknowledgement: not applicable',
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
    const anomalyThreshold = 1000;
    if (input.amount > anomalyThreshold) {
      if (!input.anomalyConfirmed) throw new BadRequestException(`Amounts above RM${anomalyThreshold.toFixed(2)} require an explicit confirmation`);
      if (!input.managerId) throw new BadRequestException(`Amounts above RM${anomalyThreshold.toFixed(2)} require manager approval`);
      const manager = await this.db.user.findFirst({ where: { id: input.managerId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } });
      const permissions = Array.isArray(manager?.role.permissions) ? manager.role.permissions : [];
      if (!manager || !permissions.includes('shift.report.view')) throw new ForbiddenException('Manager approval is required for this cash movement');
    }
    if (input.type === 'CASH_OUT') {
      const summary = await this.summary(shift.id);
      const expectedCash = reconcileCash({ ...summary }).expectedCash;
      if (input.amount > expectedCash) throw new BadRequestException(`Cash out cannot exceed expected drawer cash of RM${expectedCash.toFixed(2)}`);
    }
    const movement = await this.db.cashMovement.create({ data: { shiftId: shift.id, type: input.type, amount: input.amount, reason: input.reason.trim() } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: input.cashierId, action: input.type, entityType: 'CashMovement', entityId: movement.id, reason: movement.reason, after: { amount: input.amount, shiftId }, metadata: { anomalyConfirmed: Boolean(input.anomalyConfirmed), approvedById: input.managerId ?? null } } });
    return this.status(shift.id, input.companyId);
  }

  async close(shiftId: string, input: CloseShiftDto) {
    const [shift, closingActor, manager] = await Promise.all([
      this.requireActiveShift(shiftId, input.companyId, input.cashierId),
      this.db.user.findFirst({ where: { id: input.cashierId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
      this.db.user.findFirst({ where: { id: input.managerId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    const closingPermissions = Array.isArray(closingActor?.role.permissions) ? closingActor.role.permissions : [];
    if (!closingActor || !closingPermissions.includes('shift.close')) throw new ForbiddenException('Only a manager may close a shift');
    const permissions = Array.isArray(manager?.role.permissions) ? manager.role.permissions : [];
    if (!manager || !permissions.includes('shift.report.view')) throw new ForbiddenException('Manager approval is required to close a shift');
    const summary = await this.summary(shift.id);
    const reconciliation = reconcileCash({ ...summary, countedCash: input.closingFloat });
    const [negativeStock, stockShortages] = await Promise.all([this.negativeStockForShift(shift.id, shift.locationId), this.stockShortagesForShift(shift.id, input.companyId)]);
    if (stockShortages.length && !input.stockShortageAcknowledged) throw new UnprocessableEntityException('A manager acknowledgement is required before closing a shift with stock shortages');
    const closedAt = new Date();
    await this.db.shift.update({ where: { id: shift.id }, data: { closingFloat: input.closingFloat, closedAt } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: closingActor.id, action: 'SHIFT_CLOSED', entityType: 'Shift', entityId: shift.id, after: { ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock, stockShortages }, metadata: { approvedById: manager.id, stockShortageAcknowledged: Boolean(input.stockShortageAcknowledged), stockShortageAcknowledgedAt: stockShortages.length ? new Date().toISOString() : null, reportDelivery: 'MANUAL_DOWNLOAD' } } });
    const dailyDigest = await this.finalizeClosedShiftDigest(shift.id, input.companyId, manager.id);
    return { shiftId: shift.id, closedAt, ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock, stockShortages, dailyDigest, reportDelivery: 'MANUAL_DOWNLOAD' };
  }

  /**
   * Close unattended shifts shortly after the company's local midnight. An
   * automatic close never invents a physical cash count and never prints. A
   * shortage shift remains open because the manager acknowledgement invariant
   * must not be bypassed by the scheduler.
   */
  async autoCloseExpiredShifts(now = new Date()) {
    let shifts: Array<{ id: string; cashierId: string; locationId: string; openedAt: Date; location: { company: { id: string; timezone: string } } }>;
    try {
      shifts = await this.db.shift.findMany({ where: { closedAt: null }, select: { id: true, cashierId: true, locationId: true, openedAt: true, location: { select: { company: { select: { id: true, timezone: true } } } } } });
    } catch (error) {
      this.logger.error(`Automatic shift close could not load open shifts: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }
    for (const shift of shifts) {
      const companyId = shift.location.company.id;
      const timezone = shift.location.company.timezone || 'Asia/Kuala_Lumpur';
      if (this.localDateKey(shift.openedAt, timezone) === this.localDateKey(now, timezone)) continue;
      try {
        const shortages = await this.stockShortagesForShift(shift.id, companyId);
        if (shortages.length) {
          const alreadyRecorded = await this.db.auditLog.findFirst({ where: { companyId, action: 'SHIFT_AUTO_CLOSE_BLOCKED', entityType: 'Shift', entityId: shift.id } });
          if (!alreadyRecorded) await this.db.auditLog.create({ data: { companyId, actorId: shift.cashierId, action: 'SHIFT_AUTO_CLOSE_BLOCKED', entityType: 'Shift', entityId: shift.id, after: { shortageCount: shortages.length, reason: 'Manager stock-shortage acknowledgement is required' } } });
          continue;
        }
        const updated = await this.db.shift.updateMany({ where: { id: shift.id, closedAt: null }, data: { closedAt: now } });
        if (updated.count !== 1) continue;
        const summary = await this.summary(shift.id);
        await this.db.auditLog.create({ data: { companyId, actorId: shift.cashierId, action: 'SHIFT_AUTO_CLOSED', entityType: 'Shift', entityId: shift.id, after: { ...summary, closingFloat: null, closedAt: now.toISOString() }, metadata: { automatic: true, scheduledLocalTime: '00:00', reportPrinted: false, reportDelivery: 'MANUAL_DOWNLOAD' } } });
        await this.finalizeClosedShiftDigest(shift.id, companyId, shift.cashierId);
      } catch (error) {
        this.logger.error(`Automatic close failed for shift ${shift.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private localDateKey(value: Date, timezone: string) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  }

  private shiftClosePaymentTotals(source: Record<string, number>) {
    return {
      CASH: source.CASH ?? 0,
      BANK_TRANSFER: ['BANK_TRANSFER', 'DUITNOW', 'CARD', 'OTHER'].reduce((sum, method) => sum + (source[method] ?? 0), 0),
    };
  }

  private async finalizeClosedShiftDigest(shiftId: string, companyId: string, actorId: string) {
    try {
      const digest = await this.createDailyDigest(shiftId, companyId);
      const job = await this.db.syncJob.upsert({
        where: { idempotencyKey: `bukku:shift-daily-digest:${shiftId}` },
        create: { companyId, provider: 'BUKKU', entityType: 'SHIFT_DAILY_DIGEST', entityId: shiftId, action: 'DAILY_CASH_INVOICE_POST', direction: 'OUTBOUND', idempotencyKey: `bukku:shift-daily-digest:${shiftId}`, payload: { status: 'AWAITING_FINANCIAL_MAPPING', exportFileName: digest.fileName, businessDate: digest.businessDate, salesCount: digest.salesCount, itemCount: digest.itemCount, salesTotal: digest.salesTotal, paymentTotals: digest.paymentTotals } },
        update: { payload: { status: 'AWAITING_FINANCIAL_MAPPING', exportFileName: digest.fileName, businessDate: digest.businessDate, salesCount: digest.salesCount, itemCount: digest.itemCount, salesTotal: digest.salesTotal, paymentTotals: digest.paymentTotals }, status: 'PENDING', lastError: null },
      });
      const posting = await this.postDailyBukkuInvoice(job.id, shiftId, companyId, digest.businessDate);
      const result = { fileName: digest.fileName, bukkuStatus: posting.status };
      await this.db.auditLog.create({ data: { companyId, actorId, action: 'SHIFT_DAILY_DIGEST_EXPORTED', entityType: 'Shift', entityId: shiftId, after: { ...result, salesCount: digest.salesCount, itemCount: digest.itemCount, salesTotal: digest.salesTotal } } });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Excel export error';
      await this.db.auditLog.create({ data: { companyId, actorId, action: 'SHIFT_DAILY_DIGEST_EXPORT_FAILED', entityType: 'Shift', entityId: shiftId, after: { message } } });
      return undefined;
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
    if (!actor || !permissions.includes('shift.report.view')) throw new ForbiddenException('Manager access is required for shift reports');
  }

  async correctOpeningFloat(shiftId: string, input: CorrectOpeningFloatDto) {
    const [shift, manager] = await Promise.all([
      this.db.shift.findFirst({ where: { id: shiftId, closedAt: null, location: { companyId: input.companyId } } }),
      this.db.user.findFirst({ where: { id: input.managerId, companyId: input.companyId, status: 'ACTIVE' }, include: { role: true } }),
    ]);
    const permissions = Array.isArray(manager?.role.permissions) ? manager.role.permissions : [];
    if (!shift) throw new NotFoundException('Only an open shift can have its opening float corrected');
    if (!manager || !permissions.includes('shift.report.view')) throw new ForbiddenException('Manager approval is required to correct an opening float');
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('A correction reason is required');
    if (Number(shift.openingFloat) === input.correctedOpeningFloat) throw new BadRequestException('The corrected opening float must differ from the recorded value');
    const correctedAt = new Date();
    const updated = await this.db.shift.update({ where: { id: shift.id }, data: { openingFloat: input.correctedOpeningFloat } });
    await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: manager.id, action: 'SHIFT_OPENING_FLOAT_CORRECTED', entityType: 'Shift', entityId: shift.id, reason, before: { openingFloat: Number(shift.openingFloat) }, after: { openingFloat: input.correctedOpeningFloat, correctedAt: correctedAt.toISOString() }, metadata: { approvedById: manager.id, correction: true } } });
    return this.status(updated.id, input.companyId);
  }

  private async postDailyBukkuInvoice(jobId: string, shiftId: string, companyId: string, businessDate: string) {
    const [company, shift] = await Promise.all([
      this.db.company.findUnique({ where: { id: companyId } }),
      this.db.shift.findFirst({ where: { id: shiftId, location: { companyId } }, include: { location: true, sales: { where: { status: 'COMPLETED' }, include: { payments: { where: { status: 'COMPLETED' } }, items: { include: { product: { select: { id: true, name: true, classificationCode: true } }, uom: { select: { id: true } } } } } }, processedReturns: { where: { status: 'COMPLETED' } } } }),
    ]);
    if (!company || !shift) return { status: 'FAILED_SOURCE_NOT_FOUND' };
    if (!company.bukkuDailyInvoiceEnabled) return { status: 'AWAITING_FINANCIAL_MAPPING' };
    if (shift.processedReturns.length) return { status: 'AWAITING_RETURN_REVIEW' };

    const paymentAccounts = this.stringRecord(company.bukkuDailyInvoicePaymentAccounts);
    const paymentTotals = new Map<string, number>();
    for (const sale of shift.sales) for (const payment of sale.payments) paymentTotals.set(payment.method, (paymentTotals.get(payment.method) ?? 0) + receiptHistoryPaymentAmount({ method: payment.method, amount: Number(payment.amount), changeAmount: Number(payment.changeAmount) }));
    const missing = [
      !company.bukkuDailyInvoiceContactId ? 'cash-sales contact' : '',
      !company.bukkuDailyInvoiceRevenueAccountId ? 'sales-income account' : '',
      ...[...paymentTotals.keys()].filter((method) => !paymentAccounts[method]).map((method) => `${method} payment account`),
    ].filter(Boolean);
    if (missing.length) return { status: `AWAITING_MAPPING: ${missing.join(', ')}` };

    const localProductIds = shift.sales.flatMap((sale) => sale.items.map((item) => item.product.id));
    const localUnitIds = shift.sales.flatMap((sale) => sale.items.map((item) => item.uom.id));
    const references = await this.db.externalReference.findMany({ where: { companyId, provider: 'BUKKU', OR: [{ entityType: 'PRODUCT', localId: { in: localProductIds } }, { entityType: 'PRODUCT_UNIT', localId: { in: localUnitIds } }] } });
    const productIds = new Map(references.filter((reference) => reference.entityType === 'PRODUCT').map((reference) => [reference.localId, reference.externalId]));
    const unitIds = new Map(references.filter((reference) => reference.entityType === 'PRODUCT_UNIT').map((reference) => [reference.localId, reference.externalId]));
    const lines = shift.sales.flatMap((sale) => sale.items.map((item) => ({ item, productId: productIds.get(item.product.id), productUnitId: unitIds.get(item.uom.id) })));
    if (lines.some((line) => !line.productId || !line.productUnitId)) return { status: 'AWAITING_PRODUCT_MAPPING' };

    const invoiceNumber = `ROS-${businessDate.replaceAll('-', '')}-${shift.id.slice(-10).toUpperCase()}`;
    const payments = [...paymentTotals.entries()].filter(([, amount]) => amount > 0).map(([method, amount]) => ({ accountId: paymentAccounts[method], paymentMethodId: method === 'CASH' ? '3' : '1', amount: this.roundMoney(amount), reference: `${method} ${businessDate}` }));
    const invoiceTotal = lines.reduce((sum, line) => sum + Number(line.item.lineTotal), 0);
    const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (Math.abs(invoiceTotal - paymentTotal) > 0.009) return { status: 'AWAITING_PAYMENT_RECONCILIATION' };

    await this.db.syncJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, payload: { status: 'POSTING_TO_BUKKU_NORMAL', invoiceNumber, businessDate } } });
    try {
      const result = await this.bukku.pushDailyCashInvoice({
        number: invoiceNumber, businessDate, contactId: company.bukkuDailyInvoiceContactId!, currency: company.currency, locationId: company.bukkuDailyInvoiceLocationId ?? undefined,
        lines: lines.map((line) => ({ productId: line.productId!, productUnitId: line.productUnitId!, incomeAccountId: company.bukkuDailyInvoiceRevenueAccountId!, description: line.item.description || line.item.product.name, quantity: Number(line.item.quantity), unitPrice: this.roundMoney(Number(line.item.lineTotal) / Number(line.item.quantity)), classificationCode: line.item.product.classificationCode || '022', ...(company.bukkuDailyInvoiceTaxCodeId ? { taxCodeId: company.bukkuDailyInvoiceTaxCodeId } : {}) })),
        payments,
      }, `bukku:shift-daily-digest:${shiftId}`);
      await this.db.syncJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', finishedAt: new Date(), lastError: null, payload: { status: 'POSTED_TO_BUKKU_NORMAL', invoiceNumber, bukkuInvoiceId: result.externalId, businessDate, myInvoisAction: 'NORMAL', invoiceTotal: this.roundMoney(invoiceTotal), paymentTotal: this.roundMoney(paymentTotal) } } });
      await this.db.auditLog.create({ data: { companyId, action: 'BUKKU_DAILY_INVOICE_POSTED', entityType: 'Shift', entityId: shiftId, after: { invoiceNumber, bukkuInvoiceId: result.externalId, myInvoisAction: 'NORMAL', invoiceTotal: this.roundMoney(invoiceTotal), paymentTotal: this.roundMoney(paymentTotal) } } });
      return { status: 'POSTED_TO_BUKKU_NORMAL' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bukku invoice posting failed';
      await this.db.syncJob.update({ where: { id: jobId }, data: { status: 'FAILED', finishedAt: new Date(), lastError: message, payload: { status: 'BUKKU_POST_FAILED', invoiceNumber, businessDate } } });
      await this.db.auditLog.create({ data: { companyId, action: 'BUKKU_DAILY_INVOICE_POST_FAILED', entityType: 'Shift', entityId: shiftId, after: { invoiceNumber, message } } });
      return { status: 'BUKKU_POST_FAILED' };
    }
  }

  private stringRecord(value: Prisma.JsonValue | null) { return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim())).map(([key, item]) => [key, item.trim()])) : {}; }
  private roundMoney(value: number) { return Number(value.toFixed(2)); }

  private async createDailyDigest(shiftId: string, companyId: string) {
    const shift = await this.db.shift.findFirst({
      where: { id: shiftId, location: { companyId } },
      include: {
        location: true, register: true, cashier: { select: { name: true } }, movements: { orderBy: { createdAt: 'asc' } },
        sales: { where: { status: 'COMPLETED' }, orderBy: { completedAt: 'asc' }, include: { cashier: { select: { name: true } }, customer: { select: { name: true, contactCode: true } }, payments: { where: { status: 'COMPLETED' } }, items: { include: { product: { select: { sku: true, name: true, basePurchaseCost: true, purchasePrices: { select: { uomId: true, amount: true } } } }, uom: { select: { name: true, conversionFactor: true } } } } } },
        processedReturns: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'asc' }, include: { payments: true } },
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    const [stockShortages, acknowledgement] = await Promise.all([this.stockShortagesForShift(shift.id, companyId), this.stockShortageAcknowledgement(shift.id, companyId)]);
    const summaryBase = await this.summary(shift.id);
    const paymentTotals: Record<string, number> = {};
    for (const sale of shift.sales) for (const payment of sale.payments) paymentTotals[payment.method] = (paymentTotals[payment.method] ?? 0) + receiptHistoryPaymentAmount({ method: payment.method, amount: Number(payment.amount), changeAmount: Number(payment.changeAmount) });
    const summary = { ...summaryBase, ...reconcileCash({ ...summaryBase, countedCash: shift.closingFloat == null ? undefined : Number(shift.closingFloat) }), salesCount: shift.sales.length, grossSales: shift.sales.reduce((sum, sale) => sum + Number(sale.grandTotal), 0), discountTotal: shift.sales.reduce((sum, sale) => sum + Number(sale.discountTotal), 0) };
    const itemTotals = new Map<string, { sku: string; description: string; uom: string; quantity: number; gross: number; discount: number; tax: number; net: number; totalCost: number; costKnown: boolean }>();
    const orderRows = shift.sales.map((sale) => {
      const payments = sale.payments.map((payment) => `${payment.method}: ${receiptHistoryPaymentAmount({ method: payment.method, amount: Number(payment.amount), changeAmount: Number(payment.changeAmount) }).toFixed(2)}${payment.reference ? ` (${payment.reference})` : ''}`).join('; ');
      for (const item of sale.items) {
        const key = `${item.product.sku}|${item.description}|${item.uom.name}`;
        const unitCost = this.saleItemUnitCost(item);
        const existing = itemTotals.get(key) ?? { sku: item.product.sku, description: item.description || item.product.name, uom: item.uom.name, quantity: 0, gross: 0, discount: 0, tax: 0, net: 0, totalCost: 0, costKnown: true };
        existing.quantity += Number(item.quantity); existing.gross += Number(item.unitPrice) * Number(item.quantity); existing.discount += Number(item.lineDiscount); existing.tax += Number(item.taxAmount); existing.net += Number(item.lineTotal);
        if (unitCost === null) existing.costKnown = false; else existing.totalCost += unitCost * Number(item.quantity);
        itemTotals.set(key, existing);
      }
      return [sale.receiptNo, sale.completedAt ?? sale.createdAt, sale.cashier.name, sale.customer?.contactCode ?? '', sale.customer?.name ?? 'Walk-in customer', Number(sale.subtotal), Number(sale.discountTotal), Number(sale.taxTotal), Number(sale.grandTotal), payments];
    });
    const itemRows = shift.sales.flatMap((sale) => sale.items.map((item) => {
      const unitCost = this.saleItemUnitCost(item); const totalCost = unitCost === null ? null : unitCost * Number(item.quantity);
      return [sale.receiptNo, sale.completedAt ?? sale.createdAt, item.product.sku, item.description || item.product.name, item.uom.name, Number(item.quantity), Number(item.baseQuantity), Number(item.unitPrice), Number(item.lineDiscount), Number(item.taxAmount), Number(item.lineTotal), unitCost ?? '', totalCost ?? '', totalCost === null ? '' : Number(item.lineTotal) - totalCost, sale.payments.map((payment) => payment.method).join('; ')];
    }));
    const businessDate = (shift.closedAt ?? new Date()).toISOString().slice(0, 10);
    const sheets: XlsxSheet[] = [
      { name: 'Daily Digest', widths: [26, 24, 24, 20], rows: [['RetailOS daily shift digest', '', '', ''], ['Business date', businessDate], ['Location', shift.location.name], ['Register', shift.register.name], ['Cashier', shift.cashier.name], ['Opened', shift.openedAt], ['Closed', shift.closedAt], ['Opening float', summary.openingFloat], ['Closing float', shift.closingFloat == null ? '' : Number(shift.closingFloat)], ['Expected cash', summary.expectedCash], ['Cash variance', summary.variance ?? ''], ['Completed orders', summary.salesCount], ['Gross sales', summary.grossSales], ['Discounts', summary.discountTotal], ['Returns', shift.processedReturns.reduce((sum, record) => sum + Number(record.total), 0)], ['Stock-shortage acknowledgement', acknowledgement ? 'Acknowledged' : stockShortages.length ? 'Required / not recorded' : 'Not applicable'], ['Acknowledged by', acknowledgement?.managerId ?? ''], ['Acknowledged at', acknowledgement?.acknowledgedAt ?? ''], [], ['Payment method', 'Net amount'], ...Object.entries(paymentTotals)], },
      { name: 'Orders', widths: [18, 21, 22, 18, 28, 14, 14, 14, 14, 42], rows: [['Receipt no.', 'Completed at', 'Cashier', 'Customer code', 'Customer', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment method(s)'], ...orderRows] },
      { name: 'Items Sold', widths: [18, 21, 18, 36, 14, 12, 14, 14, 14, 14, 14, 14, 14, 14, 30], rows: [['Receipt no.', 'Completed at', 'SKU', 'Item', 'UOM', 'Quantity', 'Base quantity', 'Unit price', 'Line discount', 'Tax', 'Line total', 'Unit cost', 'Total cost', 'Gross margin', 'Payment method(s)'], ...itemRows] },
      { name: 'Item Summary', widths: [18, 38, 14, 14, 14, 14, 14, 14, 14, 14], rows: [['SKU', 'Item', 'UOM', 'Quantity', 'Gross', 'Discount', 'Tax', 'Net sales', 'Total cost', 'Gross margin'], ...[...itemTotals.values()].sort((a, b) => a.description.localeCompare(b.description)).map((item) => [item.sku, item.description, item.uom, item.quantity, item.gross, item.discount, item.tax, item.net, item.costKnown ? item.totalCost : '', item.costKnown ? item.net - item.totalCost : ''])] },
      { name: 'Returns', widths: [18, 21, 18, 16, 24], rows: [['Type', 'Completed at', 'Total', 'Payment method(s)', 'Reference'], ...shift.processedReturns.map((record) => [record.type, record.createdAt, Number(record.total), record.payments.map((payment) => payment.method).join('; '), record.payments.map((payment) => payment.reference ?? '').filter(Boolean).join('; ')])] },
      { name: 'Cash Movements', widths: [18, 18, 18, 48], rows: [['Type', 'Amount', 'Created at', 'Reason'], ...shift.movements.map((movement) => [movement.type, Number(movement.amount), movement.createdAt, movement.reason])] },
      { name: 'Stock Follow-up', widths: [18, 36, 18, 20, 20, 16, 18, 18, 18], rows: [['Receipt no.', 'Product', 'SKU', 'Cashier', 'Pre-sale balance', 'Sold', 'Post-sale balance', 'Shortage introduced', 'Recorded at'], ...stockShortages.map((item) => [item.receiptNo, item.productName, item.sku, item.cashier, item.preSaleQuantity, item.soldQuantity, item.postSaleQuantity, item.shortageIntroduced, item.timestamp])] },
    ];
    const fileName = `retailos-daily-digest-${businessDate}-${shift.id}.xlsx`;
    const exportRoot = process.env.RETAILOS_EXPORT_DIR?.trim() || join(homedir(), 'Documents', 'RetailOS Exports');
    const filePath = join(exportRoot, fileName);
    await writeXlsx(filePath, sheets);
    return { fileName, filePath, businessDate, salesCount: shift.sales.length, itemCount: itemRows.length, salesTotal: summary.grossSales, paymentTotals };
  }

  private saleItemUnitCost(item: { product: { basePurchaseCost: Prisma.Decimal | null; purchasePrices: Array<{ uomId: string; amount: Prisma.Decimal }> }; uomId: string; uom: { conversionFactor: Prisma.Decimal } }) {
    const uomCost = item.product.purchasePrices.find((price) => price.uomId === item.uomId)?.amount;
    if (uomCost != null) return Number(uomCost);
    if (item.product.basePurchaseCost == null) return null;
    return Number(item.product.basePurchaseCost) * Number(item.uom.conversionFactor);
  }

  private async status(shiftId: string, companyId: string) {
    const shift = await this.db.shift.findFirst({ where: { id: shiftId, location: { companyId } }, include: { register: true, cashier: { select: { id: true, name: true } }, movements: { orderBy: { createdAt: 'desc' } } } });
    if (!shift) throw new NotFoundException('Shift not found');
    const [summary, stockShortages] = await Promise.all([this.summary(shift.id), this.stockShortagesForShift(shift.id, companyId)]);
    const { openingFloat: _openingFloat, closingFloat, ...shiftData } = shift;
    return { ...shiftData, ...summary, stockShortageCount: stockShortages.length, closingFloat: closingFloat == null ? null : Number(closingFloat), ...reconcileCash(summary) };
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

  private async stockShortagesForShift(shiftId: string, companyId: string) {
    const sales = await this.db.sale.findMany({ where: { shiftId, companyId, status: 'COMPLETED' }, select: { id: true, receiptNo: true, cashier: { select: { name: true } } } });
    if (!sales.length) return [];
    const bySale = new Map(sales.map((sale) => [sale.id, sale]));
    const logs = await this.db.auditLog.findMany({ where: { companyId, action: 'STOCK_SHORTAGE_SOLD', entityType: 'SaleItem', entityId: { in: sales.map((sale) => sale.id) } }, orderBy: { createdAt: 'asc' } });
    return logs.flatMap((log) => {
      if (!log.entityId) return [];
      const details = log.after && typeof log.after === 'object' && !Array.isArray(log.after) ? log.after as Record<string, unknown> : null;
      const sale = bySale.get(log.entityId);
      if (!details || !sale) return [];
      return [{ productId: String(details.productId || ''), sku: String(details.sku || ''), productName: String(details.productName || ''), receiptNo: String(details.receiptNo || sale.receiptNo), cashier: sale.cashier.name, preSaleQuantity: Number(details.preSaleQuantity ?? details.availableQuantity ?? 0), soldQuantity: Number(details.soldQuantity ?? 0), postSaleQuantity: Number(details.postSaleQuantity ?? 0), shortageIntroduced: Number(details.shortageIntroduced ?? details.shortageQuantity ?? 0), timestamp: String(details.timestamp || log.createdAt.toISOString()) }];
    });
  }

  private async stockShortageAcknowledgement(shiftId: string, companyId: string) {
    const closeAudit = await this.db.auditLog.findFirst({ where: { companyId, action: 'SHIFT_CLOSED', entityType: 'Shift', entityId: shiftId }, orderBy: { createdAt: 'desc' } });
    const metadata = closeAudit?.metadata && typeof closeAudit.metadata === 'object' && !Array.isArray(closeAudit.metadata) ? closeAudit.metadata as Record<string, unknown> : null;
    if (!metadata?.stockShortageAcknowledged) return null;
    return { acknowledged: true, managerId: String(metadata.approvedById || ''), acknowledgedAt: String(metadata.stockShortageAcknowledgedAt || closeAudit?.createdAt.toISOString() || '') };
  }
}
