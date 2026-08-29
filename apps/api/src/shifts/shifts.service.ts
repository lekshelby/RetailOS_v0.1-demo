import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { reconcileCash } from './shift-calculator';
import { CashMovementDto, CloseShiftDto, OpenShiftDto } from './dto/shift.dto';
import { BukkuAutoSyncService } from '../integrations/bukku/bukku-auto-sync.service';
import { ThermalPrinterService } from '../checkout/thermal-printer.service';

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
    const [summary, sales, returns, negativeStock] = await Promise.all([
      this.summary(shift.id),
      this.db.sale.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { receiptNo: true, grandTotal: true, discountTotal: true, completedAt: true, payments: { select: { method: true, amount: true, changeAmount: true } } }, orderBy: { completedAt: 'desc' } }),
      this.db.return.findMany({ where: { shiftId: shift.id, status: 'COMPLETED' }, select: { type: true, total: true, createdAt: true, payments: { select: { method: true, amount: true } } }, orderBy: { createdAt: 'desc' } }),
      this.negativeStockForShift(shift.id, shift.locationId),
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
    try {
      const print = await this.printReport(shift.id, input.companyId, manager.id);
      return { shiftId: shift.id, closedAt, ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock, reportPrint: print };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown printer error';
      await this.db.auditLog.create({ data: { companyId: input.companyId, actorId: manager.id, action: 'SHIFT_REPORT_AUTO_PRINT_FAILED', entityType: 'Shift', entityId: shift.id, after: { message } } });
      return { shiftId: shift.id, closedAt, ...summary, closingFloat: input.closingFloat, ...reconciliation, negativeStock, reportPrintError: message };
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
